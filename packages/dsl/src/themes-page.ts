/** `page` block of a Theme: fill stack validated against the `theme` catalog; inherits like the Edge one. */
import { applyOps } from 'theme';
import type { ResolvedLayer, ResolvedTheme } from 'theme';

import type { PageItem, ThemeLayer, ThemeUse } from './generated/ast';
import { compileBlock } from './themes-layers';
import type { BlockContext } from './themes-layers';
import type { Context } from './themes-common';

/** Applies the `page { ... }` blocks over `theme.pagina` (inherited from the parent or empty). */
export function compilePage(items: readonly PageItem[], theme: ResolvedTheme, ctx: Context & Pick<BlockContext, 'origins'>): void {
  const ofBlock = items.filter((item): item is ThemeLayer | ThemeUse => item.$type === 'ThemeLayer' || item.$type === 'ThemeUse');
  const mode = theme.pagina.capas.length === 0 ? 'definir' : 'parchear';
  const ops = compileBlock(ofBlock, {
    ...ctx,
    mode: mode,
    placement: 'capa-pagina',
    candidates: [theme.pagina.capas as ResolvedLayer[]],
  });
  theme.pagina.capas = applyOps(theme.pagina.capas as ResolvedLayer[], ops, theme.palette, mode, 'capa-pagina').pila;
  if (items.some((item) => item.$type === 'PageFixed')) theme.pagina.fijo = true;
}
