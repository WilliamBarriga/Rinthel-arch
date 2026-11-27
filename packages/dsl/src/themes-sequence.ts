/** Sequence blocks of a Theme; what each Element accepts is said by `SEQUENCE_SPEC` in `theme`. */
import { CODES } from 'canonical';
import { SEQUENCE_BLOCKS, SEQUENCE_SPEC, STATES, applyOps, parseState } from 'theme';
import type { SequenceBlock, ResolvedLayer, LayerOp, Primitive, ResolvedTheme } from 'theme';

import type { SequenceItem, ThemeMarker, ThemeSequence } from './generated/ast';
import { toRange, stateErrorBase, issueWithSuggestion, rangeOf } from './positions';
import { compileBlock } from './themes-layers';
import { looseFamily } from './themes-common';
import type { Context } from './themes-common';

type SequenceBlockTheme = NonNullable<NonNullable<ResolvedTheme['secuencia']>[SequenceBlock]>;
type Markers = { origen?: Primitive; fin?: Primitive };

const empty = (): SequenceBlockTheme => ({ capas: [], textos: {}, parches: {}, estados: {}, metricas: {} });

/** Applies the blocks over `theme.secuencia` (inherited from the parent). */
export function compileSequence(blocks: readonly ThemeSequence[], theme: ResolvedTheme, ctx: Context): void {
  for (const name of SEQUENCE_BLOCKS) {
    const ofName = blocks.filter((b) => b.element === name);
    if (ofName.length === 0) continue;
    const block = theme.secuencia?.[name] ?? empty();
    theme.secuencia = { ...theme.secuencia, [name]: block };
    compileSequenceBlock(name, ofName.flatMap((b) => b.items), block, theme, ctx);
  }
}

function compileSequenceBlock(name: SequenceBlock, items: readonly SequenceItem[], block: SequenceBlockTheme, theme: ResolvedTheme, ctx: Context): void {
  const spec = SEQUENCE_SPEC[name];
  const error = (where: { $cstNode?: { range: Parameters<typeof toRange>[0] } }, message: string): void => {
    ctx.issues.push({ code: CODES.E_THEME_INVALID_VALUE, severity: 'error', file: ctx.file, ...toRange(where.$cstNode?.range).start, message });
  };
  const layersOf = (childItems: readonly SequenceItem[]) => childItems.filter((item): item is Extract<SequenceItem, { $type: 'ThemeLayer' | 'ThemeUse' }> => item.$type === 'ThemeLayer' || item.$type === 'ThemeUse');
  const marker = (item: ThemeMarker, target: Markers, inPatch: boolean): void => {
    const side = item.side === 'start' ? 'origen' : 'fin';
    if (!spec.marcadores.includes(item.side)) {
      error(item, `'${name}' does not accept marker '${item.side}'${spec.marcadores.length > 0 ? `; accepts ${spec.marcadores.join(', ')}` : ''}`);
      return;
    }
    if (item.remove === true) {
      if (inPatch) error(item, `'${item.side} none' is not valid in a patch: removing a marker is done in the base block`);
      else delete target[side];
      return;
    }
    const primitive = looseFamily(item.kind ?? '', item.props, 'marcador', ctx, rangeOf(item, 'kind').start);
    if (primitive !== undefined) target[side] = primitive;
  };

  const mode = block.capas.length === 0 ? 'definir' : 'parchear';
  const ops = compileBlock(layersOf(items), { ...ctx, mode, placement: spec.capas, candidates: [block.capas as ResolvedLayer[]], origins: new Map() });
  block.capas = applyOps(block.capas as ResolvedLayer[], ops, theme.palette, mode, spec.capas).pila;

  const patch = (childItems: readonly SequenceItem[]): LayerOp[] => compileBlock(layersOf(childItems), { ...ctx, mode: 'parchear', placement: spec.capas, candidates: [block.capas as ResolvedLayer[]], origins: new Map() });

  for (const item of items) {
    switch (item.$type) {
      case 'ThemeMarker':
        marker(item, block, false);
        break;
      case 'ThemeState': {
        const result = parseState(item.name);
        if ('error' in result) {
          ctx.issues.push(issueWithSuggestion(stateErrorBase(result.error), ctx.file, item, 'name', STATES));
          break;
        }
        for (const child of item.items) {
          if (child.$type === 'ThemeSlots') error(child, `'slots' is not valid in a state of '${name}'`);
        }
        block.estados = { ...block.estados, [result.estado]: [...(block.estados[result.estado] ?? []), ...patch(item.items as SequenceItem[])] };
        break;
      }
      case 'SequencePatch': {
        if (spec.parches === undefined || spec.parches.palabra !== item.word) {
          error(item, spec.parches === undefined ? `'${name}' has no per-variant patches` : `In '${name}' the per-variant patch is written '${spec.parches.palabra} <name> { ... }'`);
          break;
        }
        if (!spec.parches.nombres.includes(item.name)) {
          ctx.issues.push(
            issueWithSuggestion(
              { code: CODES.E_THEME_INVALID_VALUE, message: `'${item.name}' is not a variant of '${name}'; available: ${spec.parches.nombres.join(', ')}` },
              ctx.file, item, 'name', spec.parches.nombres,
            ),
          );
          break;
        }
        const previous = block.parches[item.name] ?? { ops: [] };
        const ownOne: { ops: LayerOp[] } & Markers = { ...previous, ops: [...previous.ops, ...patch(item.items)] };
        for (const child of item.items) if (child.$type === 'ThemeMarker') marker(child, ownOne, true);
        block.parches = { ...block.parches, [item.name]: ownOne };
        break;
      }
      case 'SequenceMetric': {
        const range = spec.metricas[item.key];
        if (range === undefined) {
          const available = Object.keys(spec.metricas);
          ctx.issues.push(
            issueWithSuggestion(
              { code: CODES.E_THEME_INVALID_VALUE, message: `'${item.key}' is not a Metric of '${name}'${available.length > 0 ? `; available: ${available.join(', ')}` : ''}` },
              ctx.file, item, 'key', available,
            ),
          );
          break;
        }
        const value = Number(item.value);
        if (!Number.isFinite(value) || value < range.min || value > range.max) {
          ctx.issues.push({ code: CODES.E_THEME_INVALID_VALUE, severity: 'error', file: ctx.file, ...rangeOf(item, 'value').start, message: `'${item.key}' of '${name}' ranges from ${range.min} to ${range.max}, not ${item.value}` });
        } else block.metricas = { ...block.metricas, [item.key]: value };
        break;
      }
      case 'SequenceText': {
        const allowed = spec.textos[item.slot];
        if (allowed === undefined) {
          const available = Object.keys(spec.textos);
          ctx.issues.push(
            issueWithSuggestion(
              { code: CODES.E_THEME_INVALID_VALUE, message: `'${item.slot}' is not a style of '${name}'${available.length > 0 ? `; available: ${available.join(', ')}` : ''}` },
              ctx.file, item, 'slot', available,
            ),
          );
          break;
        }
        const text = looseFamily(allowed.primitiva, item.props, allowed.ubicacion, ctx, rangeOf(item, 'slot').start);
        if (text !== undefined) block.textos = { ...block.textos, [item.slot]: text };
        break;
      }
      default:
        break;
    }
  }
}
