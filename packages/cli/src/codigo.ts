/**
 * Adaptador de compilacion de los Componentes de Tema (ADR 0008): lee los `.tsx`
 * del Workspace y los compila con esbuild. Es el unico lugar del CLI que toca
 * codigo del Workspace, y no lo ejecuta: solo lo transforma.
 *
 * `compiladorDeCodigo(raiz).compilar()` da, en un `ResultadoDeCodigo`:
 * - `componentes`: nombre -> interfaz (los exports con nombre en mayuscula de cada
 *   `.tsx`), el registro que `sesion` usa para comprobar la interfaz en `validate`;
 * - `issues`: errores de compilacion (`E_THEME_CODE_COMPILE`, con `file` y `line`
 *   del error) y componentes repetidos (`E_THEME_COMPONENT_DUPLICATE`);
 * - `bundle`: cuerpo de una funcion `(require) => exports` con todos los modulos en
 *   CommonJS, para que el navegador (`navegador/componentes.ts`) lo registre.
 *
 * Conserva el ultimo bueno de cada archivo: si un `.tsx` deja de compilar, su version
 * anterior sigue en `componentes` y `bundle` (el visor conserva el ultimo dibujo bueno) y el
 * error sale como issue. Memoiza por hash de contenido: un Workspace igual devuelve el mismo
 * objeto. Un Workspace inexistente o sin `.tsx` no tiene componentes ni issues.
 */
import { createHash } from 'node:crypto';
import { readdirSync, readFileSync } from 'node:fs';
import { join, relative, sep } from 'node:path';

import { buildSync } from 'esbuild';
import type { BuildOptions, Message } from 'esbuild';

import { CODIGOS } from 'canonico';
import type { Issue } from 'canonico';
import type { InterfazDeComponente } from 'sesion';

export interface ResultadoDeCodigo {
  componentes: Readonly<Record<string, InterfazDeComponente>>;
  issues: readonly Issue[];
  bundle: string;
}

interface ModuloCompilado {
  cjs: string;
  exportados: readonly string[];
}

const CARPETAS_IGNORADAS = new Set(['node_modules', 'dist']);
const EXTERNOS = ['react', 'react/jsx-runtime', 'react/jsx-dev-runtime'];
const esComponente = (nombre: string): boolean => /^[A-Z][A-Za-z0-9_]*$/.test(nombre);

/** Rutas de los `.tsx` bajo `raiz` (relativas, con `/`, ordenadas); vacio si la raiz no se puede leer. */
function rutasDeTsx(raiz: string): string[] {
  const rutas: string[] = [];
  const visitar = (carpeta: string): void => {
    for (const entrada of readdirSync(carpeta, { withFileTypes: true })) {
      if (entrada.name.startsWith('.') || CARPETAS_IGNORADAS.has(entrada.name)) continue;
      const ruta = join(carpeta, entrada.name);
      if (entrada.isDirectory()) visitar(ruta);
      else if (entrada.name.endsWith('.tsx')) rutas.push(relative(raiz, ruta).split(sep).join('/'));
    }
  };
  try {
    visitar(raiz);
  } catch {
    return [];
  }
  return rutas.sort();
}

const comunes = (raiz: string, ruta: string): BuildOptions => ({
  entryPoints: [ruta],
  absWorkingDir: raiz,
  bundle: true,
  write: false,
  platform: 'browser',
  target: 'es2020',
  jsx: 'automatic',
  external: EXTERNOS,
  logLevel: 'silent',
  charset: 'ascii',
  legalComments: 'none',
});

const issueDeEsbuild = (mensaje: Message, rutaPorDefecto: string): Issue => ({
  code: CODIGOS.E_THEME_CODE_COMPILE,
  severity: 'error',
  file: mensaje.location?.file.split(sep).join('/') ?? rutaPorDefecto,
  line: mensaje.location?.line ?? 1,
  column: (mensaje.location?.column ?? 0) + 1,
  message: `No compila el componente: ${mensaje.text}`,
});

/** Compila un `.tsx`: sus exports con nombre (build ESM) y su CommonJS para el navegador; o los errores de esbuild. */
function compilarArchivo(raiz: string, ruta: string): { modulo: ModuloCompilado } | { errores: Issue[] } {
  try {
    const esm = buildSync({ ...comunes(raiz, ruta), format: 'esm', metafile: true });
    const salida = Object.values(esm.metafile?.outputs ?? {})[0];
    const cjs = buildSync({ ...comunes(raiz, ruta), format: 'cjs' }).outputFiles?.[0]?.text ?? '';
    return { modulo: { cjs, exportados: (salida?.exports ?? []).filter(esComponente) } };
  } catch (error) {
    const mensajes = (error as { errors?: Message[] }).errors;
    return { errores: mensajes === undefined || mensajes.length === 0 ? [{ code: CODIGOS.E_THEME_CODE_COMPILE, severity: 'error', file: ruta, line: 1, column: 1, message: `No compila el componente: ${(error as Error).message}` }] : mensajes.map((m) => issueDeEsbuild(m, ruta)) };
  }
}

/** Cuerpo de una funcion `(require) => exports` que une los modulos CommonJS de cada archivo. */
const unirModulos = (modulos: ReadonlyArray<[string, ModuloCompilado]>): string =>
  [
    'var salida = {};',
    ...modulos.map(([, { cjs }]) => `Object.assign(salida, (function () { var module = { exports: {} }; var exports = module.exports;\n${cjs}\nreturn module.exports; })());`),
    'return salida;',
  ].join('\n');

const huellaDe = (raiz: string, rutas: readonly string[]): string => {
  const hash = createHash('sha256');
  for (const ruta of rutas) hash.update(ruta).update('\0').update(readFileSync(join(raiz, ...ruta.split('/')))).update('\0');
  return hash.digest('hex');
};

export function compiladorDeCodigo(raiz: string): { compilar(): ResultadoDeCodigo } {
  /** Ultimo modulo bueno de cada archivo. */
  const buenos = new Map<string, ModuloCompilado>();
  let ultimo: { huella: string; resultado: ResultadoDeCodigo } | undefined;
  return {
    compilar() {
      const rutas = rutasDeTsx(raiz);
      let huella: string;
      try {
        huella = huellaDe(raiz, rutas);
      } catch {
        return ultimo?.resultado ?? { componentes: {}, issues: [], bundle: unirModulos([]) };
      }
      if (ultimo?.huella === huella) return ultimo.resultado;

      const issues: Issue[] = [];
      for (const ruta of rutas) {
        const compilado = compilarArchivo(raiz, ruta);
        if ('modulo' in compilado) buenos.set(ruta, compilado.modulo);
        else issues.push(...compilado.errores);
      }
      for (const ruta of [...buenos.keys()]) if (!rutas.includes(ruta)) buenos.delete(ruta);

      const componentes: Record<string, InterfazDeComponente> = {};
      const dueno = new Map<string, string>();
      for (const [ruta, { exportados }] of [...buenos].sort(([a], [b]) => a.localeCompare(b))) {
        for (const nombre of exportados) {
          const previo = dueno.get(nombre);
          if (previo !== undefined) {
            issues.push({ code: CODIGOS.E_THEME_COMPONENT_DUPLICATE, severity: 'error', file: ruta, line: 1, column: 1, message: `El componente '${nombre}' ya lo exporta '${previo}'`, related: [{ file: previo, line: 1, column: 1, message: `Primer '${nombre}'` }] });
            continue;
          }
          dueno.set(nombre, ruta);
          componentes[nombre] = {};
        }
      }
      const resultado = { componentes, issues, bundle: unirModulos([...buenos].sort(([a], [b]) => a.localeCompare(b))) };
      ultimo = { huella, resultado };
      return resultado;
    },
  };
}
