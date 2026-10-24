import { describe, expect, it } from 'vitest';

import { CODIGOS, CODIGOS_DEPRECADOS, DESCRIPCION_DE_CODIGO } from 'canonico';

/**
 * Codigos minimos de v1: la lista del spec #19 escrita desde el spec, no desde
 * el catalogo. Anadir un codigo es un cambio de contrato que se revisa aqui.
 * `E_SYNTAX_ERROR` se anade en el ticket #22: `compile` necesita reportar texto
 * que no cumple la gramatica y el spec no lo listaba. Los `E_THEME_*` son de la
 * spec #24 (ADR 0008); `W_UNKNOWN_EDGE_STYLE_TYPE` se depreco con `edgeStyles`.
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
  'E_UNKNOWN_EXTEND_TARGET',
  'E_OVERRIDE_OUTSIDE_VIEW',
  'E_UNKNOWN_ICON',
  'W_OVERLAPPING_PINS',
  'E_THEME_UNKNOWN_PRIMITIVE',
  'E_THEME_UNKNOWN_PROPERTY',
  'E_THEME_INVALID_VALUE',
  'E_THEME_UNKNOWN_SLOT',
  'E_THEME_DUPLICATE_LAYER',
  'E_THEME_UNKNOWN_TOKEN',
  'E_THEME_UNKNOWN_LAYER',
  'E_THEME_PATCH_WITHOUT_PLACEMENT',
  'E_THEME_STATE_TOUCHES_METRICS',
  'E_THEME_UNKNOWN_STATE',
  'E_THEME_UNKNOWN_PART',
  'E_THEME_UNKNOWN_MOTION',
  'E_DUPLICATE_PART',
  'W_THEME_LOW_CONTRAST',
  'W_THEME_COLOR_ONLY',
  'W_THEME_WITH_CODE',
  'E_THEME_COMPONENT_MISSING',
  'E_THEME_COMPONENT_PARAMS',
  'E_THEME_COMPONENT_DUPLICATE',
  'E_THEME_CODE_COMPILE',
  'E_THEME_FONT_MISSING',
  'E_THEME_FONT_NO_FALLBACK',
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

  it('retira W_UNKNOWN_EDGE_STYLE_TYPE sin reciclar su valor', () => {
    expect(CODIGOS_DEPRECADOS).toContain('W_UNKNOWN_EDGE_STYLE_TYPE');
  });

  it('usa prefijo E_ o W_ y clave igual que valor', () => {
    for (const [clave, codigo] of Object.entries(CODIGOS)) {
      expect(codigo).toMatch(/^[EW]_[A-Z0-9_]+$/);
      expect(clave).toBe(codigo);
    }
    expect(Object.isFrozen(CODIGOS)).toBe(true);
  });

  it('describe cada codigo activo en una frase, para el skill de agentes', () => {
    expect(Object.keys(DESCRIPCION_DE_CODIGO).sort()).toEqual(Object.values(CODIGOS).sort());
    for (const descripcion of Object.values(DESCRIPCION_DE_CODIGO)) {
      expect(descripcion.trim().length).toBeGreaterThan(10);
    }
  });
});
