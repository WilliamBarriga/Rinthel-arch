import { readdirSync } from 'node:fs';
import { resolve } from 'node:path';
import { expect, it } from 'vitest';

import { VARIANTE_DE_TEMA } from '../scripts/capturas/prototipo.ts';

/** `pnpm capturas` empareja cada Tema de la galeria con una variante del prototipo: no puede quedar un Tema sin pareja. */
it('el mapa Tema -> variante del prototipo cubre exactamente los Temas de la galeria, sin variantes repetidas', () => {
  const galeria = resolve(import.meta.dirname, '../examples/temas/galeria');
  const temas = readdirSync(galeria).filter((f) => f.endsWith('.dg') && !['modelo.dg', 'referencia.dg', 'vistas.dg'].includes(f)).map((f) => f.replace(/\.dg$/, ''));
  expect(Object.keys(VARIANTE_DE_TEMA).sort()).toEqual(temas.sort());
  const variantes = Object.values(VARIANTE_DE_TEMA);
  expect(new Set(variantes).size).toBe(variantes.length);
});
