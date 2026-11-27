import { describe, expect, it } from 'vitest';

import { compile } from 'dsl';

const base = 'specification { node servicio { color blue } }  model { servicio a }';
const theme = (body: string, header = 'theme t') => compile({ 'main.dg': `${base}\n${header} { ${body} }` });
// Free navigation of a canonical object in the tests.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const nodeOf = (result: ReturnType<typeof compile>, name = 't') => result.canonical?.themes.find((t) => t.name === name)?.['nodo'] as Record<string, any>;

const LAYERS = `
  layer forma rect
  layer acento border { color blue  width 2 }`;

describe('compile: declarative Theme animation', () => {
  it('compiles Layer Motions, transition, enter, exit and stagger', () => {
    const result = theme(`palette { blue "#00f" }
      node {
        ${LAYERS.replace('width 2 }', `width 2  motion pulse 1.2s ease-in-out intensity 0.4 delay 100ms }`)}
        transition 120ms ease-out
        enter zoom 300ms
        exit fade 200ms reduced instant
        stagger 60ms
        state selected { layer acento { motion aura }  transition 80ms }
      }`);
    const node = nodeOf(result);

    expect(result.issues).toEqual([]);
    expect(node['capas'][1].animacion).toEqual({ clase: 'movimiento', movimiento: 'pulse', duracionMs: 1200, easing: 'ease-in-out', intensidad: 0.4, retardoMs: 100, reducido: 'still' });
    expect(node['estados'].selected[0].animacion).toMatchObject({ movimiento: 'aura', duracionMs: 2000 });
    expect(node['animacion']).toEqual({
      transicion: { duracionMs: 120, easing: 'ease-out', reducido: 'fade' },
      transicionesDeEstado: { selected: { duracionMs: 80, easing: 'ease', reducido: 'fade' } },
      entrada: { efecto: 'zoom', duracionMs: 300, easing: 'ease-out', retardoMs: 0, reducido: 'fade' },
      salida: { efecto: 'fade', duracionMs: 200, easing: 'ease-out', retardoMs: 0, reducido: 'instant' },
      escalonadoMs: 60,
    });
  });

  it('minimal keyframes over a Layer property, negative values included', () => {
    const result = theme(`palette { blue "#00f" }
      node { ${LAYERS.replace('width 2 }', 'width 2  keyframes shift-x 2s { 0 0  50 -10  100 0 } }')} }`);

    expect(result.issues).toEqual([]);
    expect(nodeOf(result)['capas'][1].animacion).toMatchObject({
      clase: 'keyframes',
      propiedad: 'shift-x',
      duracionMs: 2000,
      pasos: [{ en: 0, valor: 0 }, { en: 50, valor: -10 }, { en: 100, valor: 0 }],
    });
  });

  it('motion none in a state or in a child removes the inherited Motion', () => {
    const parent = `theme p { palette { blue "#00f" }  node { ${LAYERS.replace('width 2 }', 'width 2  motion breathe }')} } }`;
    const result = compile({ 'main.dg': `${base}\n${parent}\ntheme h extends p { node { layer acento { motion none } } }` });

    expect(result.issues).toEqual([]);
    expect(nodeOf(result, 'p')['capas'][1].animacion).toMatchObject({ movimiento: 'breathe' });
    expect(nodeOf(result, 'h')['capas'][1].animacion).toBeUndefined();
  });

  it('a child inherits the Node animation and can change it', () => {
    const parent = `theme p { node { transition 100ms  stagger 40ms } }`;
    const result = compile({ 'main.dg': `${base}\n${parent}\ntheme h extends p { node { stagger 90ms } }` });

    expect(result.issues).toEqual([]);
    expect(nodeOf(result, 'h')['animacion']).toEqual({ transicion: { duracionMs: 100, easing: 'ease', reducido: 'fade' }, escalonadoMs: 90 });
  });

  it('all errors at once, with stable code, position and suggestion', () => {
    const { issues } = theme(`palette { blue "#00f" }
      node {
        ${LAYERS.replace('width 2 }', 'width 2  motion pulsso 1s }')}
        enter girar 300ms
        transition 120min
        stagger 9000ms
      }`);

    expect(issues.map((i) => i.code).sort()).toEqual(['theme-invalid-value', 'theme-invalid-value', 'theme-unknown-motion', 'theme-unknown-motion']);
    const motion = issues.find((i) => i.message.includes('pulsso'));
    expect(motion).toMatchObject({ file: 'main.dg', line: 6, hint: "did you mean 'pulse'" });
  });

  it('out of range values are not clamped', () => {
    const { issues } = theme(`palette { blue "#00f" }
      node { ${LAYERS.replace('width 2 }', 'width 2  motion pulse intensity 7 }')} }`);

    expect(issues).toHaveLength(1);
    expect(issues[0]).toMatchObject({ code: 'theme-invalid-value', severity: 'error' });
  });

  it('two transitions in the same block are an error, not a silent last-wins', () => {
    const { issues } = theme('node { transition 100ms  transition 200ms }');

    expect(issues.map((i) => i.code)).toEqual(['theme-invalid-value']);
  });

  it('motion, delay and friends are still valid identifiers in the Model', () => {
    const { issues, canonical } = compile({ 'main.dg': 'specification { node motion }  model { motion delay  motion linear }' });

    expect(issues).toEqual([]);
    expect(canonical?.model.nodes.map((n) => n.id)).toEqual(['delay', 'linear']);
  });

  it('a decimal with a leading zero keeps its zeros (0.05 is not 0.5)', () => {
    const result = theme(`palette { blue "#00f" }
      node {
        ${LAYERS.replace('width 2 }', 'width 2  motion pulse intensity 0.05 }')}
      }`);

    expect(result.issues).toEqual([]);
    expect(nodeOf(result)['capas'][1].animacion.intensidad).toBe(0.05);
  });
});
