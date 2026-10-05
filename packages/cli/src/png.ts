import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { Resvg } from '@resvg/resvg-js';
import type { Tema } from 'canonico';

import { archivoDeFuente, familiasDe } from './fuentes';

/** resvg solo lee estos formatos; `woff` y `woff2` no. */
const LEGIBLES = ['ttf', 'otf'];
const NO_LEGIBLES = ['woff2', 'woff'];

/**
 * Rasteriza el SVG de una Vista con resvg (sin navegador). resvg no lee los
 * `@font-face` del SVG, asi que las familias del Tema se cargan desde los
 * archivos `.ttf`/`.otf` del Workspace (`fuentes`: ruta -> base64). Una familia
 * sin archivo (`sans-serif`, una fuente del sistema) se resuelve con las
 * fuentes del sistema; una que solo existe como `woff`/`woff2` lanza.
 */
export function rasterizar(svg: string, tema: Tema, fuentes: Readonly<Record<string, string>>): Uint8Array {
  const rutas = Object.keys(fuentes).sort();
  const carpeta = mkdtempSync(join(tmpdir(), 'diagrams-fuentes-'));
  try {
    const archivos: string[] = [];
    let usaFuentesDelSistema = false;
    for (const familia of new Set(Object.values(tema.fonts).flatMap(familiasDe))) {
      const ruta = LEGIBLES.map((extension) => archivoDeFuente(rutas, familia, extension)).find((r) => r !== undefined);
      if (ruta !== undefined) {
        // resvg-js solo carga fuentes desde archivos, no desde memoria.
        const destino = join(carpeta, `${archivos.length}.${ruta.split('.').pop()}`);
        writeFileSync(destino, Buffer.from(fuentes[ruta] as string, 'base64'));
        archivos.push(destino);
      } else if (NO_LEGIBLES.some((extension) => archivoDeFuente(rutas, familia, extension) !== undefined)) {
        throw new Error(`La fuente '${familia}' solo esta como woff/woff2; el PNG necesita un .ttf u .otf`);
      } else {
        usaFuentesDelSistema = true;
      }
    }
    return new Resvg(svg, { font: { fontFiles: archivos, loadSystemFonts: usaFuentesDelSistema } }).render().asPng();
  } finally {
    rmSync(carpeta, { recursive: true, force: true });
  }
}
