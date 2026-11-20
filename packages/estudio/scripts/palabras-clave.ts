/**
 * Palabras clave del resaltado del editor, extraidas en build de la gramatica de `dsl` (research `editor-dsl-ui`): asi
 * el navegador no carga Langium. `generarPalabrasClave()` reescribe `navegador/editor/palabras-clave.ts` si cambio;
 * una prueba falla si la lista commiteada se desvia de la gramatica.
 */
import { readFileSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

const GRAMATICA = fileURLToPath(new URL('../../dsl/src/gramatica/diagramas.langium', import.meta.url));
const DESTINO = fileURLToPath(new URL('../navegador/editor/palabras-clave.ts', import.meta.url));

/** Los literales con forma de palabra (`'view'`, `'ease-in-out'`), sin repetir y en orden alfabetico. */
export function palabrasClaveDeGramatica(gramatica: string): string[] {
  const palabras = new Set<string>();
  for (const [, palabra] of gramatica.matchAll(/'([a-z][a-z-]*)'/g)) palabras.add(palabra as string);
  return [...palabras].sort();
}

export function moduloDePalabrasClave(palabras: readonly string[]): string {
  const lineas = palabras.map((p) => `  '${p}',`).join('\n');
  return `/** Generado por \`scripts/palabras-clave.ts\` en el build de \`estudio\` desde la gramatica de \`dsl\`; no editar a mano. */\nexport const PALABRAS_CLAVE: readonly string[] = [\n${lineas}\n];\n`;
}

export function generarPalabrasClave(): void {
  const modulo = moduloDePalabrasClave(palabrasClaveDeGramatica(readFileSync(GRAMATICA, 'utf8')));
  let actual: string | undefined;
  try {
    actual = readFileSync(DESTINO, 'utf8');
  } catch {
    actual = undefined;
  }
  if (actual !== modulo) writeFileSync(DESTINO, modulo);
}
