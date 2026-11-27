/**
 * Chequeo de la documentacion que se puede pudrir; cada `revisarX(raiz) -> Violacion[]` devuelve violaciones ordenadas.
 * `revisarReadmes`: cada `packages/<paquete>/README.md` existe y tiene las `SECCIONES_README` (`seccion`), sus rutas de
 * "Entry file" existen (`entrada`) y "Test" contiene `pnpm --filter <paquete> test` (`probar`).
 * `revisarIndiceDeAdrs`: cada `docs/adr/NNNN-*.md` aparece en `docs/adr/README.md` (`indice`).
 * `revisarEnlacesDeAgents`: `AGENTS.md` nombra `docs/adr/README.md` y `docs/research-branches.md`, y ambos existen (`indice`).
 * `revisarParesDeGuias`: cada `docs/guide/<x>.md` (ingles, fuente) tiene `docs/guia/<x>.md` (espanol) y al reves (`par`); la primera
 * linea de cada uno enlaza a su par (`enlace`); mismo numero de `## ` (`encabezados`) y bloques de codigo identicos (`codigo`).
 * `revisarGlosario`: cada entrada de `CONTEXT.md` (linea `**X**...:`) se encabeza `**English** (es: **Spanish**):` (`glosario`).
 */
import { existsSync, readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';

export const SECCIONES_README = [
  'What it does',
  'What it does not do',
  'Depends on',
  'Entry file',
  'Related ADR',
  'Test',
] as const;

export interface Violacion {
  archivo: string;
  regla: 'seccion' | 'entrada' | 'probar' | 'indice' | 'par' | 'enlace' | 'encabezados' | 'codigo' | 'glosario';
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

    const entrada = cuerpoDeSeccion(readme, 'Entry file');
    if (entrada !== undefined) {
      const rutas = [...entrada.matchAll(/`([^`]+)`/g)].map((m) => m[1]);
      if (rutas.length === 0) {
        violar('entrada', 'la seccion de entrada no nombra ningun archivo entre comillas invertidas');
      }
      for (const ruta of rutas) {
        if (!existsSync(join(raiz, ruta))) violar('entrada', `el archivo de entrada "${ruta}" no existe`);
      }
    }

    const probar = cuerpoDeSeccion(readme, 'Test');
    if (probar !== undefined && !probar.includes(`pnpm --filter ${paquete} test`)) {
      violar('probar', `la seccion "Test" no contiene "pnpm --filter ${paquete} test"`);
    }
  }
  return violaciones;
}

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

const INDICES_DE_AGENTS = ['docs/adr/README.md', 'docs/research-branches.md'] as const;

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

const CARPETA_INGLES = 'docs/guide';
const CARPETA_ESPANOL = 'docs/guia';

/** Encabezados `## ` y bloques de codigo (con su fence) de un Markdown; ignora los `## ` dentro de un bloque. */
function estructuraDeGuia(texto: string): { encabezados: number; bloques: string[] } {
  let encabezados = 0;
  const bloques: string[] = [];
  let actual: string[] | undefined;
  for (const linea of texto.split('\n')) {
    if (linea.startsWith('```')) {
      if (actual === undefined) actual = [linea];
      else {
        bloques.push([...actual, linea].join('\n'));
        actual = undefined;
      }
    } else if (actual !== undefined) actual.push(linea);
    else if (linea.startsWith('## ')) encabezados += 1;
  }
  return { encabezados, bloques };
}

const mdDe = (raiz: string, carpeta: string): string[] =>
  existsSync(join(raiz, carpeta)) ? readdirSync(join(raiz, carpeta)).filter((f) => f.endsWith('.md')).sort() : [];

export function revisarParesDeGuias(raiz: string): Violacion[] {
  const violaciones: Violacion[] = [];
  const ingles = mdDe(raiz, CARPETA_INGLES);
  const espanol = mdDe(raiz, CARPETA_ESPANOL);
  const lados = [
    { carpeta: CARPETA_INGLES, archivos: ingles, otra: CARPETA_ESPANOL, existentes: espanol },
    { carpeta: CARPETA_ESPANOL, archivos: espanol, otra: CARPETA_INGLES, existentes: ingles },
  ];
  for (const { carpeta, archivos, otra, existentes } of lados) {
    const destino = otra.slice('docs/'.length);
    for (const nombre of archivos) {
      const archivo = `${carpeta}/${nombre}`;
      if (!existentes.includes(nombre)) {
        violaciones.push({ archivo, regla: 'par', mensaje: `falta el par ${otra}/${nombre}` });
        continue;
      }
      const primera = readFileSync(join(raiz, archivo), 'utf8').split('\n').find((l) => l.trim() !== '') ?? '';
      if (!primera.includes(`](../${destino}/${nombre})`)) {
        violaciones.push({ archivo, regla: 'enlace', mensaje: `la primera linea no enlaza a ../${destino}/${nombre}` });
      }
    }
  }
  for (const nombre of ingles.filter((n) => espanol.includes(n))) {
    const a = estructuraDeGuia(readFileSync(join(raiz, CARPETA_INGLES, nombre), 'utf8'));
    const b = estructuraDeGuia(readFileSync(join(raiz, CARPETA_ESPANOL, nombre), 'utf8'));
    const archivo = `${CARPETA_INGLES}/${nombre}`;
    if (a.encabezados !== b.encabezados) {
      violaciones.push({ archivo, regla: 'encabezados', mensaje: `${a.encabezados} encabezados "## " en ingles y ${b.encabezados} en espanol` });
    }
    if (a.bloques.length !== b.bloques.length) {
      violaciones.push({ archivo, regla: 'codigo', mensaje: `${a.bloques.length} bloques de codigo en ingles y ${b.bloques.length} en espanol` });
    } else {
      const i = a.bloques.findIndex((bloque, k) => bloque !== b.bloques[k]);
      if (i !== -1) violaciones.push({ archivo, regla: 'codigo', mensaje: `el bloque de codigo ${i + 1} difiere entre idiomas` });
    }
  }
  return violaciones;
}

const ENTRADA_DE_GLOSARIO = /^\*\*[^*]+\*\* \(es: \*\*[^*]+\*\*\):$/;

export function revisarGlosario(raiz: string): Violacion[] {
  const archivo = 'CONTEXT.md';
  if (!existsSync(join(raiz, archivo))) return [];
  return readFileSync(join(raiz, archivo), 'utf8')
    .split('\n')
    .map((linea) => linea.trimEnd())
    .filter((linea) => linea.startsWith('**') && linea.endsWith(':'))
    .filter((linea) => !ENTRADA_DE_GLOSARIO.test(linea))
    .map((linea) => ({
      archivo,
      regla: 'glosario' as const,
      mensaje: `la entrada "${linea}" no sigue "**English** (es: **Spanish**):"`,
    }));
}
