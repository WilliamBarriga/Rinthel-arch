/**
 * `check-docs` — chequeo de la documentacion que se puede pudrir.
 *
 * Interfaz publica:
 * - `SECCIONES_README`: plantilla de README por paquete, fuente unica de verdad
 *   (la explica `docs/CODING.md`, "README de paquete").
 * - `revisarReadmes(raiz) -> Violacion[]`: revisa cada `packages/<paquete>/README.md`
 *   (todo paquete debe tenerlo; si falta, regla `seccion`) y devuelve las
 *   violaciones ordenadas. Vacio significa verde.
 *
 * Reglas de `revisarReadmes`:
 * - `seccion`: el README tiene un encabezado `## <seccion>` por cada entrada de la plantilla.
 * - `entrada`: la seccion "Archivo de entrada" nombra al menos una ruta entre
 *   comillas invertidas, y cada ruta existe (relativa a la raiz del repo).
 * - `probar`: la seccion "Probar" contiene `pnpm --filter <paquete> test`.
 *
 * - `revisarIndiceDeAdrs(raiz) -> Violacion[]`: cada `docs/adr/NNNN-*.md` aparece
 *   (por nombre de archivo) en `docs/adr/README.md`; regla `indice`.
 *
 * - `revisarEnlacesDeAgents(raiz) -> Violacion[]`: `AGENTS.md` nombra `docs/adr/README.md`
 *   y `docs/ramas.md`, y ambos archivos existen; regla `indice`.
 *
 * Los chequeos de indices se suman aqui con la misma forma: `revisarX(raiz) -> Violacion[]`.
 */
import { existsSync, readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';

export const SECCIONES_README = [
  'Que hace',
  'Que NO hace',
  'Depende de',
  'Archivo de entrada',
  'ADR relacionado',
  'Probar',
] as const;

export interface Violacion {
  archivo: string;
  regla: 'seccion' | 'entrada' | 'probar' | 'indice';
  mensaje: string;
}

/** Texto bajo `## <seccion>` hasta el siguiente `## `; `undefined` si falta el encabezado. */
function cuerpoDeSeccion(readme: string, seccion: string): string | undefined {
  const lineas = readme.split('\n');
  const inicio = lineas.findIndex((l) => l.trim() === `## ${seccion}`);
  if (inicio === -1) return undefined;
  const resto = lineas.slice(inicio + 1);
  const fin = resto.findIndex((l) => l.startsWith('## '));
  return (fin === -1 ? resto : resto.slice(0, fin)).join('\n');
}

export function revisarReadmes(raiz: string): Violacion[] {
  const violaciones: Violacion[] = [];
  const carpetaPaquetes = join(raiz, 'packages');
  if (!existsSync(carpetaPaquetes)) return violaciones;

  for (const paquete of readdirSync(carpetaPaquetes).sort()) {
    const archivo = `packages/${paquete}/README.md`;
    if (!existsSync(join(raiz, archivo))) {
      violaciones.push({ archivo, regla: 'seccion', mensaje: 'falta el README del paquete' });
      continue;
    }
    const readme = readFileSync(join(raiz, archivo), 'utf8');
    const violar = (regla: Violacion['regla'], mensaje: string) =>
      violaciones.push({ archivo, regla, mensaje });

    for (const seccion of SECCIONES_README) {
      if (cuerpoDeSeccion(readme, seccion) === undefined) {
        violar('seccion', `falta la seccion "## ${seccion}"`);
      }
    }

    const entrada = cuerpoDeSeccion(readme, 'Archivo de entrada');
    if (entrada !== undefined) {
      const rutas = [...entrada.matchAll(/`([^`]+)`/g)].map((m) => m[1]);
      if (rutas.length === 0) {
        violar('entrada', 'la seccion de entrada no nombra ningun archivo entre comillas invertidas');
      }
      for (const ruta of rutas) {
        if (!existsSync(join(raiz, ruta))) violar('entrada', `el archivo de entrada "${ruta}" no existe`);
      }
    }

    const probar = cuerpoDeSeccion(readme, 'Probar');
    if (probar !== undefined && !probar.includes(`pnpm --filter ${paquete} test`)) {
      violar('probar', `la seccion "Probar" no contiene "pnpm --filter ${paquete} test"`);
    }
  }
  return violaciones;
}

/** Cada ADR de `docs/adr/` debe nombrarse en el indice `docs/adr/README.md`. */
export function revisarIndiceDeAdrs(raiz: string): Violacion[] {
  const carpeta = join(raiz, 'docs/adr');
  if (!existsSync(carpeta)) return [];
  const adrs = readdirSync(carpeta)
    .filter((f) => /^\d{4}-.+\.md$/.test(f))
    .sort();
  if (adrs.length === 0) return [];

  const rutaIndice = 'docs/adr/README.md';
  if (!existsSync(join(raiz, rutaIndice))) {
    return [{ archivo: rutaIndice, regla: 'indice', mensaje: 'falta el indice de ADRs' }];
  }
  const indice = readFileSync(join(raiz, rutaIndice), 'utf8');
  return adrs
    .filter((adr) => !indice.includes(adr))
    .map((adr) => ({
      archivo: `docs/adr/${adr}`,
      regla: 'indice' as const,
      mensaje: `el ADR no aparece en ${rutaIndice}`,
    }));
}

const INDICES_DE_AGENTS = ['docs/adr/README.md', 'docs/ramas.md'] as const;

/** `AGENTS.md` debe enlazar el indice de ADRs y el de ramas, y ambos archivos deben existir. */
export function revisarEnlacesDeAgents(raiz: string): Violacion[] {
  const archivo = 'AGENTS.md';
  if (!existsSync(join(raiz, archivo))) {
    return [{ archivo, regla: 'indice', mensaje: 'falta AGENTS.md' }];
  }
  const agents = readFileSync(join(raiz, archivo), 'utf8');
  const sinEnlace = INDICES_DE_AGENTS.filter((indice) => !agents.includes(indice)).map((indice) => ({
    archivo,
    regla: 'indice' as const,
    mensaje: `AGENTS.md no enlaza ${indice}`,
  }));
  const inexistentes = INDICES_DE_AGENTS.filter((indice) => !existsSync(join(raiz, indice))).map((indice) => ({
    archivo: indice,
    regla: 'indice' as const,
    mensaje: 'falta el archivo que AGENTS.md enlaza',
  }));
  return [...sinEnlace, ...inexistentes];
}
