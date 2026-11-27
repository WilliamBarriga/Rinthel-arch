/**
 * Theme `code <Component>` Layers (ADR 0008). `render` never imports Workspace code: it receives the
 * `ThemeComponents` registry and draws each Layer in a fixed-size container equal to the element's box, with
 * `contain: layout style`. The component only sees `CodeProps` and cannot change the size nor the Metrics.
 */
import type { ComponentType } from 'react';
import type { PaintedLayer, NodePaint } from 'theme';
import type { ResolvedNode } from 'canonical';

import { cleanCssValue, num } from './element';
import type { MarkupElement } from './element';
import type { Style } from './style';

/** All a Theme component sees: the computed box, state, resolved colors, id, parameters and bounded data. Its keys are the component contract and stay as they are. */
export interface CodeProps {
  /** Element id (deterministic seed for anything random). */
  readonly id: string;
  /** Element box in px; the component cannot change it. */
  readonly caja: { readonly ancho: number; readonly alto: number };
  /** Current visual states (`hover`, `selected`...); empty at rest. */
  readonly estado: readonly string[];
  /** Colors already resolved from the Palette: the stroke of the Node kind, the text and the background of the Theme. */
  readonly colores: { readonly trazo: string; readonly texto: string; readonly fondo: string };
  /** Parameters declared in the `code` Layer, with the state patches applied. */
  readonly parametros: Readonly<Record<string, number | string>>;
  /** Bounded data of the Node; never the whole Model. */
  readonly datos: { readonly tipo: string; readonly titulo: string; readonly tieneContenido: boolean };
}

export type ThemeComponent = ComponentType<CodeProps>;

/** name -> component registry: the port through which Workspace code comes in. */
export type ThemeComponents = Readonly<Record<string, ThemeComponent>>;

const freeze = <T extends object>(value: T): Readonly<T> => Object.freeze(value);

/**
 * `code` Layers of a Node or Group, under the content (`above` false) or over it.
 * A current state patch changes the parameters of the Layer with the same name.
 */
export function paintCode(
  style: Style,
  stack: Pick<NodePaint, 'capas' | 'estados'>,
  data: { node: ResolvedNode; width: number; height: number; stroke: string; states: readonly string[]; hasContent: boolean; components: ThemeComponents | undefined },
  above: boolean,
): MarkupElement[] {
  const { node, width, height, stroke, states, hasContent, components } = data;
  const { capas: layers, estados: byState } = stack;
  return layers
    .filter((layer) => layer.tipo === 'code' && (layer.encima === true) === above)
    .map((base): MarkupElement => {
      const current = currentInState(base, states, byState);
      const { component, ...params } = current.props;
      const name = String(component);
      const kind = components === undefined || !Object.hasOwn(components, name) ? undefined : components[name];
      const props: CodeProps = freeze({
        id: node.id,
        caja: freeze({ ancho: width, alto: height }),
        estado: freeze([...states]),
        colores: freeze({ trazo: stroke, texto: style.text, fondo: style.background }),
        parametros: freeze(params),
        datos: freeze({ tipo: node.type, titulo: node.title, tieneContenido: hasContent }),
      });
      return {
        tag: 'div',
        attrs: { class: 'rd-codigo', 'data-codigo': name, 'data-capa-nombre': base.nombre, style: `width:${num(width)}px;height:${num(height)}px;--trazo:${cleanCssValue(stroke)};` },
        ...(kind !== undefined && { component: { kind, props } }),
      };
    });
}

/** The Layer as it ends up with the first current state that patches it (same rule as the cascade: the patch wins). */
function currentInState(base: PaintedLayer, states: readonly string[], byState: Partial<Record<string, PaintedLayer[]>>): PaintedLayer {
  for (const state of states) {
    const patched = byState[state]?.find((layer) => layer.nombre === base.nombre && layer.tipo === 'code');
    if (patched !== undefined) return patched;
  }
  return base;
}
