import { describe, expect, it } from 'vitest';

import { CODIGOS, CODIGOS_DEPRECADOS, DESCRIPCION_DE_CODIGO } from 'canonico';

/** Escrita a mano, no desde el catalogo: anadir un codigo es un cambio de contrato que se revisa aqui. */
const codigosDeV1 = [
  'syntax-error',
  'unknown-node-type',
  'duplicate-node',
  'dangling-edge',
  'unknown-attribute',
  'unknown-palette-color',
  'extends-cycle',
  'duplicate-theme',
  'unknown-theme',
  'unknown-view-link',
  'invalid-expansion-target',
  'link-with-expanded',
  'unknown-step',
  'step-not-projected',
  'step-not-advancing',
  'steps-each-with-step',
  'link-not-lifeline',
  'unknown-view-type',
  'view-property-for-type',
  'sequence-without-interaction',
  'unknown-interaction',
  'duplicate-interaction',
  'unknown-lifeline',
  'duplicate-message-id',
  'create-not-first',
  'after-destroy',
  'invalid-fragment-operand',
  'order-not-in-interaction',
  'ref-without-view',
  'reply-without-sync',
  'unknown-extend-target',
  'override-outside-view',
  'unknown-icon',
  'overlapping-pins',
  'theme-unknown-primitive',
  'theme-unknown-property',
  'theme-invalid-value',
  'theme-unknown-slot',
  'theme-duplicate-layer',
  'theme-unknown-token',
  'theme-unknown-layer',
  'theme-patch-without-placement',
  'theme-state-touches-metrics',
  'theme-unknown-state',
  'theme-unknown-diagram-type',
  'theme-unknown-part',
  'theme-unknown-motion',
  'duplicate-part',
  'theme-low-contrast',
  'theme-color-only',
  'theme-with-code',
  'theme-component-missing',
  'theme-component-params',
  'theme-component-duplicate',
  'theme-code-compile',
  'theme-font-missing',
  'theme-font-no-fallback',
  'theme-font-not-served',
  'duplicate-key-mark',
  'er-cardinality',
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

  it('retira unknown-edge-style-type sin reciclar su valor', () => {
    expect(CODIGOS_DEPRECADOS).toContain('unknown-edge-style-type');
  });

  it('usa codigos kebab-case en ingles; la clave es el codigo en mayusculas con prefijo de severidad', () => {
    for (const [clave, codigo] of Object.entries(CODIGOS)) {
      expect(codigo).toMatch(/^[a-z0-9]+(-[a-z0-9]+)*$/);
      expect(clave.slice(2)).toBe(codigo.toUpperCase().replaceAll('-', '_'));
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
