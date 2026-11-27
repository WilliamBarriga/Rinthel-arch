/** `row` block of a Theme (ER table row). A row patch only paints; the rules belong to the `theme` catalog. */
import { CODES } from 'canonical';
import { ROW_HEIGHT, ROW_KEYS, STATES, ROW_TEXT_NAMES, ROW_TEXTS, applyOps, opTouchesMetrics, parseState, validateProperties } from 'theme';
import type { ResolvedLayer, LayerOp, ResolvedTheme, RowTextName } from 'theme';

import type { RowItem, ThemeLayer, ThemeUse } from './generated/ast';
import { toRange, stateErrorBase, issueWithSuggestion, rangeOf } from './positions';
import { compileBlock } from './themes-layers';
import { themeIssue, looseFamily } from './themes-common';
import type { Context } from './themes-common';

type RowTheme = NonNullable<ResolvedTheme['fila']>;

/** Applies the `row { ... }` blocks over `theme.fila` (inherited from the parent or empty). */
export function compileRow(items: readonly RowItem[], theme: ResolvedTheme, ctx: Context): void {
  if (items.length === 0) return;
  const row: RowTheme = theme.fila ?? { capas: [], alterna: [], textos: {}, claves: {}, opcional: [], estados: {} };
  theme.fila = row;

  const ofBlock = items.filter((item): item is ThemeLayer | ThemeUse => item.$type === 'ThemeLayer' || item.$type === 'ThemeUse');
  const mode = row.capas.length === 0 ? 'definir' : 'parchear';
  const ops = compileBlock(ofBlock, { ...ctx, mode, candidates: [row.capas as ResolvedLayer[]], origins: new Map() });
  row.capas = applyOps(row.capas as ResolvedLayer[], ops, theme.palette, mode).pila;

  /** Validated against the base stack of the row; it cannot change the box. */
  const patch = (childItems: readonly (ThemeLayer | ThemeUse)[], where: { $cstNode?: { range: Parameters<typeof toRange>[0] } }): LayerOp[] => {
    const ownList = compileBlock(childItems, { ...ctx, mode: 'parchear', candidates: [row.capas as ResolvedLayer[]], origins: new Map() });
    for (const op of ownList) {
      const reason = opTouchesMetrics(op, [row.capas as ResolvedLayer[]]);
      if (reason !== undefined) {
        ctx.issues.push({ code: CODES.E_THEME_STATE_TOUCHES_METRICS, severity: 'error', file: ctx.file, ...toRange(where.$cstNode?.range).start, message: `A row patch cannot touch Metrics: ${reason}` });
      }
    }
    return ownList;
  };

  for (const item of items) {
    switch (item.$type) {
      case 'RowHeight': {
        const { properties, errors } = validateProperties(
          { subject: "The 'row' block", name: "'row'", properties: { height: { type: 'number', min: ROW_HEIGHT.min, max: ROW_HEIGHT.max } } },
          [{ key: 'height', value: item.value }],
          theme.palette,
        );
        for (const error of errors) ctx.issues.push(themeIssue(ctx.file, error, rangeOf(item, 'value').start));
        if (errors.length === 0) row.alto = Number(properties['height']);
        break;
      }
      case 'RowAlternate':
        row.alterna = [...row.alterna, ...patch(item.items, item)];
        break;
      case 'RowOptional':
        row.opcional = [...row.opcional, ...patch(item.items, item)];
        break;
      case 'RowKeyPatch': {
        const key = ROW_KEYS.find((k) => k === item.name);
        if (key === undefined) {
          ctx.issues.push(
            issueWithSuggestion(
              { code: CODES.E_THEME_INVALID_VALUE, message: `Unknown key mark '${item.name}' in 'row'; available: ${ROW_KEYS.join(', ')}` },
              ctx.file, item, 'name', ROW_KEYS,
            ),
          );
          break;
        }
        row.claves = { ...row.claves, [key]: [...(row.claves[key] ?? []), ...patch(item.items, item)] };
        break;
      }
      case 'RowState': {
        const result = parseState(item.name);
        if ('error' in result) {
          ctx.issues.push(issueWithSuggestion(stateErrorBase(result.error), ctx.file, item, 'name', STATES));
          break;
        }
        row.estados = { ...row.estados, [result.estado]: [...(row.estados[result.estado] ?? []), ...patch(item.items, item)] };
        break;
      }
      case 'RowText': {
        const name = ROW_TEXT_NAMES.find((n) => n === item.slot);
        if (name === undefined) {
          ctx.issues.push(
            issueWithSuggestion(
              { code: CODES.E_THEME_INVALID_VALUE, message: `'${item.slot}' is neither a row text nor a 'row' patch; available: ${ROW_TEXT_NAMES.join(', ')}, layer, use, height, alternate, key, optional` },
              ctx.file, item, 'slot', ROW_TEXT_NAMES,
            ),
          );
          break;
        }
        const style = looseFamily(ROW_TEXTS[name as RowTextName], item.props, 'texto-slot', ctx, rangeOf(item, 'slot').start);
        if (style !== undefined) row.textos = { ...row.textos, [name]: style };
        break;
      }
      default:
        break;
    }
  }
}
