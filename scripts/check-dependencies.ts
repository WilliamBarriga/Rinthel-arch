/**
 * `revisarWorkspace(raiz) -> Violacion[]`: escanea `packages/*` (fuente, tests, configs y `package.json`) y devuelve
 * las violaciones ordenadas por paquete, archivo, regla y mensaje; vacio es verde. Solo lee; ignora comentarios.
 * Reglas:
 * - `cadena`: el paquete esta en `CADENA`. `orden`: solo importa de paquetes anteriores en `CADENA`.
 * - `interno`: de otro paquete solo se importa su nombre o lo que declara `exports`; un import relativo no sale del paquete,
 *   salvo desde las pruebas hacia las ayudas compartidas de `AYUDAS_DE_PRUEBA`.
 * - `declaracion`: todo paquete del workspace importado esta en `dependencies` o `peerDependencies`.
 * - `exports`: la superficie publica es la entrada `.` mas, solo en los paquetes de `SUBPATHS_PERMITIDOS`, esos subpaths.
 * - `pureza`: el codigo fuente de `NUCLEO` no importa modulos de Node ni usa reloj, azar, `process`, red ni DOM.
 * - `reexporte`: ningun archivo hace `export ... from` de otro paquete del workspace, salvo los de `REEXPORTES_PERMITIDOS`.
 * - `aislado`: un paquete de `AISLADOS` queda fuera de `CADENA`, no importa ningun paquete del workspace y solo lo
 *   importan los paquetes que `AISLADOS` le asigna.
 * Ademas revisa las carpetas de `CARPETAS_DE_RAIZ` (paquete `(raiz)`) con la regla `interno`: de un paquete solo usan
 * su nombre o lo que declara `exports`, nunca un archivo suyo por ruta relativa.
 * Errores: un `package.json` ilegible o invalido lanza; uno ausente se ignora.
 */
import { builtinModules } from 'node:module';
import { existsSync, readFileSync, readdirSync } from 'node:fs';
import { dirname, join, relative, resolve } from 'node:path';

/** Orden de dependencias (ADR 0004): un paquete solo importa de los anteriores. */
export const CADENA = ['canonical', 'theme', 'dsl', 'layout', 'session', 'render', 'shell', 'dev-ui', 'cli'] as const;

/**
 * Subpaths publicos ademas de `.` (ADR 0004, enmienda `dev-ui`): `protocol` es el contrato de `dev` del que `cli`
 * importa tipos sin cargar la app de navegador; `contract` es la suite de pruebas compartida; `build` arma el bundle
 * de la app (lo usa el bench). Ningun otro paquete los tiene.
 */
export const SUBPATHS_PERMITIDOS: Readonly<Record<string, readonly string[]>> = {
  'dev-ui': ['./protocol', './contract', './build'],
};

/**
 * Archivos que pueden reexportar de otro paquete (ruta relativa a la raiz del repo): `dev-ui/protocol` junta el
 * contrato de `dev` para la app y `cli`; la fachada publica de `shell` ofrece a sus consumidores los tipos de su interfaz.
 * Fuera de ellos, cada nombre se importa del paquete dueno, sin segundos caminos.
 */
export const REEXPORTES_PERMITIDOS: readonly string[] = ['packages/dev-ui/src/protocol.ts', 'packages/shell/src/index.ts'];

/**
 * Packages outside `CADENA` (ADR 0010): they import no workspace package and only the listed packages import them.
 * `scanner` reads a codebase without knowing the core; only `cli` uses it.
 */
export const AISLADOS: Readonly<Record<string, readonly string[]>> = {
  scanner: ['cli'],
};

/** Carpeta raiz (relativa al repo) de las ayudas de prueba compartidas entre paquetes; solo la importan pruebas. */
export const AYUDAS_DE_PRUEBA = 'tests/ayudas';

/** Carpetas raiz (relativas al repo) que consumen paquetes como un cliente mas: solo por su interfaz declarada. */
export const CARPETAS_DE_RAIZ = ['scripts', 'bench'] as const;

/** Nombre con el que se reportan las violaciones de `CARPETAS_DE_RAIZ`. */
const RAIZ = '(raiz)';

/** Nucleo puro: sin I/O, sin reloj, sin estado global. */
export const NUCLEO = ['canonical', 'theme', 'dsl', 'session', 'render'] as const;

const IMPUREZAS: ReadonlyArray<readonly [RegExp, string]> = [
  [/\bnew Date\b|\bDate\.now\b|\bperformance\.now\b/, 'reloj'],
  [/\bMath\.random\b|\bcrypto\.(?:randomUUID|getRandomValues)\b/, 'azar'],
  [/\bprocess\.|\bglobalThis\b/, 'estado global del proceso'],
  [/\bfetch\(|\bXMLHttpRequest\b|\bnew Worker\b/, 'red o workers'],
  [/\b(?:window|document|localStorage|sessionStorage)\./, 'DOM'],
];

const MODULOS_DE_NODE = new Set(builtinModules);

export type Regla = 'cadena' | 'orden' | 'interno' | 'declaracion' | 'exports' | 'pureza' | 'reexporte' | 'aislado';

export interface Violacion {
  readonly paquete: string;
  readonly archivo: string;
  readonly regla: Regla;
  readonly mensaje: string;
}

interface Manifiesto {
  readonly name?: string;
  readonly exports?: unknown;
  readonly dependencies?: Record<string, string>;
  readonly peerDependencies?: Record<string, string>;
}

interface Paquete {
  readonly nombre: string;
  readonly carpeta: string;
  readonly manifiesto: Manifiesto;
}

const CARPETAS_IGNORADAS = new Set(['node_modules', 'dist', 'coverage', '.git']);
const ARCHIVOS_IGNORADOS = /^tsup\.config\.|^vitest\.config\./;
const EXTENSIONES_DE_CODIGO = ['.ts', '.tsx', '.mts', '.cts'];
const RE_REEXPORTE = /\bexport\s+(?:type\s+)?(?:\*(?:\s+as\s+[\w$]+)?|\{[^}]*\})\s*from\s*(['"])([^'"\n]+)\1/g;
const RE_ESPECIFICADOR = /(?:\bfrom\s*|\bimport\s*\(?\s*|\brequire\s*\(\s*)(['"])([^'"\n]+)\1/g;

export function revisarWorkspace(raiz: string): Violacion[] {
  const paquetes = cargarPaquetes(raiz);
  const violaciones: Violacion[] = [];
  for (const paquete of paquetes) {
    violaciones.push(...revisarManifiesto(paquete));
    for (const archivo of archivosDe(paquete.carpeta)) {
      violaciones.push(...revisarArchivo(raiz, paquete, archivo, paquetes));
    }
  }
  for (const carpeta of CARPETAS_DE_RAIZ) {
    if (!existsSync(join(raiz, carpeta))) continue;
    for (const archivo of archivosDe(join(raiz, carpeta))) {
      violaciones.push(...revisarArchivoDeRaiz(raiz, archivo, paquetes));
    }
  }
  return violaciones;
}

/** Un archivo de `CARPETAS_DE_RAIZ`: ningun import relativo entra a un paquete y ningun subpath sale de su `exports`. */
function revisarArchivoDeRaiz(raiz: string, archivo: string, paquetes: Paquete[]): Violacion[] {
  const relativo = relative(raiz, archivo).split('\\').join('/');
  const violaciones: Violacion[] = [];
  for (const especificador of extraerEspecificadores(sinComentarios(readFileSync(archivo, 'utf8')))) {
    if (especificador.startsWith('.')) {
      const dueno = paquetes.find((otro) => dentroDe(resolve(dirname(archivo), especificador), otro.carpeta));
      if (dueno !== undefined) {
        violaciones.push({
          paquete: RAIZ,
          archivo: relativo,
          regla: 'interno',
          mensaje: `import relativo "${especificador}" entra a ${dueno.nombre}; importalo por su nombre o por lo que declara su exports`,
        });
      }
      continue;
    }
    const importado = nombreDePaquete(especificador);
    const destino = paquetes.find((otro) => otro.nombre === importado);
    const subpath = especificador.slice(importado.length);
    if (destino !== undefined && subpath !== '' && !clavesDeExports(destino.manifiesto).includes(`.${subpath}`)) {
      violaciones.push({
        paquete: RAIZ,
        archivo: relativo,
        regla: 'interno',
        mensaje: `importa "${especificador}"; de ${importado} solo se importa por nombre y por lo que declara su exports`,
      });
    }
  }
  return violaciones;
}

function cargarPaquetes(raiz: string): Paquete[] {
  let entradas: string[];
  try {
    entradas = readdirSync(join(raiz, 'packages'));
  } catch {
    return [];
  }
  const paquetes: Paquete[] = [];
  for (const entrada of entradas.sort()) {
    const carpeta = join(raiz, 'packages', entrada);
    let texto: string;
    try {
      texto = readFileSync(join(carpeta, 'package.json'), 'utf8');
    } catch {
      continue;
    }
    paquetes.push({
      nombre: entrada,
      carpeta,
      manifiesto: JSON.parse(texto) as Manifiesto,
    });
  }
  return paquetes;
}

function revisarManifiesto(paquete: Paquete): Violacion[] {
  const violaciones: Violacion[] = [];
  const nombre = paquete.manifiesto.name ?? paquete.nombre;
  const archivo = 'package.json';
  if (!(CADENA as readonly string[]).includes(nombre) && !(nombre in AISLADOS)) {
    violaciones.push({
      paquete: nombre,
      archivo,
      regla: 'cadena',
      mensaje: `paquete fuera de la cadena declarada (${CADENA.join(' -> ')}); anadelo a CADENA o renombralo`,
    });
  }
  const claves = clavesDeExports(paquete.manifiesto);
  const permitidas = ['.', ...(SUBPATHS_PERMITIDOS[nombre] ?? [])];
  const sobrantes = claves.filter((clave) => !permitidas.includes(clave));
  if (!claves.includes('.') || sobrantes.length > 0) {
    violaciones.push({
      paquete: nombre,
      archivo,
      regla: 'exports',
      mensaje: `exports debe declarar la entrada raiz "." y solo ${permitidas.join(', ')}; declarado: ${
        claves.length > 0 ? claves.join(', ') : '(ausente)'
      }`,
    });
  }
  return violaciones;
}

function revisarArchivo(
  raiz: string,
  paquete: Paquete,
  archivo: string,
  paquetes: Paquete[],
): Violacion[] {
  const nombre = paquete.manifiesto.name ?? paquete.nombre;
  const texto = sinComentarios(readFileSync(archivo, 'utf8'));
  const relativo = relative(raiz, archivo);
  const violaciones: Violacion[] = [];

  const esNucleo = (NUCLEO as readonly string[]).includes(nombre) && !esDeTest(relativo);
  if (esNucleo) {
    for (const [patron, causa] of IMPUREZAS) {
      if (patron.test(texto)) {
        violaciones.push({
          paquete: nombre,
          archivo: relativo,
          regla: 'pureza',
          mensaje: `el nucleo no usa ${causa}; recibelo como argumento o muevelo a un adaptador`,
        });
      }
    }
  }

  for (const especificador of extraerEspecificadores(texto)) {
    if (esNucleo && (especificador.startsWith('node:') || MODULOS_DE_NODE.has(especificador))) {
      violaciones.push({
        paquete: nombre,
        archivo: relativo,
        regla: 'pureza',
        mensaje: `el nucleo no importa "${especificador}" (I/O); recibelo como puerto desde un adaptador`,
      });
    }
    if (especificador.startsWith('.')) {
      const destino = resolve(dirname(archivo), especificador);
      const dueno = paquetes.find((otro) => dentroDe(destino, otro.carpeta));
      const ayudaDePrueba = esDeTest(relativo) && dentroDe(destino, join(raiz, AYUDAS_DE_PRUEBA));
      if (!ayudaDePrueba && (dueno === undefined || dueno.nombre !== paquete.nombre)) {
        violaciones.push({
          paquete: nombre,
          archivo: relativo,
          regla: 'interno',
          mensaje: `import relativo "${especificador}" sale de ${nombre}; otro paquete se importa por su nombre`,
        });
      }
      continue;
    }

    const importado = nombreDePaquete(especificador);
    const destino = paquetes.find((otro) => otro.nombre === importado);
    if (destino === undefined) {
      continue;
    }

    if (importado !== nombre && nombre in AISLADOS) {
      violaciones.push({
        paquete: nombre,
        archivo: relativo,
        regla: 'aislado',
        mensaje: `${nombre} is outside the chain and imports no workspace package; it imports ${importado}`,
      });
    }
    const importadores = AISLADOS[importado];
    if (importado !== nombre && importadores !== undefined && !importadores.includes(nombre)) {
      violaciones.push({
        paquete: nombre,
        archivo: relativo,
        regla: 'aislado',
        mensaje: `${nombre} imports ${importado}; only ${importadores.join(', ')} may import it`,
      });
    }

    const mia = (CADENA as readonly string[]).indexOf(nombre);
    const suya = (CADENA as readonly string[]).indexOf(importado);
    if (mia >= 0 && suya > mia) {
      violaciones.push({
        paquete: nombre,
        archivo: relativo,
        regla: 'orden',
        mensaje: `${nombre} importa de ${importado}, que esta despues en la cadena (${CADENA.join(' -> ')})`,
      });
    }

    const subpath = especificador.slice(importado.length);
    if (subpath !== '' && !clavesDeExports(destino.manifiesto).includes(`.${subpath}`)) {
      violaciones.push({
        paquete: nombre,
        archivo: relativo,
        regla: 'interno',
        mensaje: `importa "${especificador}"; de ${importado} solo se importa por nombre y por lo que declara su exports`,
      });
    }

    const declaradas = {
      ...paquete.manifiesto.dependencies,
      ...paquete.manifiesto.peerDependencies,
    };
    if (importado !== nombre && !(importado in declaradas)) {
      violaciones.push({
        paquete: nombre,
        archivo: relativo,
        regla: 'declaracion',
        mensaje: `importa ${importado} sin declararlo en dependencies o peerDependencies`,
      });
    }
  }

  if (!REEXPORTES_PERMITIDOS.includes(relativo.split('\\').join('/'))) {
    for (const coincidencia of texto.matchAll(RE_REEXPORTE)) {
      const importado = nombreDePaquete(coincidencia[2]);
      if (importado !== nombre && paquetes.some((otro) => otro.nombre === importado)) {
        violaciones.push({
          paquete: nombre,
          archivo: relativo,
          regla: 'reexporte',
          mensaje: `reexporta de ${importado}; quien lo usa lo importa de ${importado} directamente`,
        });
      }
    }
  }

  return violaciones;
}

function esDeTest(ruta: string): boolean {
  return /(^|\/)(test|tests|__tests__)\//.test(ruta) || /\.(test|spec)\.[cm]?tsx?$/.test(ruta);
}

function clavesDeExports(manifiesto: Manifiesto): string[] {
  const exports = manifiesto.exports;
  if (typeof exports !== 'object' || exports === null || Array.isArray(exports)) {
    return [];
  }
  return Object.keys(exports);
}

function nombreDePaquete(especificador: string): string {
  const partes = especificador.split('/');
  if (especificador.startsWith('@')) {
    return partes.length >= 2 ? `${partes[0]}/${partes[1]}` : especificador;
  }
  return partes[0];
}

function dentroDe(ruta: string, carpeta: string): boolean {
  const rel = relative(carpeta, ruta);
  return rel === '' || (!rel.startsWith('..') && rel !== '..' && !rel.startsWith(`..${'/'}`));
}

function archivosDe(carpeta: string): string[] {
  const encontrados: string[] = [];
  const pendientes = [carpeta];
  while (pendientes.length > 0) {
    const actual = pendientes.pop() as string;
    for (const entrada of readdirSync(actual, { withFileTypes: true }).sort((a, b) =>
      a.name.localeCompare(b.name),
    )) {
      const ruta = join(actual, entrada.name);
      if (entrada.isDirectory()) {
        if (!CARPETAS_IGNORADAS.has(entrada.name)) {
          pendientes.push(ruta);
        }
      } else if (
        entrada.isFile() &&
        EXTENSIONES_DE_CODIGO.some((extension) => entrada.name.endsWith(extension)) &&
        !entrada.name.endsWith('.d.ts') &&
        !ARCHIVOS_IGNORADOS.test(entrada.name)
      ) {
        encontrados.push(ruta);
      }
    }
  }
  return encontrados.sort();
}

function extraerEspecificadores(texto: string): string[] {
  const especificadores: string[] = [];
  for (const coincidencia of texto.matchAll(RE_ESPECIFICADOR)) {
    especificadores.push(coincidencia[2]);
  }
  return especificadores;
}

/** Aparta las cadenas antes de quitar comentarios: un `//` dentro de una cadena no es comentario. */
function sinComentarios(texto: string): string {
  const placeholders: string[] = [];
  const conPlaceholders = texto
    .replace(/(?:'[^'\\]*(?:\\.[^'\\]*)*'|"[^"\\]*(?:\\.[^"\\]*)*"|`[^`]*`)/g, (
      match,
    ) => `__STR${placeholders.push(match) - 1}__`);
  const sinComentarios = conPlaceholders
    .replace(/\/\/.*$/gm, '  ')
    .replace(/\/\*[\s\S]*?\*\//g, '  ');
  return sinComentarios.replace(/__STR(\d+)__/g, (_, i) => placeholders[Number(i)]);
}
