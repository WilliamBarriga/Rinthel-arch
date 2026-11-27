import { describe, expect, it } from 'vitest';

import type { Theme } from 'canonical';
import { NEUTRAL_THEME, metricsKey, placeNode, nodeMetricsFor, opTouchesMetrics, metricsTable } from 'theme';
import type { LayerOp } from 'theme';

const shape = (props: Record<string, number> = {}) => ({ nombre: 'forma', primitiva: { tipo: 'rect', props: { radius: 0, ...props } } });
const fill = (color: string) => ({ nombre: 'relleno', primitiva: { tipo: 'solid', props: { color } } });
const op = (name: string, props: Record<string, number | string>, primitive?: string): LayerOp => ({ nombre: name, props, ...(primitive !== undefined && { primitiva: primitive }) });
const circle = (): LayerOp => op('forma', {}, 'circle');

const theme = (layers: unknown[], kinds: Record<string, LayerOp[]> = {}): Theme =>
  ({ ...NEUTRAL_THEME, nodo: { ...NEUTRAL_THEME.nodo, capas: layers, tipos: kinds } }) as Theme;

describe('Metrics table per element', () => {
  it('a Node kind with its own minimum box has its entry; an unmentioned Node kind uses the base entry', () => {
    const table = metricsTable(theme([shape(), fill('blue')], { db: [circle()] }), 'architecture');

    expect(placeNode({ titulo: 'x', atributos: [], icono: false }, nodeMetricsFor(table, 'db'))).toMatchObject({ width: 120, height: 120 });
    expect(placeNode({ titulo: 'x', atributos: [], icono: false }, nodeMetricsFor(table, 'servicio'))).toMatchObject({ width: 120 });
    expect(placeNode({ titulo: 'x', atributos: [], icono: false }, nodeMetricsFor(table, 'servicio')).height).toBeLessThan(120);
    expect(nodeMetricsFor(table, 'servicio')).toBe(table.base);
  });

  it('a declared Node kind whose Metrics match the base does not change the key', () => {
    const base = theme([shape(), fill('blue')]);
    const withKind = theme([shape(), fill('blue')], { db: [op('relleno', { color: 'red' })] });

    expect(metricsKey(metricsTable(withKind, 'architecture'))).toBe(metricsKey(metricsTable(base, 'architecture')));
  });

  it('changing only the paint (Layers, colors, radius) does not change the Metrics key', () => {
    const a = theme([shape({ radius: 0 }), fill('blue')]);
    const b = theme([shape({ radius: 12 }), fill('red'), { nombre: 'aura', primitiva: { tipo: 'border', props: { color: 'red', width: 3 } } }]);

    expect(metricsKey(metricsTable(b, 'architecture'))).toBe(metricsKey(metricsTable(a, 'architecture')));
  });

  it('changing the shape to one with a minimum box changes the key', () => {
    const a = theme([shape()]);
    const b = theme([{ nombre: 'forma', primitiva: { tipo: 'circle', props: {} } }]);

    expect(metricsKey(metricsTable(b, 'architecture'))).not.toBe(metricsKey(metricsTable(a, 'architecture')));
  });

  it('the table carries open Group, Collapsed group and Edge label', () => {
    const table = metricsTable(NEUTRAL_THEME, 'architecture');

    expect(table.grupoAbierto.paddingGrupo).toEqual({ top: 44, left: 16, bottom: 16, right: 16 });
    expect(table.grupoColapsado.disposicion).toEqual(NEUTRAL_THEME.nodo.slots);
    expect(table.etiqueta.escalaEtiqueta).toBe(0.85);
  });
});

describe('state patches and Metrics', () => {
  const stacks = [[shape(), fill('blue')] as never];

  it('a patch that changes the shape to one with a minimum box touches the Metrics; a paint one does not', () => {
    expect(opTouchesMetrics(circle(), stacks)).toBeDefined();
    expect(opTouchesMetrics(op('forma', { radius: 8 }), stacks)).toBeUndefined();
    expect(opTouchesMetrics(op('relleno', { color: 'red' }), stacks)).toBeUndefined();
  });

  it('the schema rejects a state patch that changes the box', () => {
    const bad = { ...theme([shape()]), nodo: { ...NEUTRAL_THEME.nodo, capas: [shape()], estados: { hover: [circle()] } } } as Theme;

    expect(() => metricsTable(bad, 'architecture')).toThrow(/Metrics/);
  });
});

describe('the Diagram type is required', () => {
  it('omitting it is a typecheck error', () => {
    // @ts-expect-error the Diagram type is missing
    const omitted = () => metricsTable(NEUTRAL_THEME);

    expect(omitted).toBeTypeOf('function');
  });
});
