import { describe, expect, it } from 'vitest';

import { salidaDeValidateSchema } from 'canonico';

const valida = {
  contractVersion: 1,
  ok: false,
  summary: { errors: 1, warnings: 0, truncated: false },
  issues: [
    {
      code: 'E_UNKNOWN_NODE_TYPE',
      severity: 'error',
      file: 'main.dg',
      line: 3,
      column: 3,
      message: 'Tipo de nodo no declarado',
      hint: 'Declaralo en specification',
    },
  ],
};

describe('salida de validate (ADR 0008)', () => {
  it('acepta el objeto versionado con sus issues', () => {
    expect(salidaDeValidateSchema.parse(valida)).toEqual(valida);
  });

  it('rechaza otra version del contrato y severidades desconocidas', () => {
    expect(salidaDeValidateSchema.safeParse({ ...valida, contractVersion: 2 }).success).toBe(false);
    const fatal = { ...valida, issues: [{ ...valida.issues[0], severity: 'fatal' }] };
    expect(salidaDeValidateSchema.safeParse(fatal).success).toBe(false);
  });

  it('exige posicion 1-based en cada issue', () => {
    const cero = { ...valida, issues: [{ ...valida.issues[0], line: 0 }] };
    expect(salidaDeValidateSchema.safeParse(cero).success).toBe(false);
  });
});
