import { describe, expect, it } from 'vitest';

import { CODIGOS, CODIGOS_DEPRECADOS } from 'canonico';

/**
 * Codigos minimos de v1: la lista del spec #19 escrita desde el spec, no desde
 * el catalogo. Anadir un codigo es un cambio de contrato que se revisa aqui.
 * `E_SYNTAX_ERROR` se anade en el ticket #22: `compile` necesita reportar texto
 * que no cumple la gramatica y el spec no lo listaba.
 */
const codigosDeV1 = [
  'E_SYNTAX_ERROR',
  'E_UNKNOWN_NODE_TYPE',
  'E_DUPLICATE_NODE',
  'E_DANGLING_EDGE',
  'E_UNKNOWN_ATTRIBUTE',
  'E_UNKNOWN_PALETTE_COLOR',
  'E_EXTENDS_CYCLE',
  'E_DUPLICATE_THEME',
  'E_UNKNOWN_THEME',
  'E_UNKNOWN_VIEW_LINK',
  'E_INVALID_EXPANSION_TARGET',
  'E_LINK_WITH_EXPANDED',
  'E_UNKNOWN_STEP',
  'E_UNKNOWN_VIEW_TYPE',
  'W_OVERLAPPING_PINS',
];

describe('catalogo de codigos de issue', () => {
  it('exporta como constantes los codigos minimos de v1 del spec #19', () => {
    expect(Object.values(CODIGOS).sort()).toEqual([...codigosDeV1].sort());
  });

  it('depreca y nunca recicla: todos los codigos emitidos son unicos', () => {
    const activos = Object.values(CODIGOS);
    const historicos = [...activos, ...CODIGOS_DEPRECADOS];

    expect(new Set(historicos).size).toBe(historicos.length);
    expect(activos.filter((codigo) => CODIGOS_DEPRECADOS.includes(codigo))).toEqual([]);
  });

  it('usa prefijo E_ o W_ y clave igual que valor', () => {
    for (const [clave, codigo] of Object.entries(CODIGOS)) {
      expect(codigo).toMatch(/^[EW]_[A-Z0-9_]+$/);
      expect(clave).toBe(codigo);
    }
    expect(Object.isFrozen(CODIGOS)).toBe(true);
  });
});
