/**
 * Compilacion del bloque `edge` de un Tema (ADR 0008). La pila de trazos
 * reutiliza los parches de Capa (`layer`, `use`, `before`/`after`, `none`)
 * validados contra la Familia trazo; los marcadores (`start`/`end`) y la
 * etiqueta (`label`) son una Primitiva suelta cada uno (`primitivaSuelta`, de
 * `temas-comun.ts`). Toda la validacion es del
 * catalogo de `tema`; aqui solo se traduce el AST y se situan los errores.
 */
import { aplicarOps } from 'tema';
import type { CapaDeTema, TemaResuelto } from 'tema';

import type { EdgeItem, ThemeLabel, ThemeLayer, ThemeMarker, ThemeUse } from './generated/ast';
import { aRango, rangoDe } from './posiciones';
import { compilarBloque } from './temas-capas';
import { primitivaSuelta } from './temas-comun';
import type { Contexto } from './temas-comun';

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
