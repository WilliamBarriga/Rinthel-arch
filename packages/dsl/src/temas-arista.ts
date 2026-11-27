/** Bloque `edge` de un Tema: pila de trazos (Familia trazo); cada marcador y la etiqueta son una Primitiva suelta. */
import { CODES } from 'canonical';
import { ESTADOS, aplicarOps, parsearEstado } from 'tema';
import type { CapaDeTema, OpDeCapa, Primitiva, TemaResuelto } from 'tema';

import type { EdgeItem, ThemeDiagram, ThemeLabel, ThemeLayer, ThemeMarker, ThemeUse } from './generated/ast';
import { aRango, baseDeErrorDeEstado, issueConSugerencia, rangoDe } from './posiciones';
import { compilarBloque } from './temas-capas';
import { nombreDeDiagrama, primitivaSuelta } from './temas-comun';
import type { Contexto } from './temas-comun';

/** Aplica los `edge { ... }` sobre `tema.arista` (heredada del padre o del neutro). */
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
    } else if (item.$type === 'ThemeState') {
      // Paint-only: a state patches the stroke stack (Layers and Parts); markers, label and Metrics stay.
      const resultado = parsearEstado(item.name);
      if ('error' in resultado) {
        ctx.issues.push(issueConSugerencia(baseDeErrorDeEstado(resultado.error), ctx.archivo, item, 'name', ESTADOS));
        continue;
      }
      for (const hijo of item.items) {
        if (hijo.$type === 'ThemeSlots' || hijo.$type === 'ThemeTransition') {
          ctx.issues.push({ code: CODES.E_THEME_INVALID_VALUE, severity: 'error', file: ctx.archivo, ...aRango(hijo.$cstNode?.range).start, message: `'${hijo.$type === 'ThemeSlots' ? 'slots' : 'transition'}' is not valid in a state of 'edge'` });
        }
      }
      const capas = item.items.filter((i): i is ThemeLayer | ThemeUse => i.$type === 'ThemeLayer' || i.$type === 'ThemeUse');
      const previo = tema.arista.estados?.[resultado.estado] ?? [];
      const vigente = aplicarOps(tema.arista.capas as CapaDeTema[], previo, tema.palette, 'parchear', 'capa-arista').pila;
      const ops = compilarBloque(capas, { ...ctx, modo: 'parchear', ubicacion: 'capa-arista', candidatas: [vigente], origenes: new Map() });
      tema.arista.estados = { ...tema.arista.estados, [resultado.estado]: [...previo, ...ops] };
    }
  }
}

type ParcheDeArista = { ops: OpDeCapa[]; origen?: Primitiva; fin?: Primitiva; etiqueta?: Primitiva };

/** `edge { diagram <tipo> { ... } }`; varios bloques del mismo tipo se acumulan. */
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
        ctx.issues.push({ code: CODES.E_THEME_INVALID_VALUE, severity: 'error', file: ctx.archivo, ...aRango(hijo.$cstNode?.range).start, message: `'${hijo.side} none' is not valid in 'diagram': removing a marker is done in the base block` });
      } else compilarMarcador(hijo, parche, ctx);
    } else if (hijo.$type === 'ThemeLabel') {
      const etiqueta = primitivaSuelta('label', hijo.props, 'etiqueta', ctx, aRango(hijo.$cstNode?.range).start);
      if (etiqueta !== undefined) parche.etiqueta = etiqueta;
    } else if (hijo.$type === 'ThemeSlots' || hijo.$type === 'GroupPadding') {
      ctx.issues.push({ code: CODES.E_THEME_INVALID_VALUE, severity: 'error', file: ctx.archivo, ...aRango(hijo.$cstNode?.range).start, message: `'${hijo.$type === 'ThemeSlots' ? 'slots' : 'padding'}' does not belong to the Edge: put it in 'node' or 'group'` });
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
