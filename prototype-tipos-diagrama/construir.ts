/**
 * PROTOTIPO (throwaway, rama `prototype/tipos-diagrama`): ticket "Prototipo de secuencia y ER con un Tema
 * existente" del mapa "Nuevos Tipos de diagrama: secuencia y ER".
 *
 * Pregunta: se ven bien secuencia y ER dibujados con un Tema existente, sin tocar el Tema?
 * Una pagina con una variante por Tema (los 17: incorporados y de ejemplo), cada una con una Vista de
 * secuencia y una Vista ER. Todo lo que se dibuja sale de los pintores reales de `render` y de la
 * derivacion acordada en "Elementos de Tema por Tipo de diagrama":
 * - Cabeceras de Lifeline, Notas, activaciones y tablas: Nodos reales (`construirEscena`).
 * - Fragmentos: Grupos abiertos reales (la cabecera del Grupo hace de pestana).
 * - Lifeline y Mensajes: `pintarTrazos`/`pintarMarcadores` con la pintura de la Arista del Tema, parcheada
 *   por tipo de Mensaje (reply/create discontinuo, async/reply/create con chevron).
 * - ER: geometria real de ELK; Aristas con la pintura del Tema, discontinuas si no son identificantes, y los
 *   marcadores de pie de gallo dibujados aqui (las Primitivas nuevas aun no existen).
 * Atajos: el layout de secuencia es una aproximacion a mano de "Layout por Tipo de diagrama y contrato de
 * Geometria"; PK/FK/UK y `?` van pegados al tipo del Atributo (no hay `row` todavia).
 */
import { readdirSync, readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { join, resolve } from 'node:path';

import { genericIcons, idDeArista, resolveView } from 'canonico';
import type { NodoResuelto, VistaResuelta } from 'canonico';
import type { CajaDeNodo, Geometria, Punto } from 'layout';
import { abrirSesion } from 'sesion';
import type { PinturaDeArista, PrimitivaPintada } from 'tema';

import { pintarMarcadores, pintarTrazos } from '../packages/render/src/aristas';
import type { Elemento } from '../packages/render/src/elemento';
import { construirEscena } from '../packages/render/src/escena';
import { resolverEstilo } from '../packages/render/src/estilo';
import type { Estilo } from '../packages/render/src/estilo';
import { pintarEtiquetaDeArista } from '../packages/render/src/pintores';

const REPO = resolve(import.meta.dirname, '..');
const TEMAS = join(REPO, 'examples/rinthel-arch/temas');

// ---------------------------------------------------------------- Workspace

const MODELO = `
specification {
  node actor    { icon user      color purple }
  node servicio { icon server    color blue }
  node externo  { icon cloud     color red }
  node almacen  { icon database  color green }
  node tabla    { icon database  color green }
  node nota     { color amber }
  node paquete   { icon box  color blue }
  node modulo    { icon box  color gray }
  node artefacto { icon box  color green }
}

model {
  actor cliente "Cliente"
  servicio web "Web"
  servicio api "API de pedidos"
  externo pagos "Pasarela de pagos"
  almacen db "Base de datos"
  servicio recibo "Recibo PDF"
  nota n1 "Reintenta 3 veces con espera exponencial"
  nota n2 "Idempotente por order_id"

  tabla customers "customers" {
    attrs {
      id: uuid
      email: text
      name: text
    }
  }
  tabla orders "orders" {
    attrs {
      id: uuid
      customer_id: uuid
      status: text
      total: decimal
    }
  }
  tabla order_items "order_items" {
    attrs {
      order_id: uuid
      line: int
      product_id: uuid
      qty: int
    }
  }
  tabla products "products" {
    attrs {
      id: uuid
      sku: text
      price: decimal
    }
  }
  tabla payments "payments" {
    attrs {
      id: uuid
      order_id: uuid
      paid_at: timestamp
    }
  }

  orders#customer_id "0..*" -> "1" customers#id "realiza"
  order_items#order_id "1..*" -> "1" orders#id "contiene"
  order_items#product_id "0..*" -> "1" products#id
  payments#order_id "0..1" -> "1" orders#id "paga"
}

view er { type architecture  include customers, orders, order_items, products, payments }
view participantes { type architecture  include cliente, web, api, pagos, db, recibo, n1, n2 }
`;

/** Lo que el Modelo aun no sabe expresar: marcas de clave, `optional` e `identifying` (resolucion de la sintaxis DSL). */
const CLAVES: Record<string, string> = {
  'customers#id': 'PK',
  'customers#email': 'UK',
  'orders#id': 'PK',
  'orders#customer_id': 'FK',
  'order_items#order_id': 'PK FK',
  'order_items#line': 'PK',
  'order_items#product_id': 'FK',
  'products#id': 'PK',
  'products#sku': 'UK',
  'payments#id': 'PK',
  'payments#order_id': 'FK UK',
};
const OPCIONALES = new Set(['customers#name', 'payments#paid_at']);
const IDENTIFICANTES = new Set(['order_items#order_id']);

// ---------------------------------------------------------------- Interaccion

type Tipo = 'sync' | 'async' | 'reply' | 'create' | 'destroy';
type Item =
  | { k: 'msg'; tipo: Tipo; de: string; a: string; texto?: string }
  | { k: 'frag'; op: string; operandos: { guarda?: string; items: Item[] }[] }
  | { k: 'nota'; id: string; sobre: string; lado: 'over' | 'right' };

const m = (de: string, a: string, texto?: string, tipo: Tipo = 'sync'): Item => ({ k: 'msg', tipo, de, a, ...(texto !== undefined && { texto }) });

const INTERACCION: Item[] = [
  m('cliente', 'web', 'Confirmar compra'),
  m('web', 'api', 'POST /orders'),
  m('api', 'db', 'INSERT order'),
  m('db', 'api', 'order_id', 'reply'),
  {
    k: 'frag',
    op: 'alt',
    operandos: [
      {
        guarda: 'tarjeta valida',
        items: [m('api', 'pagos', 'cobrar(total)'), m('pagos', 'api', 'ok', 'reply'), m('api', 'web', 'evento: pagado', 'async')],
      },
      { guarda: 'rechazada', items: [m('api', 'api', 'marcar fallida'), { k: 'nota', id: 'n1', sobre: 'api', lado: 'over' }] },
    ],
  },
  m('api', 'recibo', 'generar', 'create'),
  { k: 'nota', id: 'n2', sobre: 'recibo', lado: 'right' },
  m('api', 'recibo', undefined, 'destroy'),
  m('api', 'web', '201 Created', 'reply'),
  {
    k: 'frag',
    op: 'loop',
    operandos: [{ guarda: 'cada 5 s, hasta pagado', items: [m('web', 'api', 'GET /orders/{id}'), m('api', 'web', 'estado', 'reply')] }],
  },
  m('web', 'cliente', 'Pedido listo', 'reply'),
];

// ---------------------------------------------------------------- Utilidades

const r = (n: number): number => Math.round(n * 10) / 10;

function serializar(e: Elemento | string): string {
  if (typeof e === 'string') return e.replace(/&/g, '&amp;').replace(/</g, '&lt;');
  const attrs = Object.entries(e.attrs)
    .map(([k, v]) => ` ${k}="${String(v).replace(/&/g, '&amp;').replace(/"/g, '&quot;')}"`)
    .join('');
  const dentro = e.html ?? (e.hijos ?? []).map(serializar).join('');
  return `<${e.tag}${attrs}>${dentro}</${e.tag}>`;
}

function nodoSintetico(id: string, tipo: string, label: string, color: string | undefined, children: NodoResuelto[] = []): NodoResuelto {
  return { id, type: tipo, title: label, description: '', attributes: [], source: [], children, collapsed: false, label, ...(color !== undefined && { color }), childCount: children.length } as NodoResuelto;
}

/** Pintura de Mensaje derivada de la Arista del Tema ("Elementos de Tema por Tipo de diagrama", punto 6). */
function pinturaDeMensaje(base: PinturaDeArista, tipo: Tipo | 'lifeline' | 'er-no-identificante' | 'er'): PinturaDeArista {
  const discontinuo = tipo === 'reply' || tipo === 'create' || tipo === 'lifeline' || tipo === 'er-no-identificante';
  const capas = base.capas.map((capa) => ({ ...capa, props: { ...capa.props, ...(discontinuo && capa.props['style'] === 'solid' && { style: 'dashed' }) } }));
  const color = String(base.capas.at(-1)?.props['color'] ?? '#888');
  const tamano = Number(base.fin?.props['size'] ?? 10);
  const marcador = (t: string): PrimitivaPintada => ({ tipo: t as PrimitivaPintada['tipo'], props: { size: tamano, color: String(base.fin?.props['color'] ?? color) } });
  if (tipo === 'lifeline' || tipo === 'er' || tipo === 'er-no-identificante') return { capas, etiqueta: base.etiqueta };
  const fin = tipo === 'sync' || tipo === 'destroy' ? (base.fin?.tipo === 'arrow' ? base.fin : marcador('arrow')) : marcador('chevron');
  return { capas, fin, etiqueta: base.etiqueta };
}

/** Color y grosor del trazo principal, para lo que se dibuja aqui (pie de gallo, cruz, divisores). */
function trazo(base: PinturaDeArista): { color: string; ancho: number } {
  const capa = base.capas.at(-1);
  return { color: String(capa?.props['color'] ?? '#888'), ancho: Math.max(1.25, Number(capa?.props['width'] ?? 1.5)) };
}

/** Pie de gallo en el marco local del marcador: punta en el origen, mirando hacia el Nodo (+x). */
function pieDeGallo(card: string, extremo: Punto, vecino: Punto, color: string, ancho: number, fondo: string): Elemento {
  const s = 12;
  const linea = (x1: number, y1: number, x2: number, y2: number): Elemento => ({ tag: 'line', attrs: { x1: r(x1), y1: r(y1), x2: r(x2), y2: r(y2), stroke: color, 'stroke-width': ancho } });
  const circulo = (cx: number): Elemento => ({ tag: 'circle', attrs: { cx, cy: 0, r: 4, fill: fondo, stroke: color, 'stroke-width': ancho } });
  const pie = [linea(-s, 0, 0, -s / 2), linea(-s, 0, 0, s / 2)];
  const formas: Record<string, Elemento[]> = {
    '1': [linea(-6, -6, -6, 6), linea(-11, -6, -11, 6)],
    '0..1': [linea(-6, -6, -6, 6), circulo(-15)],
    '1..*': [...pie, linea(-s - 3, -6, -s - 3, 6)],
    '0..*': [...pie, circulo(-s - 7)],
  };
  const angulo = (Math.atan2(extremo.y - vecino.y, extremo.x - vecino.x) * 180) / Math.PI;
  return { tag: 'g', attrs: { transform: `translate(${r(extremo.x)} ${r(extremo.y)}) rotate(${r(angulo)})` }, hijos: formas[card] ?? [] };
}

function texto(x: number, y: number, contenido: string, estilo: Estilo, extra: Record<string, string | number> = {}): Elemento {
  return {
    tag: 'text',
    attrs: { x: r(x), y: r(y), 'font-family': estilo.fuenteCuerpo, 'font-size': r(estilo.metricas.fontSize * 0.85), fill: estilo.texto, ...extra },
    hijos: [contenido],
  };
}

function envolver(t: string, max: number, porCaracter: number): string[] {
  const lineas: string[] = [];
  let actual = '';
  for (const palabra of t.split(' ')) {
    const prueba = actual === '' ? palabra : `${actual} ${palabra}`;
    if (prueba.length * porCaracter > max && actual !== '') {
      lineas.push(actual);
      actual = palabra;
    } else actual = prueba;
  }
  return [...lineas, actual];
}

const colorDeNota = (estilo: Estilo): string => estilo.paleta['amber'] ?? estilo.paleta['yellow'] ?? estilo.borde;

/** Variante B: papel con esquina doblada, tinte suave del color de nota, texto normal. */
function notaPapel(x: number, y: number, w: number, h: number, lineas: string[], fs: number, estilo: Estilo): Elemento {
  const c = colorDeNota(estilo);
  const d = 10;
  return {
    tag: 'g',
    attrs: { class: 'nota-B' },
    hijos: [
      { tag: 'path', attrs: { d: `M ${r(x)} ${r(y)} H ${r(x + w - d)} L ${r(x + w)} ${r(y + d)} V ${r(y + h)} H ${r(x)} Z`, fill: estilo.fondo, stroke: 'none' } },
      { tag: 'path', attrs: { d: `M ${r(x)} ${r(y)} H ${r(x + w - d)} L ${r(x + w)} ${r(y + d)} V ${r(y + h)} H ${r(x)} Z`, fill: c, 'fill-opacity': 0.16, stroke: c, 'stroke-opacity': 0.7, 'stroke-width': 1 } },
      { tag: 'path', attrs: { d: `M ${r(x + w - d)} ${r(y)} V ${r(y + d)} H ${r(x + w)}`, fill: 'none', stroke: c, 'stroke-opacity': 0.7, 'stroke-width': 1 } },
      ...lineas.map((l, i) => texto(x + 12, y + 9 + fs * (i + 1) * 1.2, l, estilo, { fill: estilo.texto === estilo.fondo ? c : estilo.texto })),
    ],
  };
}

/** Variante C: sin caja; barra de acento a la izquierda y texto en cursiva sobre un velo del fondo. */
function notaMargen(x: number, y: number, w: number, h: number, lineas: string[], fs: number, estilo: Estilo): Elemento {
  const c = colorDeNota(estilo);
  return {
    tag: 'g',
    attrs: { class: 'nota-C' },
    hijos: [
      { tag: 'rect', attrs: { x: r(x), y: r(y), width: r(w), height: r(h), fill: estilo.fondo, 'fill-opacity': 0.88 } },
      { tag: 'rect', attrs: { x: r(x), y: r(y), width: 3, height: r(h), fill: c } },
      ...lineas.map((l, i) => texto(x + 12, y + 9 + fs * (i + 1) * 1.2, l, estilo, { 'font-style': 'italic' })),
    ],
  };
}

/** ER: una forma `pill` en una caja alta queda circular; la tabla la dibuja como `rect` con radio acotado. */
function formasDeTabla(pintura: unknown): unknown {
  if (Array.isArray(pintura)) return pintura.map(formasDeTabla);
  if (pintura === null || typeof pintura !== 'object') return pintura;
  const o = pintura as Record<string, unknown>;
  if (o['tipo'] === 'pill' && typeof o['nombre'] === 'string') return { ...o, tipo: 'rect', props: { radius: 14 } };
  return Object.fromEntries(Object.entries(o).map(([k, v]) => [k, formasDeTabla(v)]));
}

/** Inyecta elementos en la capa SVG de Aristas de la escena (entre Grupos y Nodos, como las Aristas reales). */
function inyectarEnAristas(escena: Elemento, extra: Elemento[]): void {
  const visitar = (e: Elemento): boolean => {
    if (e.attrs['data-capa'] === 'aristas') {
      e.hijos = [...(e.hijos ?? []), ...extra];
      return true;
    }
    return (e.hijos ?? []).some((h) => typeof h !== 'string' && visitar(h));
  };
  visitar(escena);
}

/** Quita de la escena las cajas de los ids dados (el hijo ficticio que convierte un Fragmento en Grupo). */
function quitarCajas(escena: Elemento, ids: Set<string>): void {
  escena.hijos = (escena.hijos ?? []).filter((h) => typeof h === 'string' || !ids.has(String(h.attrs['data-id'] ?? '')));
  for (const h of escena.hijos) if (typeof h !== 'string') quitarCajas(h, ids);
}

/** Quita Slots de las cajas dadas: `todos` vacia la caja (activaciones), si no solo esos Slots (la insignia de una Nota). */
function quitarSlots(escena: Elemento, ids: Set<string>, slots: Set<string> | 'todos'): void {
  const limpiar = (e: Elemento): void => {
    e.hijos = (e.hijos ?? []).filter((h) => typeof h === 'string' || h.attrs['data-slot'] === undefined || (slots !== 'todos' && !slots.has(String(h.attrs['data-slot']))));
    for (const h of e.hijos) if (typeof h !== 'string') limpiar(h);
  };
  for (const h of escena.hijos ?? []) {
    if (typeof h === 'string') continue;
    if (ids.has(String(h.attrs['data-id'] ?? ''))) limpiar(h);
    else quitarSlots(h, ids, slots);
  }
}

/** Capa SVG encima de los Nodos (guardas de Fragmento: no las tapa una activacion). */
function inyectarEncima(escena: Elemento, extra: Elemento[], ancho: number, alto: number): void {
  const visitar = (e: Elemento): boolean => {
    if (String(e.attrs['class'] ?? '') === 'rd-mundo') {
      e.hijos = [...(e.hijos ?? []), { tag: 'svg', attrs: { class: 'rd-capa', xmlns: 'http://www.w3.org/2000/svg', width: ancho, height: alto, style: 'position:absolute;left:0;top:0;pointer-events:none;overflow:visible' }, hijos: extra }];
      return true;
    }
    return (e.hijos ?? []).some((h) => typeof h !== 'string' && visitar(h));
  };
  visitar(escena);
}

// ---------------------------------------------------------------- Secuencia

function secuencia(geoParticipantes: Geometria, vistaParticipantes: VistaResuelta, estilo: Estilo): { vista: VistaResuelta; geometria: Geometria; svg: Elemento[]; guardas: Elemento[]; quitar: Set<string>; vaciar: Set<string>; notas: Set<string> } {
  const orden = ['cliente', 'web', 'api', 'pagos', 'db', 'recibo'];
  const porId = new Map(vistaParticipantes.nodes.map((n) => [n.id, n]));
  const caja = (id: string): CajaDeNodo => geoParticipantes.nodes[id]!;
  const base = estilo.pintura.arista;
  const { color: colorTrazo, ancho: anchoTrazo } = trazo(base);
  const fs = estilo.metricas.fontSize * estilo.metricas.escalaEtiqueta;
  const anchoTexto = (t: string): number => t.length * fs * estilo.metricas.factorDeAncho + 16;
  const ACT = 12;
  const GAP_FILA = Math.max(30, fs * 2.6);
  const tabla = estilo.tabla.grupoAbierto;
  const PESTANA = tabla.paddingGrupo.top;

  // Columnas: distancia entre vecinas = max(gap, etiqueta mas ancha entre ellas).
  const necesario = new Map<string, number>();
  const recorrer = (items: Item[], f: (it: Item) => void): void => {
    for (const it of items) {
      f(it);
      if (it.k === 'frag') for (const op of it.operandos) recorrer(op.items, f);
    }
  };
  recorrer(INTERACCION, (it) => {
    if (it.k !== 'msg' || it.de === it.a) return;
    const [i, j] = [orden.indexOf(it.de), orden.indexOf(it.a)].sort((a, b) => a - b) as [number, number];
    if (j - i !== 1) return;
    const clave = orden[i]!;
    necesario.set(clave, Math.max(necesario.get(clave) ?? 0, anchoTexto(it.texto ?? '') + 30));
  });
  const cx = new Map<string, number>();
  let x = 40 + caja(orden[0]!).width / 2;
  orden.forEach((id, i) => {
    cx.set(id, x);
    const sig = orden[i + 1];
    if (sig !== undefined) x += Math.max(caja(id).width / 2 + caja(sig).width / 2 + 40, necesario.get(id) ?? 0, id === 'api' ? 200 : 0);
  });

  const altoCabecera = Math.max(...orden.map((id) => caja(id).height));
  const top = 30;
  const cabeceras = new Map<string, CajaDeNodo>();
  for (const id of orden) if (id !== 'recibo') cabeceras.set(id, { ...caja(id), x: cx.get(id)! - caja(id).width / 2, y: top });

  const svgMensajes: Elemento[] = [];
  const svgEncima: Elemento[] = [];
  const svgNotas: Elemento[] = [];
  const pilas = new Map<string, { inicio: number; nivel: number }[]>(orden.map((id) => [id, []]));
  const activaciones: { id: string; lifeline: string; x: number; y0: number; y1: number }[] = [];
  const fin = new Map<string, number>();
  const notas: { id: string; caja: CajaDeNodo }[] = [];
  const fragmentos: { id: string; op: string; caja: CajaDeNodo; guardas: { y: number; texto?: string }[]; divisores: number[]; hijos: string[] }[] = [];
  let y = top + altoCabecera + 24;
  let nAct = 0;

  const borde = (id: string, haciaDerecha: boolean): number => {
    const pila = pilas.get(id)!;
    const c = cx.get(id)!;
    if (pila.length === 0) return c;
    const desp = (pila.length - 1) * (ACT / 2);
    return c + desp + (haciaDerecha ? ACT / 2 : -ACT / 2);
  };
  const abrir = (id: string, desde: number): void => {
    const pila = pilas.get(id)!;
    pila.push({ inicio: desde, nivel: pila.length });
  };
  const cerrar = (id: string, hasta: number): void => {
    const top_ = pilas.get(id)!.pop();
    if (top_ === undefined) return;
    activaciones.push({ id: `act-${nAct++}`, lifeline: id, x: cx.get(id)! - ACT / 2 + top_.nivel * (ACT / 2), y0: top_.inicio, y1: hasta });
  };
  const flecha = (puntos: Punto[], tipo: Tipo, etiqueta: string | undefined, propio = false): void => {
    const pintura = pinturaDeMensaje(base, tipo);
    svgMensajes.push(...pintarTrazos(pintura, puntos), ...pintarMarcadores(estilo, pintura, puntos));
    if (etiqueta === undefined) return;
    const ancho = anchoTexto(etiqueta);
    const alto = fs * 1.6;
    const caja_: CajaDeNodo = propio
      ? { x: puntos[1]!.x + 6, y: puntos[1]!.y - 2, width: ancho, height: alto }
      : { x: (puntos[0]!.x + puntos.at(-1)!.x) / 2 - ancho / 2, y: puntos[0]!.y - alto - 2, width: ancho, height: alto };
    svgEncima.push(pintarEtiquetaDeArista(estilo, { id: `m-${svgMensajes.length}`, texto: etiqueta, puntos, caja: caja_ }));
  };

  const contenido = { minX: Infinity, maxX: -Infinity };
  const tocar = (...xs: number[]): void => {
    for (const v of xs) {
      contenido.minX = Math.min(contenido.minX, v);
      contenido.maxX = Math.max(contenido.maxX, v);
    }
  };

  const ejecutar = (items: Item[], profundidad: number, hijosDe: string[] | undefined): void => {
    for (const it of items) {
      if (it.k === 'msg') {
        const [xa, xb] = [cx.get(it.de)!, cx.get(it.a)!];
        tocar(xa, xb);
        if (it.de === it.a) {
          y += GAP_FILA * 0.6;
          const desde = borde(it.de, true);
          const ancho = 34;
          const alto = 22;
          flecha([{ x: desde, y }, { x: desde + ancho, y }, { x: desde + ancho, y: y + alto }, { x: desde + ACT / 2, y: y + alto }], it.tipo, it.texto, true);
          tocar(desde + ancho + anchoTexto(it.texto ?? ''));
          abrir(it.de, y + alto - 4);
          y += alto + 16;
          cerrar(it.de, y);
          y += 8;
          continue;
        }
        y += GAP_FILA;
        const derecha = xb > xa;
        if (it.tipo === 'reply') {
          const desde = borde(it.de, !derecha);
          const hasta = borde(it.a, derecha);
          flecha([{ x: desde, y }, { x: hasta, y }], it.tipo, it.texto);
          cerrar(it.de, y);
        } else if (it.tipo === 'create') {
          const cajaDestino = caja(it.a);
          const cab: CajaDeNodo = { ...cajaDestino, x: xb - cajaDestino.width / 2, y: y - cajaDestino.height / 2 };
          cabeceras.set(it.a, cab);
          const desde = borde(it.de, derecha);
          flecha([{ x: desde, y }, { x: derecha ? cab.x : cab.x + cab.width, y }], it.tipo, it.texto);
          y += cajaDestino.height / 2;
        } else if (it.tipo === 'destroy') {
          const desde = borde(it.de, derecha);
          flecha([{ x: desde, y }, { x: xb - (derecha ? 7 : -7), y }], it.tipo, it.texto);
          fin.set(it.a, y);
          y += 6;
        } else {
          const desde = borde(it.de, derecha);
          if (it.tipo === 'sync') abrir(it.a, y - 4);
          const hasta = it.tipo === 'sync' ? borde(it.a, !derecha) : xb;
          flecha([{ x: desde, y }, { x: hasta, y }], it.tipo, it.texto);
        }
        continue;
      }
      if (it.k === 'nota') {
        const c = caja(it.id);
        y += 14;
        const xc = cx.get(it.sobre)!;
        const caja_: CajaDeNodo = it.lado === 'over' ? { ...c, x: xc - c.width / 2, y } : { ...c, x: xc + 18, y };
        notas.push({ id: it.id, caja: caja_ });
        hijosDe?.push(it.id);
        tocar(caja_.x, caja_.x + caja_.width);
        const txt = porId.get(it.id)!.label;
        const lineas = envolver(txt, 200, fs * estilo.metricas.factorDeAncho);
        const altoB = lineas.length * fs * 1.35 + 18;
        const anchoB = Math.max(...lineas.map((l) => l.length)) * fs * estilo.metricas.factorDeAncho + 28;
        const xB = it.lado === 'over' ? xc - anchoB / 2 : xc + 18;
        svgNotas.push(notaPapel(xB, y, anchoB, altoB, lineas, fs, estilo), notaMargen(xB, y, anchoB, altoB, lineas, fs, estilo));
        y += Math.max(c.height, altoB);
        continue;
      }
      // Fragmento
      const id = `frag-${fragmentos.length}`;
      const frag = { id, op: it.op, caja: { x: 0, y: 0, width: 0, height: 0 }, guardas: [] as { y: number; texto?: string }[], divisores: [] as number[], hijos: [] as string[] };
      fragmentos.push(frag);
      y += 18;
      const y0 = y;
      y += PESTANA;
      const antes = { ...contenido };
      contenido.minX = Infinity;
      contenido.maxX = -Infinity;
      it.operandos.forEach((op, i) => {
        if (i > 0) {
          y += 14;
          frag.divisores.push(y);
        }
        frag.guardas.push({ y: y + fs, ...(op.guarda !== undefined && { texto: `[${op.guarda}]` }) });
        y += fs * 0.6;
        ejecutar(op.items, profundidad + 1, frag.hijos);
      });
      y += 16;
      const pad = 56 - profundidad * 10;
      // A la izquierda cabe la pestana del Grupo antes de la primera Lifeline.
      frag.caja = { x: contenido.minX - pad - 40, y: y0, width: contenido.maxX - contenido.minX + 2 * pad + 40, height: y - y0 };
      contenido.minX = Math.min(antes.minX, frag.caja.x);
      contenido.maxX = Math.max(antes.maxX, frag.caja.x + frag.caja.width);
      y += 6;
    }
  };
  ejecutar(INTERACCION, 0, undefined);
  for (const id of orden) while (pilas.get(id)!.length > 0) cerrar(id, y + 10);
  y += 30;
  const fondo = y;

  // Lifelines (bajo todo lo demas en la capa de Aristas).
  const pinturaLifeline = pinturaDeMensaje(base, 'lifeline');
  const svgLifelines: Elemento[] = [];
  for (const id of orden) {
    const cab = cabeceras.get(id)!;
    const hasta = fin.get(id) ?? fondo;
    svgLifelines.push(...pintarTrazos(pinturaLifeline, [{ x: cx.get(id)!, y: cab.y + cab.height }, { x: cx.get(id)!, y: hasta }]));
    if (fin.has(id)) {
      const s = 9;
      const l = (x1: number, y1: number, x2: number, y2: number): Elemento => ({ tag: 'line', attrs: { x1: r(x1), y1: r(y1), x2: r(x2), y2: r(y2), stroke: colorTrazo, 'stroke-width': anchoTrazo + 0.75 } });
      svgEncima.push(l(cx.get(id)! - s, hasta - s, cx.get(id)! + s, hasta + s), l(cx.get(id)! - s, hasta + s, cx.get(id)! + s, hasta - s));
    }
  }

  // Guardas y divisores de Fragmento: texto `text` del Tema y trazo del borde del Grupo.
  const svgFragmentos: Elemento[] = [];
  const svgGuardas: Elemento[] = [];
  for (const f of fragmentos) {
    for (const g of f.guardas)
      if (g.texto !== undefined) svgGuardas.push(texto(f.caja.x + 12, g.y + 4, g.texto, estilo, { fill: colorTrazo, 'font-style': 'italic', stroke: estilo.fondo, 'stroke-width': 4, 'paint-order': 'stroke' }));
    for (const d of f.divisores)
      svgFragmentos.push({ tag: 'line', attrs: { x1: r(f.caja.x), y1: r(d), x2: r(f.caja.x + f.caja.width), y2: r(d), stroke: estilo.borde, 'stroke-width': 1.25, 'stroke-dasharray': '6 4' } });
  }

  // Vista y Geometria sinteticas: cabeceras, Notas y activaciones son Nodos; los Fragmentos, Grupos.
  const nodos: NodoResuelto[] = [];
  const geo: Geometria = { nodes: {}, edges: {}, labels: {}, pinsSolapados: [], width: 0, height: fondo };
  for (const id of orden) {
    nodos.push(porId.get(id)!);
    geo.nodes[id] = cabeceras.get(id)!;
  }
  for (const a of activaciones) {
    nodos.push(nodoSintetico(a.id, 'actividad', '', porId.get(a.lifeline)?.color));
    geo.nodes[a.id] = { x: a.x, y: a.y0, width: ACT, height: Math.max(8, a.y1 - a.y0) };
  }
  for (const n of notas) {
    nodos.push(porId.get(n.id)!);
    geo.nodes[n.id] = n.caja;
  }
  const quitar = new Set<string>();
  // Fragmentos al principio: los Grupos se pintan en su propia capa, bajo las Aristas.
  const grupos: NodoResuelto[] = [];
  for (const f of fragmentos) {
    const ficticio = `${f.id}-hijo`;
    quitar.add(ficticio);
    grupos.push(nodoSintetico(f.id, 'fragmento', f.op, 'gray', [nodoSintetico(ficticio, 'fragmento', '', undefined)]));
    geo.nodes[f.id] = f.caja;
    geo.nodes[ficticio] = { x: 0, y: 0, width: 1, height: 1 };
  }
  const ancho = Math.max(...Object.values(geo.nodes).map((c) => c.x + c.width)) + 40;
  geo.width = ancho;
  const vista: VistaResuelta = { nodes: [...grupos, ...nodos], edges: [], overrides: [], steps: [] };
  return { vista, geometria: geo, svg: [...svgFragmentos, ...svgLifelines, ...svgMensajes, ...svgEncima], guardas: [...svgGuardas, ...svgNotas], quitar, vaciar: new Set(activaciones.map((a) => a.id)), notas: new Set(notas.map((n) => n.id)) };
}

// ---------------------------------------------------------------- ER

function er(vistaEr: VistaResuelta, geo: Geometria, estilo: Estilo): { vista: VistaResuelta; svg: Elemento[] } {
  const base = estilo.pintura.arista;
  const { color, ancho } = trazo(base);
  const svg: Elemento[] = [];
  const etiquetas: Elemento[] = [];
  for (const arista of vistaEr.edges) {
    const id = idDeArista(arista);
    const puntos = geo.edges[id]?.points;
    if (puntos === undefined) continue;
    const desde = `${arista.from.node}#${arista.from.attribute ?? ''}`;
    const pintura = pinturaDeMensaje(base, IDENTIFICANTES.has(desde) ? 'er' : 'er-no-identificante');
    svg.push(...pintarTrazos(pintura, puntos, estilo.pintura.semilla));
    if (arista.fromCardinality !== undefined) svg.push(pieDeGallo(arista.fromCardinality, puntos[0]!, puntos[1]!, color, ancho, estilo.fondo));
    if (arista.toCardinality !== undefined) svg.push(pieDeGallo(arista.toCardinality, puntos.at(-1)!, puntos.at(-2)!, color, ancho, estilo.fondo));
    if (arista.label !== undefined) etiquetas.push(pintarEtiquetaDeArista(estilo, { id, texto: arista.label, puntos, caja: geo.labels[id] }));
  }
  const nodes = vistaEr.nodes.map((n) => ({
    ...n,
    attributes: n.attributes.map((a) => {
      const clave = `${n.id}#${a.name}`;
      return { ...a, type: `${a.type}${OPCIONALES.has(clave) ? '?' : ''}${CLAVES[clave] !== undefined ? `  ${CLAVES[clave]}` : ''}` };
    }),
  }));
  return { vista: { ...vistaEr, nodes, edges: [] }, svg: [...svg, ...etiquetas] };
}

// ---------------------------------------------------------------- Pagina

function leerTemas(): Record<string, string> {
  const archivos: Record<string, string> = {};
  for (const f of readdirSync(TEMAS)) if (f.endsWith('.dg')) archivos[`temas/${f}`] = readFileSync(join(TEMAS, f), 'utf8');
  return archivos;
}

export async function construir(): Promise<string> {
  const archivos = { ...leerTemas(), 'modelo.dg': MODELO };
  const fuentes = readdirSync(join(TEMAS, 'fuentes')).map((f) => `temas/fuentes/${f}`);
  const sondeo = abrirSesion(archivos, { archivosDeFuente: fuentes });
  if (sondeo.fuente === undefined) throw new Error(JSON.stringify((await sondeo.diagnosticar()).filter((i) => i.severity === 'error'), null, 2));
  const nombres = sondeo.fuente.themes.map((t) => t.name);
  const iconos = genericIcons();
  const urlDeFuente = (ruta: string): string => `../../examples/rinthel-arch/${ruta}`;
  const secciones: string[] = [];

  for (const nombre of nombres) {
    const sesion = abrirSesion(archivos, { tema: nombre, archivosDeFuente: fuentes });
    const fuente = sesion.fuente!;
    const tema = fuente.themes.find((t) => t.name === nombre)!;
    const estilo = resolverEstilo(tema, undefined, fuentes);
    const dibujos: string[] = [];
    try {
      const gP = (await sesion.geometria('participantes'))!.geometry;
      const vP = resolveView(fuente, 'participantes')!;
      const s = secuencia(gP, vP, estilo);
      const escenaS = construirEscena({ view: s.vista, geometry: s.geometria, theme: tema, estilo, icons: iconos, width: s.geometria.width, height: s.geometria.height, urlDeFuente, reducedMotion: 'on' });
      quitarCajas(escenaS, s.quitar);
      quitarSlots(escenaS, s.vaciar, 'todos');
      quitarSlots(escenaS, s.notas, new Set(['badge', 'icon']));
      inyectarEnAristas(escenaS, s.svg);
      inyectarEncima(escenaS, s.guardas, s.geometria.width, s.geometria.height);
      dibujos.push(`<h2 style="color:${trazo(estilo.pintura.arista).color}">Secuencia: checkout</h2>${serializar(escenaS)}`);

      const gE = (await sesion.geometria('er'))!.geometry;
      const vE = resolveView(fuente, 'er')!;
      const e = er(vE, gE, estilo);
      const estiloEr = { ...estilo, pintura: formasDeTabla(estilo.pintura) as Estilo['pintura'] };
      const escenaE = construirEscena({ view: e.vista, geometry: gE, theme: tema, estilo: estiloEr, icons: iconos, width: gE.width, height: gE.height, urlDeFuente, reducedMotion: 'on' });
      inyectarEnAristas(escenaE, e.svg);
      dibujos.push(`<h2 style="color:${trazo(estilo.pintura.arista).color}">ER: pedidos</h2>${serializar(escenaE)}`);
    } catch (error) {
      dibujos.push(`<pre>${String((error as Error).stack)}</pre>`);
    }
    secciones.push(`<section data-variante="${nombre}" style="--fondo:${estilo.fondo};--texto:${estilo.texto};font-family:${estilo.fuenteCuerpo.replace(/"/g, "'")}">${dibujos.join('')}</section>`);
  }
  return pagina(nombres, secciones);
}

function pagina(nombres: string[], secciones: string[]): string {
  return `<!doctype html><html lang="es"><head><meta charset="utf-8"><title>PROTOTIPO: secuencia y ER con Temas existentes</title>
<style>
  body { margin: 0; }
  section { display: none; min-height: 100vh; padding: 16px 24px 96px; background: var(--fondo); color: var(--texto); }
  section.activa { display: block; }
  section h2 { font-size: 15px; font-weight: 600; margin: 18px 0 6px; opacity: .8; }
  section [data-diagram] { position: relative; overflow: hidden; }
  /* El prototipo estima el ancho del texto (sin la fuente real): la pestana del Fragmento no se recorta. */
  .rd-grupo .rd-title { width: auto !important; overflow: visible !important; white-space: nowrap; }
  body:not(.nota-A) [data-id="n1"], body:not(.nota-A) [data-id="n2"] { display: none; }
  body:not(.nota-B) .nota-B, body:not(.nota-C) .nota-C { display: none; }
  #notas { display: flex; gap: 4px; }
  #barra #notas button { width: auto; height: 28px; padding: 0 10px; font: 600 12px system-ui; white-space: nowrap; }
  #notas button.on { background: #fff; color: #111; }
  .aviso { position: fixed; top: 8px; right: 12px; z-index: 10; font: 12px system-ui; background: #111; color: #fff; padding: 4px 10px; border-radius: 6px; opacity: .75; }
  #barra { position: fixed; bottom: 18px; left: 50%; transform: translateX(-50%); z-index: 10; display: flex; gap: 10px; align-items: center;
    background: #111; color: #fff; font: 600 14px system-ui; padding: 8px 14px; border-radius: 999px; box-shadow: 0 6px 24px #0007; }
  #barra button { background: #333; color: #fff; border: 0; border-radius: 999px; width: 32px; height: 32px; font-size: 16px; cursor: pointer; }
  #barra span { min-width: 220px; text-align: center; }
</style></head><body>
<div class="aviso">PROTOTIPO, desechable: rama prototype/tipos-diagrama</div>
${secciones.join('\n')}
<div id="barra"><button id="ant" aria-label="Anterior">&#8592;</button><span id="etq"></span><button id="sig" aria-label="Siguiente">&#8594;</button><span style="min-width:0;opacity:.7">Nota:</span><span id="notas" style="min-width:0"><button data-n="A">A nodo</button><button data-n="B">B papel</button><button data-n="C">C margen</button></span></div>
<script>
  const variantes = ${JSON.stringify(nombres)};
  function mostrar(v) {
    document.querySelectorAll('section').forEach((s) => s.classList.toggle('activa', s.dataset.variante === v));
    const i = variantes.indexOf(v);
    document.getElementById('etq').textContent = (i + 1) + '/' + variantes.length + '  ' + v;
  }
  function ir(d) {
    const p = new URLSearchParams(location.search);
    const i = variantes.indexOf(p.get('variant') ?? variantes[0]);
    p.set('variant', variantes[(i + d + variantes.length) % variantes.length]);
    history.replaceState(null, '', '?' + p);
    mostrar(p.get('variant'));
    scrollTo(0, 0);
  }
  document.getElementById('ant').onclick = () => ir(-1);
  document.getElementById('sig').onclick = () => ir(1);
  addEventListener('keydown', (e) => {
    if (e.target.closest('input,textarea,[contenteditable]')) return;
    if (e.key === 'ArrowLeft') ir(-1);
    if (e.key === 'ArrowRight') ir(1);
  });
  function nota(n) {
    const p = new URLSearchParams(location.search);
    p.set('nota', n);
    history.replaceState(null, '', '?' + p);
    document.body.className = 'nota-' + n;
    document.querySelectorAll('#notas button').forEach((b) => b.classList.toggle('on', b.dataset.n === n));
  }
  document.querySelectorAll('#notas button').forEach((b) => (b.onclick = () => nota(b.dataset.n)));
  nota(new URLSearchParams(location.search).get('nota') ?? 'B');
  mostrar(new URLSearchParams(location.search).get('variant') ?? variantes[0]);
</script></body></html>`;
}

const html = await construir();
mkdirSync(join(import.meta.dirname, 'out'), { recursive: true });
writeFileSync(join(import.meta.dirname, 'out/index.html'), html);
console.log('prototype-tipos-diagrama/out/index.html');
