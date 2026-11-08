/**
 * Compilacion del bloque `edge` de un Tema (ADR 0008). La pila de trazos
 * reutiliza los parches de Capa (`layer`, `use`, `before`/`after`, `none`)
 * validados contra la Familia trazo; los marcadores (`start`/`end`) y la
 * etiqueta (`label`) son una Primitiva suelta cada uno (`primitivaSuelta`, de
 * `temas-comun.ts`). Toda la validacion es del
 * catalogo de `tema`; aqui solo se traduce el AST y se situan los errores.
 */
import { CODIGOS } from 'canonico';
import { aplicarOps } from 'tema';
import type { CapaDeTema, OpDeCapa, Primitiva, TemaResuelto } from 'tema';

import type { EdgeItem, ThemeDiagram, ThemeLabel, ThemeLayer, ThemeMarker, ThemeUse } from './generated/ast';
import { aRango, rangoDe } from './posiciones';
import { compilarBloque } from './temas-capas';
import { nombreDeDiagrama, primitivaSuelta } from './temas-comun';
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
    if (item.$type === 'ThemeMarker') compilarMarcador(item, tema.arista, ctx);
    else if (item.$type === 'ThemeLabel') {
      const etiqueta = primitivaSuelta('label', (item as ThemeLabel).props, 'etiqueta', ctx, aRango(item.$cstNode?.range).start);
      if (etiqueta !== undefined) tema.arista.etiqueta = etiqueta;
    } else if (item.$type === 'ThemeDiagram') compilarDiagramaDeArista(item, tema, ctx);
    else if (item.$type === 'EdgeIdentifying') {
      const previo = tema.arista.identificante ?? [];
      const vigente = aplicarOps(tema.arista.capas as CapaDeTema[], previo, tema.palette, 'parchear', 'capa-arista').pila;
      const ops = compilarBloque(item.items, { ...ctx, modo: 'parchear', ubicacion: 'capa-arista', candidatas: [vigente], origenes: new Map() });
      tema.arista.identificante = [...previo, ...ops];
    }
  }
}

type ParcheDeArista = { ops: OpDeCapa[]; origen?: Primitiva; fin?: Primitiva; etiqueta?: Primitiva };

/** `edge { diagram <tipo> { ... } }` (ADR 0009): parches de trazo y marcadores o etiqueta propios de ese Tipo de diagrama; varios bloques del mismo tipo se acumulan. */
function compilarDiagramaDeArista(item: ThemeDiagram, tema: TemaResuelto, ctx: Contexto): void {
  const diagrama = nombreDeDiagrama(item, ctx.archivo, ctx.issues);
  if (diagrama === undefined) return;
  const previo: ParcheDeArista = tema.arista.diagramas?.[diagrama] ?? { ops: [] };
  const vigente = aplicarOps(tema.arista.capas as CapaDeTema[], previo.ops, tema.palette, 'parchear', 'capa-arista').pila;
  const capas = item.items.filter((i): i is ThemeLayer | ThemeUse => i.$type === 'ThemeLayer' || i.$type === 'ThemeUse');
  const ops = compilarBloque(capas, { ...ctx, modo: 'parchear', ubicacion: 'capa-arista', candidatas: [vigente], origenes: new Map() });
  const parche: ParcheDeArista = { ...previo, ops: [...previo.ops, ...ops] };
  for (const hijo of item.items) {
    if (hijo.$type === 'ThemeMarker') {
      if (hijo.remove === true) {
        ctx.issues.push({ code: CODIGOS.E_THEME_INVALID_VALUE, severity: 'error', file: ctx.archivo, ...aRango(hijo.$cstNode?.range).start, message: `'${hijo.side} none' no vale en 'diagram': quitar un marcador se hace en el bloque base` });
      } else compilarMarcador(hijo, parche, ctx);
    } else if (hijo.$type === 'ThemeLabel') {
      const etiqueta = primitivaSuelta('label', hijo.props, 'etiqueta', ctx, aRango(hijo.$cstNode?.range).start);
      if (etiqueta !== undefined) parche.etiqueta = etiqueta;
    } else if (hijo.$type === 'ThemeSlots' || hijo.$type === 'GroupPadding') {
      ctx.issues.push({ code: CODIGOS.E_THEME_INVALID_VALUE, severity: 'error', file: ctx.archivo, ...aRango(hijo.$cstNode?.range).start, message: `'${hijo.$type === 'ThemeSlots' ? 'slots' : 'padding'}' no es de la Arista: ponlo en 'node' o 'group'` });
    }
  }
  tema.arista.diagramas = { ...tema.arista.diagramas, [diagrama]: parche };
}

function compilarMarcador(item: ThemeMarker, destino: { origen?: Primitiva; fin?: Primitiva }, ctx: Contexto): void {
  const lado = item.side === 'start' ? 'origen' : 'fin';
  if (item.remove === true) {
    delete destino[lado];
    return;
  }
  const marcador = primitivaSuelta(item.kind ?? '', item.props, 'marcador', ctx, rangoDe(item, 'kind').start);
  if (marcador !== undefined) destino[lado] = marcador;
}
