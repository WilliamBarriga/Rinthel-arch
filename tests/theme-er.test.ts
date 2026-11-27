import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

import { compile } from 'dsl';
import { resolvedStyle } from 'theme';

const example = readFileSync(resolve(import.meta.dirname, '../examples/themes/er.dg'), 'utf8');
const { canonical, issues } = compile({ 'er.dg': example });

describe('example Theme for ER tables', () => {
  it('compiles without issues', () => {
    expect(issues).toEqual([]);
  });

  it('resolves the row paint and the header zone only in an ER View', () => {
    const theme = canonical!.themes.find((t) => t.name === 'er-tables')!;
    const er = resolvedStyle(theme, { diagrama: 'er' });
    const architecture = resolvedStyle(theme, { diagrama: 'architecture' });

    expect(er.pintura.fila).toBeDefined();
    expect(er.metricas.fila).toBe(26);
    expect(architecture.pintura.fila).toBeUndefined();
    expect(er.pintura.nodo.capas.find((c) => c.nombre === 'header')?.props['zone']).toBe('header');
  });
});
