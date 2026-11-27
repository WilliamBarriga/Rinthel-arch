import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';

import { canonicalFormSchema, resolveView } from 'canonical';
import type { ResolvedView } from 'canonical';
import { layoutView } from 'layout';
import { Diagram } from 'render';
import type { DiagramProps } from 'render';
import { NEUTRAL_THEME, buildEffect, buildKeyframes, buildMotion, buildTransition, metricsOf } from 'theme';
import type { ResolvedTheme } from 'theme';

import { hojaDe } from './ayudas';

const p = (clave: string, valor: string | number) => ({ clave, valor });
const ok = <T,>(r: { animacion?: T }): T => r.animacion!;

const nodo = (id: string) => ({ id, type: 'servicio', title: id.toUpperCase(), description: '', children: [] });
const vista = (): ResolvedView =>
  resolveView(
    canonicalFormSchema.parse({
      specification: { nodeTypes: [{ name: 'servicio' }] },
      model: { nodes: [nodo('a'), nodo('b'), nodo('c')], edges: [{ from: { node: 'a' }, to: { node: 'b' } }] },
      views: [{ id: 'v', type: 'architecture', include: ['**'], exclude: [] }],
    }),
    'v',
    {},
  )!;

const capas = (animacion?: object) => [
  { nombre: 'forma', primitiva: { tipo: 'rect', props: { radius: 8 } } },
  { nombre: 'fondo', primitiva: { tipo: 'solid', props: { color: 'amber' } } },
  { nombre: 'acento', primitiva: { tipo: 'border', props: { color: 'blue', width: 2 } }, ...(animacion && { animacion }) },
];

const temaCon = (nodoExtra: Record<string, unknown> = {}, conAnimacion = true): ResolvedTheme =>
  ({
    ...NEUTRAL_THEME,
    nodo: { slots: NEUTRAL_THEME.nodo.slots, tipos: {}, estados: {}, capas: capas(conAnimacion ? ok(buildMotion('pulse', [p('duration', 1200), p('intensity', '0.4')])) : undefined), ...nodoExtra },
  }) as unknown as ResolvedTheme;

async function dibujar(theme: ResolvedTheme, extra: Partial<DiagramProps> = {}): Promise<string> {
  const view = vista();
  const geometry = await layoutView(view, NEUTRAL_THEME);
  return renderToStaticMarkup(<Diagram view={view} geometry={geometry} theme={theme} width={800} height={600} {...extra} />);
}

/** Propiedades CSS que, animadas, cambiarian la caja o el flujo (Metricas): ninguna debe aparecer en un @keyframes. */
const PROHIBIDAS = ['width', 'height', 'padding', 'margin', 'top', 'left', 'right', 'bottom', 'gap', 'font-size', 'line-height', 'border-width', 'display', 'position'];

function keyframesDe(css: string): string[] {
  return [...css.matchAll(/@keyframes [\w-]+\{([\s\S]*?\}\s*)\}/g)].map((m) => m[1]!);
}

describe('Diagram: Movimientos de Capa', () => {
  it('una Capa con Movimiento se dibuja como elemento propio, fuera de la caja fusionada', async () => {
    const html = await dibujar(temaCon());
    const css = hojaDe(html);

    expect(html.match(/class="rd-anim" data-anim="acento"/g)).toHaveLength(3);
    expect(css).toMatch(/\.rd-nodo\{[^}]*border-radius:8px/);
    expect(css).not.toMatch(/\.rd-nodo\{[^}]*border:2px/);
    expect(css).toMatch(/\.rd-anim\[data-anim="acento"\]\{[^}]*border:2px solid[^}]*animation:rd-mov-pulse 1200ms ease-in-out 0ms infinite[^}]*--rd-i:0\.4/);
    expect(css).toMatch(/@keyframes rd-mov-pulse\{/);
  });

  it('todos los Movimientos del catalogo compilan a CSS nativo', async () => {
    for (const nombre of ['stream', 'pulse', 'breathe', 'spin', 'aura']) {
      const css = hojaDe(await dibujar(temaCon({ capas: capas(ok(buildMotion(nombre, []))) })));

      expect(css, nombre).toContain(`@keyframes rd-mov-${nombre}{`);
    }
  });

  it('un Movimiento atado a un estado solo corre con ese estado', async () => {
    const aura = ok(buildMotion('aura', []));
    const tema = temaCon({ capas: capas(), estados: { selected: [{ nombre: 'acento', props: {}, animacion: aura }] } }, false);
    const sinEstado = await dibujar(tema);
    const seleccionado = await dibujar(tema, { estados: { a: ['selected'] } });
    const css = hojaDe(seleccionado);

    expect(sinEstado).not.toContain('data-estados="');
    expect(seleccionado).toMatch(/data-id="a"[^>]*><div[^>]*data-part="nodo"[^>]*data-estados="selected"/);
    expect(css).toMatch(/\[data-estados~="selected"\] \.rd-anim\[data-anim="acento"\]\{[^}]*animation:rd-mov-aura/);
    expect(css).not.toMatch(/^\.[\w-]+ \.rd-anim\[data-anim="acento"\]\{[^}]*animation:/m);
  });

  it('keyframes minimos se compilan a un @keyframes propio y determinista', async () => {
    const kf = ok(buildKeyframes('shift-x', [p('duration', 2000)], [{ en: 0, valor: 0 }, { en: 50, valor: -10 }, { en: 100, valor: 0 }]));
    const css = hojaDe(await dibujar(temaCon({ capas: capas(kf) })));

    expect(css).toMatch(/@keyframes (rd-kf-\w+)\{0%\{translate:0px 0\}50%\{translate:-10px 0\}100%\{translate:0px 0\}\}/);
    expect(css).toBe(hojaDe(await dibujar(temaCon({ capas: capas(kf) }))));
  });
});

describe('Diagram: transition, enter, exit y stagger', () => {
  const animacion = {
    transicion: ok(buildTransition([p('duration', 120), p('easing', 'ease-out')])),
    transicionesDeEstado: { hover: ok(buildTransition([p('duration', 60)])) },
    entrada: ok(buildEffect('zoom', [p('duration', 300)])),
    salida: ok(buildEffect('fade', [p('duration', 200), p('reduced', 'instant')])),
    escalonadoMs: 80,
  };
  const tema = temaCon({ animacion }, false);

  it('transition base y por estado compilan a transiciones CSS solo de propiedades pintadas', async () => {
    const css = hojaDe(await dibujar(tema));

    expect(css).toMatch(/\.rd-nodo,[^{]*\{transition:[^;}]*opacity 120ms ease-out[^;}]*scale 120ms ease-out/);
    expect(css).toMatch(/\[data-estados~="hover"\],[^{]*\{transition:[^;}]*opacity 60ms ease\b/);
    expect(css).not.toMatch(/transition:[^;}]*\b(?:width|height|padding|margin|top|left)\b/);
  });

  it('enter anima lo visible con retardo escalonado; exit anima lo que se oculta', async () => {
    const css = hojaDe(await dibujar(tema));
    const html = await dibujar(tema, { visibility: (id) => (id === 'b' ? 0 : 1) });

    expect(css).toContain('@keyframes rd-in-zoom{');
    expect(css).toMatch(/\.rd-nodo:not\(\[data-oculto\]\)\{animation:rd-in-zoom 300ms ease-out calc\(0ms \+ var\(--rd-n, 0\) \* 80ms\) backwards/);
    expect(css).toMatch(/\.rd-nodo\[data-oculto\]\{transition:[^;}]*opacity 200ms ease-out/);
    expect(html.match(/data-oculto=""/g)).toHaveLength(1);
    expect(html).toMatch(/data-id="a"[^>]*>(?:<div[^>]*--rd-n:0)/);
    expect(html).toMatch(/data-id="c"[^>]*>(?:<div[^>]*--rd-n:1)/);
  });

  it('con `nuevos`, el escalonado cuenta solo lo recien revelado', async () => {
    const html = await dibujar(tema, { nuevos: ['c'] });

    expect(html).toMatch(/data-id="c"[^>]*>(?:<div[^>]*--rd-n:0)/);
  });
});

describe('Diagram: reduced-motion', () => {
  const tema = temaCon({
    animacion: { entrada: ok(buildEffect('fade', [])), salida: ok(buildEffect('zoom', [p('reduced', 'instant')])), transicion: ok(buildTransition([p('reduced', 'instant')])) },
  });

  it('una sola politica: media query del sistema y atributo manual, con los Movimientos en su fotograma estatico', async () => {
    const css = hojaDe(await dibujar(tema));

    expect(css.match(/prefers-reduced-motion/g)).toHaveLength(1);
    expect(css).toMatch(/@media \(prefers-reduced-motion:reduce\)\{\s*\.[\w-]+:not\(\[data-reduced-motion="off"\]\) \.rd-anim\{animation:none!important/);
    expect(css).toMatch(/\.[\w-]+\[data-reduced-motion="on"\] \.rd-anim\{animation:none!important/);
  });

  it('enter fade reduce a un fundido corto; instant lo elimina', async () => {
    const css = hojaDe(await dibujar(tema));

    expect(css).toMatch(/\[data-reduced-motion="on"\] \.rd-nodo:not\(\[data-oculto\]\)\{animation-name:rd-in-fade!important;animation-duration:100ms!important/);
    expect(css).toMatch(/\[data-reduced-motion="on"\] \.rd-nodo\[data-oculto\]\{transition:none!important/);
    expect(css).toMatch(/\[data-reduced-motion="on"\] \.rd-nodo,[^{]*\{transition:none!important/);
  });

  it('el interruptor manual es la prop reducedMotion, independiente de la preferencia del sistema', async () => {
    const raiz = (html: string): string => /^<div[^>]*>/.exec(html)![0];

    expect(raiz(await dibujar(tema))).not.toContain('data-reduced-motion');
    expect(raiz(await dibujar(tema, { reducedMotion: 'on' }))).toContain('data-reduced-motion="on"');
    expect(raiz(await dibujar(tema, { reducedMotion: 'off' }))).toContain('data-reduced-motion="off"');
  });
});

describe('Diagram: lo animado no afecta a las Metricas ni relayouta', () => {
  const animada = temaCon({
    animacion: { transicion: ok(buildTransition([])), entrada: ok(buildEffect('slide', [])), salida: ok(buildEffect('zoom', [])), escalonadoMs: 50 },
  });

  it('las Metricas del Tema son las mismas con y sin animacion', () => {
    expect(metricsOf(animada, 'architecture')).toEqual(metricsOf(temaCon({}, false), 'architecture'));
  });

  it('ningun @keyframes ni transition toca propiedades de caja o de flujo', async () => {
    const kf = ok(buildKeyframes('blur', [], [{ en: 0, valor: 0 }, { en: 100, valor: 4 }]));
    const css = hojaDe(await dibujar(temaCon({ capas: capas(kf), animacion: animada.nodo.animacion })));
    const bloques = keyframesDe(css);

    expect(bloques.length).toBeGreaterThan(0);
    for (const bloque of bloques) {
      for (const prohibida of PROHIBIDAS) expect(bloque, prohibida).not.toMatch(new RegExp(`(?:^|[{;])${prohibida}:`));
    }
    for (const [, valor] of css.matchAll(/transition:([^;}]*)/g)) {
      for (const prohibida of PROHIBIDAS) expect(valor, prohibida).not.toMatch(new RegExp(`\\b${prohibida}\\b`));
    }
  });

  it('la posicion y el tamano de cada caja no cambian con la animacion', async () => {
    const cajas = (html: string): string[] => [...html.matchAll(/class="rd-caja" data-id="[^"]+"[^>]*? style="([^"]*)"/g)].map((m) => m[1]!);
    const con = cajas(await dibujar(animada));

    expect(con.length).toBeGreaterThan(0);
    expect(con).toEqual(cajas(await dibujar(temaCon({}, false))));
  });
});
