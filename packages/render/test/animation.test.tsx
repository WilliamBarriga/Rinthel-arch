import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';

import { canonicalFormSchema, resolveView } from 'canonical';
import type { ResolvedView } from 'canonical';
import { layoutView } from 'layout';
import { Diagram } from 'render';
import type { DiagramProps } from 'render';
import { NEUTRAL_THEME, buildEffect, buildKeyframes, buildMotion, buildTransition, metricsOf } from 'theme';
import type { ResolvedTheme } from 'theme';

import { sheetOf } from './helpers';

const p = (key: string, value: string | number) => ({ key, value });
const ok = <T,>(r: { animacion?: T }): T => r.animacion!;

const node = (id: string) => ({ id, type: 'servicio', title: id.toUpperCase(), description: '', children: [] });
const makeView = (): ResolvedView =>
  resolveView(
    canonicalFormSchema.parse({
      specification: { nodeTypes: [{ name: 'servicio' }] },
      model: { nodes: [node('a'), node('b'), node('c')], edges: [{ from: { node: 'a' }, to: { node: 'b' } }] },
      views: [{ id: 'v', type: 'architecture', include: ['**'], exclude: [] }],
    }),
    'v',
    {},
  )!;

const layers = (animation?: object) => [
  { nombre: 'forma', primitiva: { tipo: 'rect', props: { radius: 8 } } },
  { nombre: 'fondo', primitiva: { tipo: 'solid', props: { color: 'amber' } } },
  { nombre: 'acento', primitiva: { tipo: 'border', props: { color: 'blue', width: 2 } }, ...(animation && { animacion: animation }) },
];

const themeWith = (extraNode: Record<string, unknown> = {}, withAnimation = true): ResolvedTheme =>
  ({
    ...NEUTRAL_THEME,
    nodo: { slots: NEUTRAL_THEME.nodo.slots, tipos: {}, estados: {}, capas: layers(withAnimation ? ok(buildMotion('pulse', [p('duration', 1200), p('intensity', '0.4')])) : undefined), ...extraNode },
  }) as unknown as ResolvedTheme;

async function draw(theme: ResolvedTheme, extra: Partial<DiagramProps> = {}): Promise<string> {
  const view = makeView();
  const geometry = await layoutView(view, NEUTRAL_THEME);
  return renderToStaticMarkup(<Diagram view={view} geometry={geometry} theme={theme} width={800} height={600} {...extra} />);
}

/** CSS properties that, animated, would change the box or the flow (Metrics): none may appear in a @keyframes. */
const FORBIDDEN = ['width', 'height', 'padding', 'margin', 'top', 'left', 'right', 'bottom', 'gap', 'font-size', 'line-height', 'border-width', 'display', 'position'];

function keyframesOf(css: string): string[] {
  return [...css.matchAll(/@keyframes [\w-]+\{([\s\S]*?\}\s*)\}/g)].map((m) => m[1]!);
}

describe('Diagram: Layer Motions', () => {
  it('a Layer with a Motion is drawn as its own element, outside the merged box', async () => {
    const html = await draw(themeWith());
    const css = sheetOf(html);

    expect(html.match(/class="rd-anim" data-anim="acento"/g)).toHaveLength(3);
    expect(css).toMatch(/\.rd-nodo\{[^}]*border-radius:8px/);
    expect(css).not.toMatch(/\.rd-nodo\{[^}]*border:2px/);
    expect(css).toMatch(/\.rd-anim\[data-anim="acento"\]\{[^}]*border:2px solid[^}]*animation:rd-mov-pulse 1200ms ease-in-out 0ms infinite[^}]*--rd-i:0\.4/);
    expect(css).toMatch(/@keyframes rd-mov-pulse\{/);
  });

  it('every Motion of the catalog compiles to native CSS', async () => {
    for (const name of ['stream', 'pulse', 'breathe', 'spin', 'aura']) {
      const css = sheetOf(await draw(themeWith({ capas: layers(ok(buildMotion(name, []))) })));

      expect(css, name).toContain(`@keyframes rd-mov-${name}{`);
    }
  });

  it('a Motion bound to a state only runs with that state', async () => {
    const aura = ok(buildMotion('aura', []));
    const theme = themeWith({ capas: layers(), estados: { selected: [{ nombre: 'acento', props: {}, animacion: aura }] } }, false);
    const withoutState = await draw(theme);
    const selectedOne = await draw(theme, { states: { a: ['selected'] } });
    const css = sheetOf(selectedOne);

    expect(withoutState).not.toContain('data-estados="');
    expect(selectedOne).toMatch(/data-id="a"[^>]*><div[^>]*data-part="nodo"[^>]*data-estados="selected"/);
    expect(css).toMatch(/\[data-estados~="selected"\] \.rd-anim\[data-anim="acento"\]\{[^}]*animation:rd-mov-aura/);
    expect(css).not.toMatch(/^\.[\w-]+ \.rd-anim\[data-anim="acento"\]\{[^}]*animation:/m);
  });

  it('minimal keyframes compile to their own deterministic @keyframes', async () => {
    const kf = ok(buildKeyframes('shift-x', [p('duration', 2000)], [{ en: 0, valor: 0 }, { en: 50, valor: -10 }, { en: 100, valor: 0 }]));
    const css = sheetOf(await draw(themeWith({ capas: layers(kf) })));

    expect(css).toMatch(/@keyframes (rd-kf-\w+)\{0%\{translate:0px 0\}50%\{translate:-10px 0\}100%\{translate:0px 0\}\}/);
    expect(css).toBe(sheetOf(await draw(themeWith({ capas: layers(kf) }))));
  });
});

describe('Diagram: transition, enter, exit and stagger', () => {
  const animation = {
    transicion: ok(buildTransition([p('duration', 120), p('easing', 'ease-out')])),
    transicionesDeEstado: { hover: ok(buildTransition([p('duration', 60)])) },
    entrada: ok(buildEffect('zoom', [p('duration', 300)])),
    salida: ok(buildEffect('fade', [p('duration', 200), p('reduced', 'instant')])),
    escalonadoMs: 80,
  };
  const theme = themeWith({ animacion: animation }, false);

  it('base and per-state transition compile to CSS transitions of painted properties only', async () => {
    const css = sheetOf(await draw(theme));

    expect(css).toMatch(/\.rd-nodo,[^{]*\{transition:[^;}]*opacity 120ms ease-out[^;}]*scale 120ms ease-out/);
    expect(css).toMatch(/\[data-estados~="hover"\],[^{]*\{transition:[^;}]*opacity 60ms ease\b/);
    expect(css).not.toMatch(/transition:[^;}]*\b(?:width|height|padding|margin|top|left)\b/);
  });

  it('enter animates what is visible with a staggered delay; exit animates what is hidden', async () => {
    const css = sheetOf(await draw(theme));
    const html = await draw(theme, { visibility: (id) => (id === 'b' ? 0 : 1) });

    expect(css).toContain('@keyframes rd-in-zoom{');
    expect(css).toMatch(/\.rd-nodo:not\(\[data-oculto\]\)\{animation:rd-in-zoom 300ms ease-out calc\(0ms \+ var\(--rd-n, 0\) \* 80ms\) backwards/);
    expect(css).toMatch(/\.rd-nodo\[data-oculto\]\{transition:[^;}]*opacity 200ms ease-out/);
    expect(html.match(/data-oculto=""/g)).toHaveLength(1);
    expect(html).toMatch(/data-id="a"[^>]*>(?:<div[^>]*--rd-n:0)/);
    expect(html).toMatch(/data-id="c"[^>]*>(?:<div[^>]*--rd-n:1)/);
  });

  it('with `fresh`, the stagger counts only what was just revealed', async () => {
    const html = await draw(theme, { fresh: ['c'] });

    expect(html).toMatch(/data-id="c"[^>]*>(?:<div[^>]*--rd-n:0)/);
  });
});

describe('Diagram: reduced-motion', () => {
  const theme = themeWith({
    animacion: { entrada: ok(buildEffect('fade', [])), salida: ok(buildEffect('zoom', [p('reduced', 'instant')])), transicion: ok(buildTransition([p('reduced', 'instant')])) },
  });

  it('a single policy: system media query and manual attribute, with the Motions on their static frame', async () => {
    const css = sheetOf(await draw(theme));

    expect(css.match(/prefers-reduced-motion/g)).toHaveLength(1);
    expect(css).toMatch(/@media \(prefers-reduced-motion:reduce\)\{\s*\.[\w-]+:not\(\[data-reduced-motion="off"\]\) \.rd-anim\{animation:none!important/);
    expect(css).toMatch(/\.[\w-]+\[data-reduced-motion="on"\] \.rd-anim\{animation:none!important/);
  });

  it('enter fade reduces to a short fade; instant removes it', async () => {
    const css = sheetOf(await draw(theme));

    expect(css).toMatch(/\[data-reduced-motion="on"\] \.rd-nodo:not\(\[data-oculto\]\)\{animation-name:rd-in-fade!important;animation-duration:100ms!important/);
    expect(css).toMatch(/\[data-reduced-motion="on"\] \.rd-nodo\[data-oculto\]\{transition:none!important/);
    expect(css).toMatch(/\[data-reduced-motion="on"\] \.rd-nodo,[^{]*\{transition:none!important/);
  });

  it('the manual switch is the reducedMotion prop, independent of the system preference', async () => {
    const root = (html: string): string => /^<div[^>]*>/.exec(html)![0];

    expect(root(await draw(theme))).not.toContain('data-reduced-motion');
    expect(root(await draw(theme, { reducedMotion: 'on' }))).toContain('data-reduced-motion="on"');
    expect(root(await draw(theme, { reducedMotion: 'off' }))).toContain('data-reduced-motion="off"');
  });
});

describe('Diagram: what is animated does not affect the Metrics nor relayouts', () => {
  const animated = themeWith({
    animacion: { transicion: ok(buildTransition([])), entrada: ok(buildEffect('slide', [])), salida: ok(buildEffect('zoom', [])), escalonadoMs: 50 },
  });

  it('the Theme Metrics are the same with and without animation', () => {
    expect(metricsOf(animated, 'architecture')).toEqual(metricsOf(themeWith({}, false), 'architecture'));
  });

  it('no @keyframes nor transition touches box or flow properties', async () => {
    const kf = ok(buildKeyframes('blur', [], [{ en: 0, valor: 0 }, { en: 100, valor: 4 }]));
    const css = sheetOf(await draw(themeWith({ capas: layers(kf), animacion: animated.nodo.animacion })));
    const blocks = keyframesOf(css);

    expect(blocks.length).toBeGreaterThan(0);
    for (const block of blocks) {
      for (const forbidden of FORBIDDEN) expect(block, forbidden).not.toMatch(new RegExp(`(?:^|[{;])${forbidden}:`));
    }
    for (const [, value] of css.matchAll(/transition:([^;}]*)/g)) {
      for (const forbidden of FORBIDDEN) expect(value, forbidden).not.toMatch(new RegExp(`\\b${forbidden}\\b`));
    }
  });

  it('the position and size of each box do not change with the animation', async () => {
    const boxes = (html: string): string[] => [...html.matchAll(/class="rd-caja" data-id="[^"]+"[^>]*? style="([^"]*)"/g)].map((m) => m[1]!);
    const withValue = boxes(await draw(animated));

    expect(withValue.length).toBeGreaterThan(0);
    expect(withValue).toEqual(boxes(await draw(themeWith({}, false))));
  });
});
