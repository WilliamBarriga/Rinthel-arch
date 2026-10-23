import { describe, expect, it } from 'vitest';

import { TEMA_NEUTRO, contratoDeTemaSchema } from 'canonico';

describe('contratoDeTemaSchema', () => {
  it('acepta el Tema neutro y uno con tokens adicionales', () => {
    expect(contratoDeTemaSchema.safeParse(TEMA_NEUTRO).success).toBe(true);
    expect(contratoDeTemaSchema.safeParse({ ...TEMA_NEUTRO, tokens: { ...TEMA_NEUTRO.tokens, fontSize: '16px', surface: '#eee' } }).success).toBe(true);
  });

  it('un Tema sin un token o fuente requeridos falla senalando la ruta', () => {
    const { border: _borde, ...tokens } = TEMA_NEUTRO.tokens;
    const sinBorde = contratoDeTemaSchema.safeParse({ ...TEMA_NEUTRO, tokens });
    const sinMono = contratoDeTemaSchema.safeParse({ ...TEMA_NEUTRO, fonts: { body: 'serif' } });

    expect(sinBorde.error?.issues.map((i) => i.path.join('.'))).toEqual(['tokens.border']);
    expect(sinMono.error?.issues.map((i) => i.path.join('.'))).toEqual(['fonts.mono']);
  });

  it('un fontSize que no es px falla', () => {
    const malo = contratoDeTemaSchema.safeParse({ ...TEMA_NEUTRO, tokens: { ...TEMA_NEUTRO.tokens, fontSize: 'grande' } });

    expect(malo.error?.issues.map((i) => i.path.join('.'))).toEqual(['tokens.fontSize']);
  });
});
