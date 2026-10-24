/**
 * Compilacion del bloque `edge` de un Tema (ADR 0008). La pila de trazos
 * reutiliza los parches de Capa (`layer`, `use`, `before`/`after`, `none`)
 * validados contra la Familia trazo; los marcadores (`start`/`end`) y la
 * etiqueta (`label`) son una Primitiva suelta cada uno. `primitivaSuelta` la
 * comparte `temas-slots.ts` para el estilo de un Slot. Toda la validacion es del
 * catalogo de `tema`; aqui solo se traduce el AST y se situan los errores.
 */
import { CODIGOS } from 'canonico';
import type { Issue } from 'canonico';
import { aplicarOps, construirPrimitiva, resolverTokens } from 'tema';
import type { CapaDeTema, ErrorDeCatalogo, Primitiva, TemaResuelto, UbicacionDePrimitiva } from 'tema';

import type { EdgeItem, LayerProp, SlotEntry, ThemeLabel, ThemeLayer, ThemeMarker, ThemeUse } from './generated/ast';
import { aRango, rangoDe } from './posiciones';
import { compilarBloque, propiedadDeClave, propiedadesEscritas } from './temas-capas';
import type { ContextoDeBloque } from './temas-capas';

export type Contexto = Pick<ContextoDeBloque, 'archivo' | 'partes' | 'paleta' | 'tokens' | 'issues'>;

/** Primitiva suelta (marcador, etiqueta, estilo de Slot) desde sus props escritas; deja los errores en `ctx.issues`. */
export function primitivaSuelta(
  tipo: string,
  props: readonly LayerProp[],
  ubicacion: UbicacionDePrimitiva,
  ctx: Contexto,
  culpable: { line: number; column: number },
): Primitiva | undefined {
  const resueltas = resolverTokens(propiedadesEscritas(props), ctx.tokens);
  const { primitiva, errores } = construirPrimitiva(tipo, resueltas.props, ctx.paleta, ubicacion);
  for (const error of [...resueltas.errores, ...errores]) {
    const prop = error.clave === undefined ? undefined : propiedadDeClave(props, error.clave);
    const donde = prop !== undefined ? rangoDe(prop, error.codigo === CODIGOS.E_THEME_UNKNOWN_PROPERTY ? 'key' : 'value').start : culpable;
    ctx.issues.push(aIssue(ctx.archivo, error, donde));
  }
  return resueltas.errores.length === 0 && errores.length === 0 ? primitiva : undefined;
}

export function aIssue(archivo: string, error: ErrorDeCatalogo, inicio: { line: number; column: number }): Issue {
  return { code: error.codigo, severity: 'error', file: archivo, ...inicio, message: error.mensaje, ...(error.hint !== undefined && { hint: error.hint }) };
}

/** Aplica los `edge { ... }` de un Tema sobre `tema.arista` (heredada del padre o del neutro). */
export function compilarArista(items: readonly EdgeItem[], tema: TemaResuelto, ctx: Contexto): void {
  const delBloque = items.filter((item): item is ThemeLayer | ThemeUse => item.$type === 'ThemeLayer' || item.$type === 'ThemeUse');
  const modo = tema.arista.capas.length === 0 ? 'definir' : 'parchear';
  const ops = compilarBloque(delBloque, {
    ...ctx,
    modo,
    ubicacion: 'capa-arista',
    candidatas: [tema.arista.capas as CapaDeTema[]],
    origenes: new Map(),
  });
  tema.arista.capas = aplicarOps(tema.arista.capas as CapaDeTema[], ops, tema.palette, modo, 'capa-arista').pila;

  for (const item of items) {
    if (item.$type === 'ThemeMarker') compilarMarcador(item, tema, ctx);
    else if (item.$type === 'ThemeLabel') {
      const etiqueta = primitivaSuelta('label', (item as ThemeLabel).props, 'etiqueta', ctx, aRango(item.$cstNode?.range).start);
      if (etiqueta !== undefined) tema.arista.etiqueta = etiqueta;
    }
  }
}

function compilarMarcador(item: ThemeMarker, tema: TemaResuelto, ctx: Contexto): void {
  const lado = item.side === 'start' ? 'origen' : 'fin';
  if (item.remove === true) {
    delete tema.arista[lado];
    return;
  }
  const marcador = primitivaSuelta(item.kind ?? '', item.props, 'marcador', ctx, rangoDe(item, 'kind').start);
  if (marcador !== undefined) tema.arista[lado] = marcador;
}
