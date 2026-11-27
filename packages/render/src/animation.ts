/**
 * Declarative animation of the resolved Style compiled to native CSS (ADR 0008):
 * Layer Motions and `keyframes`, `transition` between states, `enter`/`exit`
 * and `stagger`. Pure and deterministic; no dependencies nor clock: the browser
 * runs the animations. Only painted or composable properties are animated
 * (opacity, color, `scale`/`rotate`/`translate`, shadow, filter, background
 * position), never the ones that change the box: what is animated never triggers a relayout.
 *
 * The `prefers-reduced-motion` policy lives only in `reducedPolicy`: a
 * system media query plus the manual `data-reduced-motion="on"|"off"` attribute
 * of the container, which decides even if the system says otherwise. A Theme declares
 * `reduced` per animation but cannot disable the policy.
 */
import { STATES } from 'theme';
import type { Animation, NodeAnimation, PaintedLayer, LayerKeyframes, Motion, EffectName, MotionName, NodePaint, AnimatableProperty, Transition } from 'theme';

import { fingerprint, cleanCssValue, num } from './element';
import type { MarkupElement } from './element';
import type { Style } from './style';
import { ELEMENTS, elementStacks, elementPaint } from './stacks';
import type { ElementKey, CurrentStack } from './stacks';
import { borderWidth, offsetDeclarations, isOffset } from './paint/common';

export type Declarations = Record<string, string>;
type Rule = [selector: string, declarations: Declarations];

/** Duration and delay of the fade reduced-motion turns entries, exits and transitions into. */
const SHORT_FADE = '100ms';

/** `@keyframes` body of each Motion; `--rd-i` is the intensity. Adding one to the catalog without an entry here breaks the typecheck. */
const CSS_MOTION: { readonly [M in MotionName]: string } = {
  stream: 'to{background-position:var(--rd-stream,40px) 0}',
  pulse: '0%,100%{opacity:1}50%{opacity:calc(1 - var(--rd-i,0.5) * 0.7)}',
  breathe: '0%,100%{scale:1}50%{scale:calc(1 + var(--rd-i,0.5) * 0.08)}',
  spin: 'to{rotate:360deg}',
  aura: '0%,100%{box-shadow:0 0 0 0 transparent}50%{box-shadow:0 0 calc(var(--rd-i,0.5) * 24px) calc(var(--rd-i,0.5) * 4px) var(--trazo,currentColor)}',
};

/** Initial (enter) or final (exit) state of each effect; the exit opacity is set by the visibility. */
const CSS_EFFECT: { readonly [E in EffectName]: Declarations } = {
  fade: { opacity: '0' },
  zoom: { opacity: '0', scale: '0.85' },
  slide: { opacity: '0', translate: '0 12px' },
};

/** CSS declaration of each animatable `keyframes` property. */
const CSS_PROPERTY: { readonly [P in AnimatableProperty]: (value: number) => string } = {
  opacity: (v) => `opacity:${num(v)}`,
  scale: (v) => `scale:${num(v)}`,
  rotate: (v) => `rotate:${num(v)}deg`,
  'shift-x': (v) => `translate:${num(v)}px 0`,
  'shift-y': (v) => `translate:0 ${num(v)}px`,
  blur: (v) => `filter:blur(${num(v)}px)`,
};

/** Properties `transition` interpolates: only paint and compositing. */
const TRANSITION_PROPERTIES = ['opacity', 'color', 'background-color', 'border-color', 'box-shadow', 'filter', 'scale', 'rotate', 'translate'];

const block = (d: Declarations): string => Object.entries(d).map(([k, v]) => `${k}:${v}`).join(';');

/**
 * Names of the Layers of a stack that go in their own element: the ones
 * with an animation or `offset`/`grow`, at rest or in some state. They cannot
 * merge into the box because they animate or move separately.
 */
export function namesApart({ capas: layers, estados: states }: Pick<NodePaint, 'capas' | 'estados'>): Set<string> {
  const withState = new Set(
    Object.values(states).flatMap((stack) => (stack ?? []).filter((c) => c.animacion !== undefined || isOffset(c)).map((c) => c.nombre)),
  );
  return new Set(layers.filter((c) => c.animacion !== undefined || isOffset(c) || withState.has(c.nombre)).map((c) => c.nombre));
}

/** Elements of a stack's Layers with their own element, under the content (`above` false) or over it. */
export function paintAnimatedLayers(stack: Pick<NodePaint, 'capas' | 'estados'>, above: boolean): MarkupElement[] {
  const animatedList = namesApart(stack);
  return stack.capas
    .filter((layer) => animatedList.has(layer.nombre) && (layer.encima === true) === above)
    .map((layer) => ({ tag: 'div', attrs: { class: 'rd-anim', 'data-anim': layer.nombre, 'aria-hidden': 'true' } }));
}

const ms = (value: number): string => `${num(value)}ms`;

interface Compiled {
  declarations: Declarations;
  blocks: string[];
}

function compileAnimation(animation: Animation): Compiled {
  const time = `${ms(animation.duracionMs)} ${animation.easing} ${ms(animation.retardoMs)} infinite`;
  if (animation.clase === 'movimiento') return compileMotion(animation, time);
  return compileKeyframes(animation, time);
}

function compileMotion(m: Motion, time: string): Compiled {
  const name = `rd-mov-${m.movimiento}`;
  return {
    declarations: { animation: `${name} ${time}`, ...(m.intensidad !== undefined && { '--rd-i': num(m.intensidad) }) },
    blocks: [`@keyframes ${name}{${CSS_MOTION[m.movimiento]}}`],
  };
}

function compileKeyframes(k: LayerKeyframes, time: string): Compiled {
  const name = `rd-kf-${fingerprint(JSON.stringify([k.propiedad, k.pasos]))}`;
  const steps = k.pasos.map((step) => `${num(step.en)}%{${CSS_PROPERTY[k.propiedad](step.valor)}}`).join('');
  return { declarations: { animation: `${name} ${time}` }, blocks: [`@keyframes ${name}{${steps}}`] };
}

const cssTransition = (t: Transition): string => TRANSITION_PROPERTIES.map((p) => `${p} ${ms(t.duracionMs)} ${t.easing}`).join(',');

/**
 * `scale` that takes a Layer's element from its resting `grow` to a state's, or `undefined` if the state does not
 * change it. `width` and `height` are not transitioned (only paint and compositing); the factor comes from the box size,
 * which the Node exposes as `--rd-ancho` and `--rd-alto` (unitless numbers), and from the fixed top left corner.
 */
function growthOf(ofState: PaintedLayer, base: PaintedLayer, border: number): string | undefined {
  const before = Number(base.props['grow'] ?? 0);
  const after = Number(ofState.props['grow'] ?? before);
  if (before === after) return undefined;
  const axis = (variable: string): string => `calc((var(${variable}) + ${num(after + 2 * border)}) / (var(${variable}) + ${num(before + 2 * border)}))`;
  return `${axis('--rd-ancho')} ${axis('--rd-alto')}`;
}

function layerRules({ selector: element, stack }: CurrentStack, layerDeclarations: (layer: PaintedLayer) => Declarations, output: { rules: Rule[]; blocks: string[] }): void {
  const { capas: layers, estados: states } = stack;
  const animatedList = namesApart(stack);
  const emitted = new Set<string>();
  // The border of the merged box: a Layer's own element covers the box from its outer outline.
  const border = borderWidth(layers.filter((c) => !animatedList.has(c.nombre)));
  /** Declarations of a Layer as its own element: its paint and its offset. */
  const paintedAsElement = (layer: PaintedLayer): Declarations => ({
    ...Object.fromEntries(Object.entries(layerDeclarations(layer)).map(([k, v]) => [k, cleanCssValue(v)])),
    ...offsetDeclarations(layer.props, border),
  });
  const add = (c: Compiled): void => {
    for (const b of c.blocks) {
      if (emitted.has(b)) continue;
      emitted.add(b);
      output.blocks.push(b);
    }
  };
  // Own-element Layers that come before the first merged Layer (an offset shadow) stay under the box, not over its fill.
  // Only the ones that paint in the box count: a tilt or a tape (per element) do not cover it.
  const firstMerged = layers.findIndex((c) => !animatedList.has(c.nombre) && Object.keys(layerDeclarations(c)).length > 0);
  layers.forEach((layer, index) => {
    if (!animatedList.has(layer.nombre)) return;
    const below = layer.encima !== true && firstMerged > index;
    const selector = `${element} .rd-anim[data-anim="${layer.nombre.replace(/[^\w-]/g, '')}"]`;
    const basePainted = paintedAsElement(layer);
    const growsInState = STATES.some((state) => {
      const ofState = states[state]?.find((c) => c.nombre === layer.nombre);
      return ofState !== undefined && growthOf(ofState, layer, border) !== undefined;
    });
    const own = layer.animacion === undefined ? undefined : compileAnimation(layer.animacion);
    if (own !== undefined) add(own);
    output.rules.push([
      selector,
      {
        position: 'absolute',
        left: '0',
        top: '0',
        width: '100%',
        height: '100%',
        'box-sizing': 'border-box',
        'pointer-events': 'none',
        'border-radius': 'inherit',
        ...(growsInState && { 'transform-origin': '0 0' }),
        ...(below && { 'z-index': '-1' }),
        ...basePainted,
        ...own?.declarations,
      },
    ]);
    for (const state of STATES) {
      const ofState = states[state]?.find((c) => c.nombre === layer.nombre);
      if (ofState === undefined) continue;
      const grows = growthOf(ofState, layer, border);
      // The growth of a state animates with `scale` (compositor), not with width/height: see `growthOf`.
      const changed = Object.fromEntries(
        Object.entries(paintedAsElement(ofState)).filter(([k, v]) => basePainted[k] !== v && !(grows !== undefined && (k === 'width' || k === 'height'))),
      );
      if (grows !== undefined) changed['scale'] = grows;
      const animationChanges = JSON.stringify(ofState.animacion) !== JSON.stringify(layer.animacion);
      const compiled = !animationChanges || ofState.animacion === undefined ? undefined : compileAnimation(ofState.animacion);
      if (compiled !== undefined) add(compiled);
      const animation = !animationChanges ? {} : (compiled?.declarations ?? { animation: 'none' });
      if (Object.keys(changed).length === 0 && !animationChanges) continue;
      output.rules.push([`${element}[data-estados~="${state}"] .rd-anim[data-anim="${layer.nombre.replace(/[^\w-]/g, '')}"]`, { ...changed, ...animation }]);
    }
  });
}

/** `transition`, `enter`, `exit` and `stagger` of an element (`animation` is its block's), under its own class. */
function elementRules(key: ElementKey, animation: NodeAnimation | undefined, output: { rules: Rule[]; blocks: string[]; reducedRules: Rule[] }): void {
  if (animation === undefined) return;
  const { transicion: transitionValue, transicionesDeEstado: stateTransitions, entrada: input, salida: nodeExit, escalonadoMs: staggerMs } = animation;
  const box = `& .rd-${key}`;
  const target = `${box}, ${box} .rd-anim`;
  const VISIBLE = `${box}:not([data-oculto])`;
  const HIDDEN = `${box}[data-oculto]`;

  if (transitionValue !== undefined) {
    output.rules.push([target, { transition: cssTransition(transitionValue) }]);
    output.reducedRules.push([target, reduced(transitionValue.reducido, 'transition')]);
  }
  for (const state of STATES) {
    const t = stateTransitions?.[state];
    if (t === undefined) continue;
    const selector = `${box}[data-estados~="${state}"], ${box}[data-estados~="${state}"] .rd-anim`;
    output.rules.push([selector, { transition: cssTransition(t) }]);
    output.reducedRules.push([selector, reduced(t.reducido, 'transition')]);
  }
  if (input !== undefined) {
    const delay = `calc(${ms(input.retardoMs)} + var(--rd-n, 0) * ${ms(staggerMs ?? 0)})`;
    output.blocks.push(`@keyframes rd-in-${input.efecto}{from{${block(CSS_EFFECT[input.efecto])}}}`);
    output.rules.push([VISIBLE, { animation: `rd-in-${input.efecto} ${ms(input.duracionMs)} ${input.easing} ${delay} backwards` }]);
    if (input.reducido === 'fade' && input.efecto !== 'fade') output.blocks.push(`@keyframes rd-in-fade{from{${block(CSS_EFFECT['fade'])}}}`);
    output.reducedRules.push([VISIBLE, reduced(input.reducido, 'animation')]);
  }
  if (nodeExit !== undefined) {
    const { efecto: effect, duracionMs: durationMs, easing, retardoMs: delayMs } = nodeExit;
    const properties = ['opacity', 'scale', 'translate'].map((p) => `${p} ${ms(durationMs)} ${easing} ${ms(delayMs)}`).join(',');
    const { opacity: _opacity, ...finalValue } = CSS_EFFECT[effect];
    output.rules.push([HIDDEN, { transition: properties, ...finalValue }]);
    output.reducedRules.push([HIDDEN, reduced(nodeExit.reducido, 'transition')]);
  }
}

/** Declarations reduced-motion turns an animation into: a short fade or an instant change. */
function reduced(mode: 'fade' | 'instant', kind: 'transition' | 'animation'): Declarations {
  if (mode === 'instant') return kind === 'transition' ? { transition: 'none!important' } : { animation: 'none!important' };
  if (kind === 'transition') return { transition: `opacity ${SHORT_FADE} linear!important` };
  return { 'animation-name': 'rd-in-fade!important', 'animation-duration': `${SHORT_FADE}!important`, 'animation-delay': '0s!important' };
}

/**
 * Single reduced-motion policy. With the system preference (unless the
 * switch says `off`) or with the switch `on`: Motions stay on
 * their static frame and the rest is reduced according to each animation's `reduced`.
 */
function reducedPolicy(rules: readonly Rule[]): string[] {
  if (rules.length === 0) return [];
  const under = (prefixText: string): string =>
    rules.map(([selector, d]) => `${selector.split(', ').map((s) => s.replace('&', prefixText)).join(',')}{${block(d)}}`).join('');
  return [`@media (prefers-reduced-motion:reduce){${under('&:not([data-reduced-motion="off"])')}}`, under('&[data-reduced-motion="on"]')];
}

/**
 * Rules and blocks of the Style animation. Blocks already carry `&` where
 * the scope class goes; `layerDeclarations` is the Primitive painter.
 */
export function sheetAnimation(style: Style, layerDeclarations: (layer: PaintedLayer) => Declarations): { rules: Rule[]; blocks: string[] } {
  const output = { rules: [] as Rule[], blocks: [] as string[], reducedRules: [] as Rule[] };
  let hasLayers = false;
  for (const key of ELEMENTS) {
    for (const current of elementStacks(style.paint, key)) {
      layerRules(current, layerDeclarations, output);
      hasLayers ||= namesApart(current.stack).size > 0;
    }
    elementRules(key, elementPaint(style.paint, key).animacion, output);
  }
  const reducedRules: Rule[] = [...(hasLayers ? ([['& .rd-anim', { animation: 'none!important' }]] as Rule[]) : []), ...output.reducedRules];
  // Two elements with the same entry emit the same `@keyframes`: only one.
  return { rules: output.rules, blocks: [...new Set(output.blocks), ...reducedPolicy(reducedRules)] };
}
