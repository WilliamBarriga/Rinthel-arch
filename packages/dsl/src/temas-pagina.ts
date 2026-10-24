/**
 * Compilacion del bloque `page` de un Tema (ADR 0008): el fondo de pagina es una
 * pila de rellenos que reutiliza los parches de Capa (`layer`, `use`,
 * `before`/`after`, `none`), validados contra los rellenos del catalogo de
 * `tema`; `fixed` lo deja fijo al visor. Hereda y se parchea como la pila de
 * la Arista.
 */
import { aplicarOps } from 'tema';
import type { CapaDeTema, TemaResuelto } from 'tema';

import type { PageItem, ThemeLayer, ThemeUse } from './generated/ast';
import { compilarBloque } from './temas-capas';
import type { ContextoDeBloque } from './temas-capas';
import type { Contexto } from './temas-comun';

/** Aplica los `page { ... }` de un Tema sobre `tema.pagina` (heredada del padre o vacia). */
export function compilarPagina(items: readonly PageItem[], tema: TemaResuelto, ctx: Contexto & Pick<ContextoDeBloque, 'origenes'>): void {
  const delBloque = items.filter((item): item is ThemeLayer | ThemeUse => item.$type === 'ThemeLayer' || item.$type === 'ThemeUse');
  const modo = tema.pagina.capas.length === 0 ? 'definir' : 'parchear';
  const ops = compilarBloque(delBloque, {
    ...ctx,
    modo,
    ubicacion: 'capa-pagina',
    candidatas: [tema.pagina.capas as CapaDeTema[]],
  });
  tema.pagina.capas = aplicarOps(tema.pagina.capas as CapaDeTema[], ops, tema.palette, modo, 'capa-pagina').pila;
  if (items.some((item) => item.$type === 'PageFixed')) tema.pagina.fijo = true;
}
