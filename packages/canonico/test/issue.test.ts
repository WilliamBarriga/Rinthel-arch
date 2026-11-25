import { describe, expect, expectTypeOf, it } from 'vitest';

import type { Issue } from 'canonico';

/** Escrita desde el contrato, no desde el codigo. */
type IssueEsperado = {
  code: string;
  severity: 'error' | 'warning';
  file: string;
  line: number;
  column: number;
  message: string;
  hint?: string;
  related?: { file: string; line: number; column: number; message: string }[];
  fix?: {
    file: string;
    range: { start: { line: number; column: number }; end: { line: number; column: number } };
    replacement: string;
    rename?: string;
  };
};

describe('Issue (ADR 0005)', () => {
  it('es exactamente el contrato de salida de validate', () => {
    expectTypeOf<Issue>().toEqualTypeOf<IssueEsperado>();
  });

  it('severity es un conjunto cerrado error|warning', () => {
    expectTypeOf<Issue['severity']>().toEqualTypeOf<'error' | 'warning'>();
    expectTypeOf<'fatal'>().not.toMatchTypeOf<Issue['severity']>();
  });

  it('admite un issue completo y uno minimo', () => {
    const completo: Issue = {
      code: 'unknown-node-type',
      severity: 'error',
      file: 'dsl/api.model',
      line: 12,
      column: 9,
      message: "Tipo de nodo 'servce' no declarado",
      hint: 'Declaralo en specification o corrige el typo',
      related: [{ file: 'dsl/catalog.model', line: 3, column: 3, message: 'catalogo aqui' }],
      fix: {
        file: 'dsl/api.model',
        range: {
          start: { line: 12, column: 9 },
          end: { line: 12, column: 14 },
        },
        replacement: 'service',
      },
    };
    const minimo: Issue = {
      code: 'overlapping-pins',
      severity: 'warning',
      file: 'dsl/vista.view',
      line: 4,
      column: 1,
      message: 'Dos Pins se solapan',
    };

    expect(completo.fix?.replacement).toBe('service');
    expect(completo.related?.[0]?.file).toBe('dsl/catalog.model');
    expect(minimo.hint).toBeUndefined();
    expect(JSON.parse(JSON.stringify(minimo))).toEqual(minimo);
  });
});
