import { describe, expect, it } from 'vitest';

import type { Theme } from 'canonical';
import { NEUTRAL_THEME, metricsKey, textKey, placeNode, fontHash, metricsOf, metricsTable, labelSize, textsToMeasure } from 'theme';
import type { TextMeasures } from 'theme';

const theme = NEUTRAL_THEME as unknown as Theme;
const measures = (widths: Record<string, number>, fonts: Record<string, string> = { sans: 'aaaa' }): TextMeasures => ({ nivel: 'medido', fuentes: fonts, anchos: widths });

describe('text measuring', () => {
  it('without measures the level is estimated and the width comes from the per-character estimate', () => {
    const m = metricsOf(theme, 'architecture');

    expect(m.medicion).toEqual({ nivel: 'estimado', fuentes: {} });
    expect(placeNode({ titulo: 'abcd', atributos: [], icono: false }, m).width).toBe(Math.max(m.anchoMinimo, Math.ceil(4 * m.fontSize * m.factorDeAncho + m.paddingHorizontal)));
  });

  it('with measures the Slot width comes from the measure, not from the estimate', () => {
    const m = metricsTable(theme, 'architecture').base;
    const key = textKey(NEUTRAL_THEME.fonts.body, m.fontSize, 'abcd');
    const measured = metricsTable(theme, 'architecture', measures({ [key]: 500 })).base;

    expect(placeNode({ titulo: 'abcd', atributos: [], icono: false }, measured).width).toBe(500 + m.paddingHorizontal);
  });

  it('a text without a measure falls back to the estimate', () => {
    const measured = metricsTable(theme, 'architecture', measures({})).base;

    expect(placeNode({ titulo: 'abcd', atributos: [], icono: false }, measured).width).toBe(placeNode({ titulo: 'abcd', atributos: [], icono: false }, metricsOf(theme, 'architecture')).width);
  });

  it('the box of a label uses the measure', () => {
    const m = metricsTable(theme, 'architecture').base;
    const key = textKey(NEUTRAL_THEME.fonts.body, m.fontSize * m.escalaEtiqueta, 'lee');
    const measured = metricsTable(theme, 'architecture', measures({ [key]: 40 })).base;

    expect(labelSize('lee', measured).width).toBe(40 + m.holguraDeEtiqueta);
  });

  it('the structure key changes with the level and the font hash, not with the widths', () => {
    const estimated = metricsKey(metricsTable(theme, 'architecture'));
    const a = metricsKey(metricsTable(theme, 'architecture', measures({ x: 1 })));
    const otherFont = metricsKey(metricsTable(theme, 'architecture', measures({ x: 1 }, { sans: 'bbbb' })));
    const otherWidths = metricsKey(metricsTable(theme, 'architecture', measures({ x: 2 })));

    expect(a).not.toBe(estimated);
    expect(otherFont).not.toBe(a);
    expect(otherWidths).toBe(a);
  });

  it('fontHash is deterministic and tells contents apart', () => {
    expect(fontHash(new Uint8Array([1, 2, 3]))).toBe(fontHash(new Uint8Array([1, 2, 3])));
    expect(fontHash(new Uint8Array([1, 2, 3]))).not.toBe(fontHash(new Uint8Array([1, 2, 4])));
  });

  it('textsToMeasure lists each text with its family and size, without repeats', () => {
    const m = metricsTable(theme, 'architecture');
    const node = { id: 'a', type: 't', label: 'abcd', collapsed: false, children: [], source: [], attributes: [{ name: 'id', type: 'uuid' }] };
    const texts = textsToMeasure({ nodes: [node, { ...node, id: 'b' }], edges: [{ label: 'lee' }] } as never, m);

    expect(texts).toContainEqual({ familia: NEUTRAL_THEME.fonts.body, tamano: m.base.fontSize, texto: 'abcd' });
    expect(texts).toContainEqual({ familia: NEUTRAL_THEME.fonts.body, tamano: m.base.fontSize * m.etiqueta.escalaEtiqueta, texto: 'lee' });
    expect(texts.filter((t) => t.texto === 'abcd')).toHaveLength(1);
  });

  it('a Slot or a label with its own weight is measured with that weight (a bold title is wider)', () => {
    const thick = {
      ...NEUTRAL_THEME,
      nodo: { ...NEUTRAL_THEME.nodo, slots: { direccion: 'column', gap: 0, pad: 0, hijos: [{ slot: 'title' }] }, textos: { title: { tipo: 'text', props: { weight: 800 } } } },
      arista: { ...NEUTRAL_THEME.arista, etiqueta: { tipo: 'label', props: { weight: 700 } } },
    } as unknown as Theme;
    const node = { id: 'a', type: 't', label: 'abcd', collapsed: false, children: [], source: [], attributes: [] };
    const table = metricsTable(thick, 'architecture');
    const texts = textsToMeasure({ nodes: [node], edges: [{ label: 'lee' }] } as never, table);

    expect(texts.map((t) => [t.texto, t.peso])).toEqual([['abcd', 800], ['lee', 700]]);
    const key = textKey(NEUTRAL_THEME.fonts.body, table.base.fontSize, 'abcd', 800);
    expect(key).not.toBe(textKey(NEUTRAL_THEME.fonts.body, table.base.fontSize, 'abcd'));
    const measured = metricsTable(thick, 'architecture', measures({ [key]: 300 })).base;
    expect(placeNode({ titulo: 'abcd', atributos: [], icono: false }, measured).width).toBe(300 + measured.paddingHorizontal);
  });

  it('a Slot or a label with font mono is measured with the mono font', () => {
    const mono = {
      ...NEUTRAL_THEME,
      nodo: { ...NEUTRAL_THEME.nodo, slots: { direccion: 'column', gap: 0, pad: 0, hijos: [{ slot: 'title' }] }, textos: { title: { tipo: 'text', props: { font: 'mono' } } } },
      arista: { ...NEUTRAL_THEME.arista, etiqueta: { tipo: 'label', props: { font: 'mono' } } },
    } as unknown as Theme;
    const node = { id: 'a', type: 't', label: 'abcd', collapsed: false, children: [], source: [], attributes: [] };
    const texts = textsToMeasure({ nodes: [node], edges: [{ label: 'lee' }] } as never, metricsTable(mono, 'architecture'));

    expect(texts.map((t) => [t.texto, t.familia])).toEqual([['abcd', NEUTRAL_THEME.fonts.mono], ['lee', NEUTRAL_THEME.fonts.mono]]);
  });
});
