/** `edge` block of a Theme: stroke stack (stroke Family); each marker and the label are a loose Primitive. */
import { CODES } from 'canonical';
import { STATES, applyOps, parseState } from 'theme';
import type { ResolvedLayer, LayerOp, Primitive, ResolvedTheme } from 'theme';

import type { EdgeItem, ThemeDiagram, ThemeLabel, ThemeLayer, ThemeMarker, ThemeUse } from './generated/ast';
import { toRange, stateErrorBase, issueWithSuggestion, rangeOf } from './positions';
import { compileBlock } from './themes-layers';
import { diagramName, looseFamily } from './themes-common';
import type { Context } from './themes-common';

/** Applies the `edge { ... }` blocks over `theme.arista` (inherited from the parent or from the neutral one). */
export function compileEdge(items: readonly EdgeItem[], theme: ResolvedTheme, ctx: Context): void {
  const ofBlock = items.filter((item): item is ThemeLayer | ThemeUse => item.$type === 'ThemeLayer' || item.$type === 'ThemeUse');
  const mode = theme.arista.capas.length === 0 ? 'definir' : 'parchear';
  const ops = compileBlock(ofBlock, {
    ...ctx,
    mode: mode,
    placement: 'capa-arista',
    candidates: [theme.arista.capas as ResolvedLayer[]],
    origins: new Map(),
  });
  theme.arista.capas = applyOps(theme.arista.capas as ResolvedLayer[], ops, theme.palette, mode, 'capa-arista').pila;

  for (const item of items) {
    if (item.$type === 'ThemeMarker') compileMarker(item, theme.arista, ctx);
    else if (item.$type === 'ThemeLabel') {
      const label = looseFamily('label', (item as ThemeLabel).props, 'etiqueta', ctx, toRange(item.$cstNode?.range).start);
      if (label !== undefined) theme.arista.etiqueta = label;
    } else if (item.$type === 'ThemeDiagram') compileEdgeDiagram(item, theme, ctx);
    else if (item.$type === 'EdgeIdentifying') {
      const previous = theme.arista.identificante ?? [];
      const current = applyOps(theme.arista.capas as ResolvedLayer[], previous, theme.palette, 'parchear', 'capa-arista').pila;
      const ops = compileBlock(item.items, { ...ctx, mode: 'parchear', placement: 'capa-arista', candidates: [current], origins: new Map() });
      theme.arista.identificante = [...previous, ...ops];
    } else if (item.$type === 'ThemeState') {
      // Paint-only: a state patches the stroke stack (Layers and Parts); markers, label and Metrics stay.
      const result = parseState(item.name);
      if ('error' in result) {
        ctx.issues.push(issueWithSuggestion(stateErrorBase(result.error), ctx.file, item, 'name', STATES));
        continue;
      }
      for (const child of item.items) {
        if (child.$type === 'ThemeSlots' || child.$type === 'ThemeTransition') {
          ctx.issues.push({ code: CODES.E_THEME_INVALID_VALUE, severity: 'error', file: ctx.file, ...toRange(child.$cstNode?.range).start, message: `'${child.$type === 'ThemeSlots' ? 'slots' : 'transition'}' is not valid in a state of 'edge'` });
        }
      }
      const layers = item.items.filter((i): i is ThemeLayer | ThemeUse => i.$type === 'ThemeLayer' || i.$type === 'ThemeUse');
      const previous = theme.arista.estados?.[result.estado] ?? [];
      const current = applyOps(theme.arista.capas as ResolvedLayer[], previous, theme.palette, 'parchear', 'capa-arista').pila;
      const ops = compileBlock(layers, { ...ctx, mode: 'parchear', placement: 'capa-arista', candidates: [current], origins: new Map() });
      theme.arista.estados = { ...theme.arista.estados, [result.estado]: [...previous, ...ops] };
    }
  }
}

type EdgePatch = { ops: LayerOp[]; origen?: Primitive; fin?: Primitive; etiqueta?: Primitive };

/** `edge { diagram <type> { ... } }`; several blocks of the same type accumulate. */
function compileEdgeDiagram(item: ThemeDiagram, theme: ResolvedTheme, ctx: Context): void {
  const diagram = diagramName(item, ctx.file, ctx.issues);
  if (diagram === undefined) return;
  const previous: EdgePatch = theme.arista.diagramas?.[diagram] ?? { ops: [] };
  const current = applyOps(theme.arista.capas as ResolvedLayer[], previous.ops, theme.palette, 'parchear', 'capa-arista').pila;
  const layers = item.items.filter((i): i is ThemeLayer | ThemeUse => i.$type === 'ThemeLayer' || i.$type === 'ThemeUse');
  const ops = compileBlock(layers, { ...ctx, mode: 'parchear', placement: 'capa-arista', candidates: [current], origins: new Map() });
  const patch: EdgePatch = { ...previous, ops: [...previous.ops, ...ops] };
  for (const child of item.items) {
    if (child.$type === 'ThemeMarker') {
      if (child.remove === true) {
        ctx.issues.push({ code: CODES.E_THEME_INVALID_VALUE, severity: 'error', file: ctx.file, ...toRange(child.$cstNode?.range).start, message: `'${child.side} none' is not valid in 'diagram': removing a marker is done in the base block` });
      } else compileMarker(child, patch, ctx);
    } else if (child.$type === 'ThemeLabel') {
      const label = looseFamily('label', child.props, 'etiqueta', ctx, toRange(child.$cstNode?.range).start);
      if (label !== undefined) patch.etiqueta = label;
    } else if (child.$type === 'ThemeSlots' || child.$type === 'GroupPadding') {
      ctx.issues.push({ code: CODES.E_THEME_INVALID_VALUE, severity: 'error', file: ctx.file, ...toRange(child.$cstNode?.range).start, message: `'${child.$type === 'ThemeSlots' ? 'slots' : 'padding'}' does not belong to the Edge: put it in 'node' or 'group'` });
    }
  }
  theme.arista.diagramas = { ...theme.arista.diagramas, [diagram]: patch };
}

function compileMarker(item: ThemeMarker, target: { origen?: Primitive; fin?: Primitive }, ctx: Context): void {
  const side = item.side === 'start' ? 'origen' : 'fin';
  if (item.remove === true) {
    delete target[side];
    return;
  }
  const marker = looseFamily(item.kind ?? '', item.props, 'marcador', ctx, rangeOf(item, 'kind').start);
  if (marker !== undefined) target[side] = marker;
}
