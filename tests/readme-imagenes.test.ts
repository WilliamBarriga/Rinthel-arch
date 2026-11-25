import { existsSync, readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

const REPO = resolve(import.meta.dirname, '..');
const README = ['README.md', 'README.es.md'];

/** Local paths of the Markdown images `![...](path)`, in order. */
function imagenes(texto: string): string[] {
  return [...texto.matchAll(/!\[[^\]]*\]\(([^)\s]+)\)/g)].map((m) => m[1]!).filter((ruta) => !/^https?:/.test(ruta));
}

describe.each(README)('%s', (archivo) => {
  const texto = readFileSync(resolve(REPO, archivo), 'utf8');

  it('every local image it cites exists', () => {
    const faltan = imagenes(texto).filter((ruta) => !existsSync(resolve(REPO, dirname(archivo), ruta)));
    expect(faltan).toEqual([]);
  });

  it('opens with the GIF of the agent in the Dev UI', () => {
    expect(imagenes(texto)[0]).toBe('docs/img/estudio/agente-importa.gif');
  });

  it('the Themes section shows the mosaic linked to the gallery', () => {
    expect(texto).toMatch(/\[!\[[^\]]*\]\(docs\/img\/mosaico-de-temas\.png\)\]\(docs\/gallery\.md\)/);
  });
});
