import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

import { openSession } from 'session';

const example = readFileSync(resolve(import.meta.dirname, '../examples/themes/sequence.dg'), 'utf8');

describe('examples/themes/sequence.dg', () => {
  it('compiles without issues and declares every sequence Element', async () => {
    const session = openSession({ 'sequence.dg': example });

    expect(await session.diagnose()).toEqual([]);
    const paint = session.style('purchase')!.pintura.secuencia!;
    expect(Object.keys(paint).sort()).toEqual(['activacion', 'fragmento', 'lifeline', 'mensaje', 'nota']);
    expect(Object.keys(paint.mensaje!.base.variantes).sort()).toEqual(['async', 'destroy', 'reply']);
    expect(Object.keys(paint.fragmento!.variantes).sort()).toEqual(['alt', 'ref']);
  });
});
