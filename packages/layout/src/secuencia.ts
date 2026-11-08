/**
 * Layout de una Vista de secuencia (ADR 0009): algoritmo propio, sin ELK, determinista y sincrono.
 * Columnas: una por Lifeline en el orden de `vista.nodes`; la distancia entre vecinas es la mayor entre el hueco minimo,
 * lo que piden las cabeceras y la etiqueta mas ancha de un Mensaje que las cruza (o el lazo y la etiqueta de un Mensaje
 * propio). Filas: de arriba abajo, una por Mensaje, con el alto de su etiqueta mas un hueco. Las activaciones salen de la
 * pila `sync`/`reply` (`activacionesDe`); cada nivel anidado se desplaza medio ancho de activacion y las flechas terminan
 * en el borde de la activacion vigente.
 */
import { activacionesDe } from 'canonico';
import type { Activacion, MensajeResuelto, VistaResuelta } from 'canonico';
import { colocarEnCaja, colocarNodo, comoTabla, contenidoDeNodo, metricasDeHoja, tamanoDeEtiqueta } from 'tema';
import type { Metricas, TablaDeMetricas } from 'tema';

import type { CajaDeNodo, Punto } from './layout';

/** Barra de activacion de una Lifeline: `x` es su borde izquierdo y `nivel` su anidacion (0 la exterior). */
export interface CajaDeActivacion {
  lifeline: string;
  nivel: number;
  x: number;
  y1: number;
  y2: number;
  width: number;
}

/** Ruta de un Mensaje (2 puntos, o 4 si es propio: el lazo) y la caja de su etiqueta si la tiene. */
export interface RutaDeMensaje {
  points: Punto[];
  label?: CajaDeNodo;
}

/** Geometria de una Vista de secuencia: `nodes` son las cabeceras de las Lifelines (todas en la misma `y`). */
export interface GeometriaSecuencia {
  kind: 'secuencia';
  nodes: Record<string, CajaDeNodo>;
  /** Linea vertical de cada Lifeline, por id de Nodo: `x` central, desde `y1` (bajo la cabecera) hasta `y2`. */
  lifelines: Record<string, { x: number; y1: number; y2: number; /** Cortada en un `destroy`: `y2` es la `y` de ese Mensaje y se pinta el marcador `end`. */ destroyed?: true }>;
  activations: CajaDeActivacion[];
  /** Ruta de cada Mensaje por su `ruta` (identidad en la Interaccion). */
  messages: Record<string, RutaDeMensaje>;
  width: number;
  height: number;
}

/** Defectos del nucleo para la secuencia (px); el Tema los ajustara con `diagram sequence`. */
const MARGEN = 24;
const HUECO_ENTRE_LIFELINES = 160;
const SEPARACION_DE_CABECERAS = 24;
const HOLGURA_DE_ETIQUETA = 24;
const ANCHO_DE_ACTIVACION = 10;
const ANCHO_DE_LAZO = 36;
const ALTO_DE_LAZO = 28;
const ESPACIO_ANTES_DEL_MENSAJE = 12;
const ESPACIO_DESPUES_DEL_MENSAJE = 20;
const RELLENO_FINAL = 24;

export function layoutSecuencia(vista: VistaResuelta, metricas: Metricas | TablaDeMetricas): GeometriaSecuencia {
  const tabla = comoTabla(metricas);
  const mensajes = vista.interaction?.messages ?? [];
  const lifelines = vista.nodes;
  const columna = new Map(lifelines.map((nodo, i) => [nodo.id, i]));

  // Cabeceras: cada una con su tamano de Nodo, todas con el alto de la mayor.
  const medidas = lifelines.map((nodo) => {
    const m = metricasDeHoja(tabla, nodo);
    return colocarNodo(contenidoDeNodo(nodo, m), m);
  });
  const altoDeCabecera = Math.max(0, ...medidas.map(({ height }) => height));
  const anchoDeEtiqueta = (mensaje: MensajeResuelto): number => (mensaje.label === undefined ? 0 : tamanoDeEtiqueta(mensaje.label, tabla.etiqueta).width);
  const altoDeEtiqueta = (mensaje: MensajeResuelto): number => (mensaje.label === undefined ? 0 : tamanoDeEtiqueta(mensaje.label, tabla.etiqueta).height);

  // Distancia entre los centros de columnas vecinas.
  const huecos = lifelines.slice(1).map((_, i) => Math.max(HUECO_ENTRE_LIFELINES, (medidas[i]!.width + medidas[i + 1]!.width) / 2 + SEPARACION_DE_CABECERAS));
  const necesidades = (mensaje: MensajeResuelto): { desde: number; hasta: number; ancho: number } | undefined => {
    const a = columna.get(mensaje.from);
    const b = columna.get(mensaje.to);
    if (a === undefined || b === undefined) return undefined;
    if (a === b) return a + 1 < lifelines.length ? { desde: a, hasta: a + 1, ancho: ANCHO_DE_LAZO + anchoDeEtiqueta(mensaje) + HOLGURA_DE_ETIQUETA } : undefined;
    return { desde: Math.min(a, b), hasta: Math.max(a, b), ancho: anchoDeEtiqueta(mensaje) + HOLGURA_DE_ETIQUETA + ANCHO_DE_ACTIVACION };
  };
  // Mensajes de menor a mayor alcance: el hueco que falta se suma al ultimo tramo del alcance.
  const pedidos = mensajes.flatMap((mensaje) => necesidades(mensaje) ?? []).sort((x, y) => x.hasta - x.desde - (y.hasta - y.desde) || x.desde - y.desde);
  for (const { desde, hasta, ancho } of pedidos) {
    const actual = huecos.slice(desde, hasta).reduce((suma, h) => suma + h, 0);
    if (actual < ancho) huecos[hasta - 1] = huecos[hasta - 1]! + (ancho - actual);
  }

  const centros: number[] = [];
  lifelines.forEach((_, i) => centros.push(i === 0 ? MARGEN + medidas[0]!.width / 2 : centros[i - 1]! + huecos[i - 1]!));
  const x = (id: string): number => Math.round(centros[columna.get(id)!]!);
  const yCabecera = MARGEN;
  const yInicio = yCabecera + altoDeCabecera + MARGEN;

  // Filas: la `y` de cada flecha, de arriba abajo.
  const { activaciones } = activacionesDe(mensajes);
  const creada = (id: string): number => mensajes.findIndex((m) => m.kind === 'create' && m.to === id);
  const destruccion = (id: string): number => mensajes.findIndex((m) => m.kind === 'destroy' && m.to === id);
  const ys: number[] = [];
  const altosDeLazo: number[] = [];
  let cursor = yInicio;
  mensajes.forEach((mensaje, i) => {
    const alto = altoDeEtiqueta(mensaje);
    if (mensaje.from === mensaje.to) {
      altosDeLazo[i] = Math.max(ALTO_DE_LAZO, alto);
      ys[i] = cursor + ESPACIO_ANTES_DEL_MENSAJE;
      cursor = ys[i]! + altosDeLazo[i]! + ESPACIO_DESPUES_DEL_MENSAJE;
    } else if (mensaje.kind === 'create') {
      // La cabecera del destino se centra en la flecha: hace falta medio alto de cabecera por encima y por debajo.
      ys[i] = Math.max(cursor + alto + ESPACIO_ANTES_DEL_MENSAJE, cursor + altoDeCabecera / 2);
      cursor = ys[i]! + Math.max(ESPACIO_DESPUES_DEL_MENSAJE, altoDeCabecera / 2 + ESPACIO_ANTES_DEL_MENSAJE);
    } else {
      ys[i] = cursor + alto + ESPACIO_ANTES_DEL_MENSAJE;
      cursor = ys[i]! + ESPACIO_DESPUES_DEL_MENSAJE;
    }
  });
  const yFinal = cursor;

  /** `y` de la cabecera de cada Lifeline: la inicial, o centrada en su Mensaje `create`. */
  const yDeCabecera = (id: string): number => {
    const c = creada(id);
    return c < 0 ? yCabecera : Math.round(ys[c]! - altoDeCabecera / 2);
  };
  /** `y` final de la linea: el fondo, o el Mensaje `destroy` que la corta. */
  const yFinalDe = (id: string): number => {
    const d = destruccion(id);
    return d < 0 ? yFinal : ys[d]!;
  };

  const cajasDeActivacion: CajaDeActivacion[] = activaciones.map((a) => ({
    lifeline: a.lifeline,
    nivel: a.nivel,
    x: x(a.lifeline) + (a.nivel * ANCHO_DE_ACTIVACION) / 2 - ANCHO_DE_ACTIVACION / 2,
    y1: ys[a.desde]!,
    y2: Math.min(a.hasta === null ? yFinal : ys[a.hasta]!, yFinalDe(a.lifeline)),
    width: ANCHO_DE_ACTIVACION,
  }));

  /** Nivel de la activacion mas anidada de `lifeline` vigente tras (`despues`) o justo antes de enviar el Mensaje `i`; -1 si no hay. */
  const nivelVigente = (lifeline: string, i: number, despues: boolean): number =>
    Math.max(-1, ...activaciones.filter((a: Activacion) => a.lifeline === lifeline && (despues ? a.desde <= i && (a.hasta === null || a.hasta > i) : a.desde < i && (a.hasta === null || a.hasta >= i))).map((a) => a.nivel));
  const borde = (lifeline: string, nivel: number, lado: 'izquierdo' | 'derecho'): number =>
    nivel < 0 ? x(lifeline) : x(lifeline) + (nivel * ANCHO_DE_ACTIVACION) / 2 + (lado === 'derecho' ? 1 : -1) * (ANCHO_DE_ACTIVACION / 2);

  let derecha = 0;
  const rutas: Record<string, RutaDeMensaje> = {};
  mensajes.forEach((mensaje, i) => {
    const y = ys[i]!;
    const etiqueta = mensaje.label === undefined ? undefined : tamanoDeEtiqueta(mensaje.label, tabla.etiqueta);
    if (mensaje.from === mensaje.to) {
      const inicio = borde(mensaje.from, nivelVigente(mensaje.from, i, false), 'derecho');
      const fin = borde(mensaje.from, nivelVigente(mensaje.to, i, true), 'derecho');
      const lazo = Math.max(inicio, fin) + ANCHO_DE_LAZO;
      const alto = altosDeLazo[i]!;
      const caja = etiqueta === undefined ? undefined : { x: lazo + 6, y: Math.round(y + (alto - etiqueta.height) / 2), ...etiqueta };
      rutas[mensaje.ruta] = { points: [{ x: inicio, y }, { x: lazo, y }, { x: lazo, y: y + alto }, { x: fin, y: y + alto }], ...(caja !== undefined && { label: caja }) };
      derecha = Math.max(derecha, caja === undefined ? lazo : caja.x + caja.width);
      return;
    }
    const haciaLaDerecha = x(mensaje.to) > x(mensaje.from);
    if (mensaje.kind === 'create' || mensaje.kind === 'destroy') {
      const inicio = borde(mensaje.from, nivelVigente(mensaje.from, i, false), haciaLaDerecha ? 'derecho' : 'izquierdo');
      // `create` termina en el borde de la cabecera que baja; `destroy`, en el marcador sobre la linea.
      const fin = mensaje.kind === 'destroy' ? x(mensaje.to) : x(mensaje.to) + (haciaLaDerecha ? -1 : 1) * (medidas[columna.get(mensaje.to)!]!.width / 2);
      const caja = etiqueta === undefined ? undefined : { x: Math.round((inicio + fin) / 2 - etiqueta.width / 2), y: y - etiqueta.height - 2, ...etiqueta };
      rutas[mensaje.ruta] = { points: [{ x: inicio, y }, { x: fin, y }], ...(caja !== undefined && { label: caja }) };
      return;
    }
    const inicio = borde(mensaje.from, nivelVigente(mensaje.from, i, false), haciaLaDerecha ? 'derecho' : 'izquierdo');
    const fin = borde(mensaje.to, nivelVigente(mensaje.to, i, true), haciaLaDerecha ? 'izquierdo' : 'derecho');
    const caja = etiqueta === undefined ? undefined : { x: Math.round((inicio + fin) / 2 - etiqueta.width / 2), y: y - etiqueta.height - 2, ...etiqueta };
    rutas[mensaje.ruta] = { points: [{ x: inicio, y }, { x: fin, y }], ...(caja !== undefined && { label: caja }) };
  });

  const nodes: Record<string, CajaDeNodo> = {};
  const lineas: GeometriaSecuencia['lifelines'] = {};
  lifelines.forEach((nodo, i) => {
    const { width } = medidas[i]!;
    const caja = { x: Math.round(x(nodo.id) - width / 2), y: yDeCabecera(nodo.id), width, height: altoDeCabecera };
    const m = metricasDeHoja(tabla, nodo);
    nodes[nodo.id] = { ...caja, slots: colocarEnCaja(m, contenidoDeNodo(nodo, m), width).slots };
    lineas[nodo.id] = { x: x(nodo.id), y1: caja.y + altoDeCabecera, y2: destruccion(nodo.id) < 0 ? yFinal + RELLENO_FINAL : yFinalDe(nodo.id), ...(destruccion(nodo.id) >= 0 && { destroyed: true as const }) };
    derecha = Math.max(derecha, caja.x + width);
  });
  const hayAlgo = lifelines.length > 0;
  return {
    kind: 'secuencia',
    nodes,
    lifelines: lineas,
    activations: cajasDeActivacion,
    messages: rutas,
    width: hayAlgo ? derecha + MARGEN : 2 * MARGEN,
    height: hayAlgo ? yFinal + RELLENO_FINAL + MARGEN : 2 * MARGEN,
  };
}
