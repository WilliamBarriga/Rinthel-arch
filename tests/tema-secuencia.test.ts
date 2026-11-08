import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

import { abrirSesion } from 'sesion';

const ejemplo = readFileSync(resolve(import.meta.dirname, '../examples/temas/secuencia.dg'), 'utf8');

describe('examples/temas/secuencia.dg', () => {
  it('compila sin issues y declara todos los Elementos de secuencia', async () => {
    const sesion = abrirSesion({ 'secuencia.dg': ejemplo });

    expect(await sesion.diagnosticar()).toEqual([]);
    const pintura = sesion.estilo('compra')!.pintura.secuencia!;
    expect(Object.keys(pintura).sort()).toEqual(['activacion', 'fragmento', 'lifeline', 'mensaje', 'nota']);
    expect(Object.keys(pintura.mensaje!.base.variantes).sort()).toEqual(['async', 'destroy', 'reply']);
    expect(Object.keys(pintura.fragmento!.variantes).sort()).toEqual(['alt', 'ref']);
  });
});
