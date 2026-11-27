/** Bloque `page` de un Tema: pila de rellenos validada contra el catalogo de `tema`; hereda como la de la Arista. */
import { applyOps } from 'theme';
import type { ResolvedLayer, ResolvedTheme } from 'theme';

import type { PageItem, ThemeLayer, ThemeUse } from './generated/ast';
import { compilarBloque } from './temas-capas';
import type { ContextoDeBloque } from './temas-capas';
import type { Contexto } from './temas-comun';

/** Aplica los `page { ... }` sobre `tema.pagina` (heredada del padre o vacia). */
export function compilarPagina(items: readonly PageItem[], tema: ResolvedTheme, ctx: Contexto & Pick<ContextoDeBloque, 'origenes'>): void {
  const delBloque = items.filter((item): item is ThemeLayer | ThemeUse => item.$type === 'ThemeLayer' || item.$type === 'ThemeUse');
  const modo = tema.pagina.capas.length === 0 ? 'definir' : 'parchear';
  const ops = compilarBloque(delBloque, {
    ...ctx,
    modo,
    ubicacion: 'capa-pagina',
    candidatas: [tema.pagina.capas as ResolvedLayer[]],
  });
  tema.pagina.capas = applyOps(tema.pagina.capas as ResolvedLayer[], ops, tema.palette, modo, 'capa-pagina').pila;
  if (items.some((item) => item.$type === 'PageFixed')) tema.pagina.fijo = true;
}
