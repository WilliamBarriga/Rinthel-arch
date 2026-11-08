import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

import { compile } from 'dsl';
import { estiloResuelto } from 'tema';

const ejemplo = readFileSync(resolve(import.meta.dirname, '../examples/temas/er.dg'), 'utf8');
const { canonico, issues } = compile({ 'er.dg': ejemplo });

describe('Tema de ejemplo para tablas ER', () => {
  it('compila sin issues', () => {
    expect(issues).toEqual([]);
  });

  it('resuelve la pintura de la fila y la zona de cabecera solo en una Vista ER', () => {
    const tema = canonico!.themes.find((t) => t.name === 'er-tablas')!;
    const er = estiloResuelto(tema, { diagrama: 'er' });
    const arquitectura = estiloResuelto(tema, { diagrama: 'architecture' });

    expect(er.pintura.fila).toBeDefined();
    expect(er.metricas.fila).toBe(26);
    expect(arquitectura.pintura.fila).toBeUndefined();
    expect(er.pintura.nodo.capas.find((c) => c.nombre === 'cabecera')?.props['zone']).toBe('header');
  });
});
