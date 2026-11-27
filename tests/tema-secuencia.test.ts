import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

import { openSession } from 'session';

const ejemplo = readFileSync(resolve(import.meta.dirname, '../examples/themes/sequence.dg'), 'utf8');

describe('examples/themes/sequence.dg', () => {
  it('compila sin issues y declara todos los Elementos de secuencia', async () => {
    const sesion = openSession({ 'sequence.dg': ejemplo });

    expect(await sesion.diagnose()).toEqual([]);
    const pintura = sesion.style('purchase')!.pintura.secuencia!;
    expect(Object.keys(pintura).sort()).toEqual(['activacion', 'fragmento', 'lifeline', 'mensaje', 'nota']);
    expect(Object.keys(pintura.mensaje!.base.variantes).sort()).toEqual(['async', 'destroy', 'reply']);
    expect(Object.keys(pintura.fragmento!.variantes).sort()).toEqual(['alt', 'ref']);
  });
});
