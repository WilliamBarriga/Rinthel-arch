import { describe, expect, it } from 'vitest';

import { resolveTheme } from 'theme';

import { compile } from '../src';

const model = `specification {
  node servicio { color blue }
  node base { color green }
}
model { servicio a  base b  a -> b }
view v { type architecture include ** }
`;

const compileFn = () => {
  const result = compile({ 'main.dg': model });
  expect(result.issues).toEqual([]);
  return result.canonical!;
};

const luminance = (hex: string): number => {
  const channels = [1, 3, 5].map((i) => Number.parseInt(hex.slice(i, i + 2), 16) / 255);
  const [r, g, b] = channels.map((c) => (c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4)) as [number, number, number];
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
};
const contrast = (a: string, b: string): number => {
  const [light, dark] = [luminance(a), luminance(b)].sort((x, y) => y - x) as [number, number];
  return (light + 0.05) / (dark + 0.05);
};

describe('Built-in Themes', () => {
  it('are always in the Canonical form, the neutral one first, and compile without issues', () => {
    expect(compileFn().themes.map((t) => t.name)).toEqual(['neutral', 'neutral-dark', 'high-contrast']);
  });

  it('the neutral one draws with Layers, Slots, states and minimal animation', () => {
    const neutralTheme = resolveTheme(compileFn().themes[0]!);
    expect(neutralTheme.nodo.capas.map((c) => c.nombre)).toEqual(['shape', 'fill', 'border', 'shadow']);
    expect(Object.keys(neutralTheme.nodo.estados).sort()).toEqual(['dimmed', 'hover', 'on-path']);
    expect(neutralTheme.nodo.animacion?.transicionesDeEstado?.hover).toBeDefined();
  });

  it.each(['neutral', 'neutral-dark', 'high-contrast'])('%s uses the card Slots, its own Group and the page background', (name) => {
    const theme = resolveTheme(compileFn().themes.find((t) => t.name === name)!);
    const slots = JSON.stringify(theme.nodo.slots);
    for (const slot of ['icon', 'title', 'badge', 'counter', 'attrs']) expect(slots).toContain(`"slot":"${slot}"`);
    expect(theme.grupo.capas.length).toBeGreaterThan(0);
    expect(theme.grupo.colapsado.ops.length).toBeGreaterThan(0);
    expect(JSON.stringify(theme.grupo.slots)).toContain('"slot":"title"');
    expect(theme.pagina.capas.length).toBeGreaterThan(0);
    expect(theme.arista.etiqueta).toBeDefined();
  });

  it('a user Theme cannot be named like a built-in one', () => {
    const result = compile({ 'main.dg': `${model}theme neutral-dark { }\n` });
    expect(result.issues.map((i) => i.code)).toContain('duplicate-theme');
  });

  it.each(['neutral', 'neutral-dark', 'high-contrast'])('%s meets contrast: text 4.5:1 and graphical parts 3:1', (name) => {
    const theme = resolveTheme(compileFn().themes.find((t) => t.name === name)!);
    const { palette: p, tokens } = theme;
    expect(contrast(tokens.foreground, tokens.background)).toBeGreaterThanOrEqual(4.5);
    const role = p['papel'] ?? p['black'] ?? tokens.background;
    expect(contrast(p['tinta'] ?? tokens.foreground, role)).toBeGreaterThanOrEqual(4.5);
    expect(contrast(p['linea'] ?? tokens.border, tokens.background)).toBeGreaterThanOrEqual(3);
    expect(contrast(tokens.border, tokens.background)).toBeGreaterThanOrEqual(3);
    for (const color of ['gray', 'blue', 'green', 'amber', 'red', 'purple']) {
      expect(contrast(p[color]!, role), `${name}/${color} sobre papel`).toBeGreaterThanOrEqual(3);
      expect(contrast(p[color]!, tokens.background), `${name}/${color} sobre fondo`).toBeGreaterThanOrEqual(3);
    }
  });
});
