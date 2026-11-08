/**
 * Layout de una Vista de secuencia (ADR 0009): algoritmo propio, sin ELK, determinista y sincrono.
 * Columnas: una por Lifeline en el orden de `vista.nodes`; la distancia entre vecinas es la mayor entre el hueco minimo,
 * lo que piden las cabeceras y la etiqueta mas ancha de un Mensaje que las cruza (o el lazo y la etiqueta de un Mensaje
 * propio). Filas: de arriba abajo, una por Mensaje, con el alto de su etiqueta mas un hueco. Las activaciones salen de la
 * pila `sync`/`reply` (`activacionesDe`); cada nivel anidado se desplaza medio ancho de activacion y las flechas terminan
 * en el borde de la activacion vigente.
 */
import { activacionesDe } from 'canonico';
import type { Activacion, AnclajeDeNota, ItemResuelto, MensajeResuelto, NotaResuelta, OperadorDeFragmento, VistaResuelta } from 'canonico';
import { ESQUINA_DE_NOTA, cajaDeNota, colocarEnCaja, colocarNodo, comoTabla, contenidoDeNodo, metricasDeHoja, metricasDeSecuencia, tamanoDeEtiqueta, textoDeGuarda } from 'tema';
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

/** Operando de un Fragmento colocado: su franja vertical, su guarda (caja del texto `[guarda]`) y el divisor sobre el. */
export interface OperandoColocado {
  y1: number;
  y2: number;
  guard?: { text: string; box: CajaDeNodo };
  /** `y` del divisor que lo separa del operando anterior; ausente en el primero. */
  divider?: number;
}

/** Marco de un Fragmento: cubre las Lifelines de su contenido; `tab` es la caja de la pestana con el texto del operador. */
export interface MarcoDeFragmento {
  ruta: string;
  operator: OperadorDeFragmento | 'ref';
  /** Titulo de la Interaccion referida, solo en `ref`: caja del texto bajo la pestana. */
  title?: { text: string; box: CajaDeNodo };
  /** Profundidad de anidacion (0 el exterior). */
  nivel: number;
  x: number;
  y: number;
  width: number;
  height: number;
  tab: CajaDeNodo;
  operands: OperandoColocado[];
}

/** Nota colocada (papel): caja, texto ya envuelto (una cadena por linea) y esquina doblada. */
export interface NotaColocada {
  ruta: string;
  anchor: AnclajeDeNota;
  x: number;
  y: number;
  width: number;
  height: number;
  lines: string[];
  lineHeight: number;
  /** Lado de la esquina doblada (arriba a la derecha). */
  fold: number;
}

/** `box` de un Grupo abierto: envuelve las cabeceras y Lifelines de sus hijas; `title` es la caja de su nombre (arriba a la izquierda). */
export interface CajaDeGrupoColocada {
  id: string;
  /** Texto del nombre del Grupo. */
  label: string;
  /** Anidacion entre `box`es (0 el exterior). */
  nivel: number;
  x: number;
  y: number;
  width: number;
  height: number;
  title: CajaDeNodo;
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
  /** Marcos de los Fragmentos, los exteriores antes que los anidados. */
  fragments: MarcoDeFragmento[];
  /** Notas, en orden de declaracion. */
  notes: NotaColocada[];
  /** `box` de los Grupos abiertos, los exteriores antes que los anidados. */
  groups: CajaDeGrupoColocada[];
  width: number;
  height: number;
}

/**
 * Constantes de la secuencia (px) que el Tema no ajusta. Las separaciones que si (hueco entre Lifelines y entre Mensajes,
 * ancho de lazo y de activacion, padding de Fragmento, desplazamiento de `create`) son Metricas del Tema: `Metricas.secuencia`.
 */
const MARGEN = 24;
const SEPARACION_DE_CABECERAS = 24;
const HOLGURA_DE_ETIQUETA = 24;
const ALTO_DE_LAZO = 28;
const ESPACIO_ANTES_DEL_MENSAJE = 12;
const RELLENO_FINAL = 24;
const SANGRIA_DE_ANIDADO = 10;
const HUECO_ENTRE_FRAGMENTOS = 10;
const HOLGURA_DE_PESTANA = 12;
const HOLGURA_DE_GUARDA = 8;
const HUECO_DE_NOTA = 12;
const SOBRESALE_DE_NOTA = 8;
const ESPACIO_ENTRE_NOTAS = 8;
const RELLENO_H_DE_GRUPO = 8;
const RELLENO_V_DE_GRUPO = 4;
const HOLGURA_DE_TITULO = 8;

/** Niveles de Fragmentos anidados de una lista de items (0 si no hay ninguno); `destino` recibe, por Fragmento, cuantos niveles hay bajo el. */
function profundidadDe(items: readonly ItemResuelto[], destino = new Map<string, number>()): number {
  return Math.max(
    0,
    ...items.map((item) => {
      if (item.type === 'message' || item.type === 'note') return 0;
      if (item.type === 'ref') {
        destino.set(item.ruta, 0);
        return 1;
      }
      const dentro = Math.max(0, ...item.operands.map((operando) => profundidadDe(operando.items, destino)));
      destino.set(item.ruta, dentro);
      return 1 + dentro;
    }),
  );
}

/** Notas de una lista de items, anidadas incluidas. */
function notasDe(items: readonly ItemResuelto[]): NotaResuelta[] {
  return items.flatMap((item): NotaResuelta[] => (item.type === 'note' ? [item] : item.type === 'fragment' ? item.operands.flatMap((o) => notasDe(o.items)) : []));
}

export function layoutSecuencia(vista: VistaResuelta, metricas: Metricas | TablaDeMetricas): GeometriaSecuencia {
  const tabla = comoTabla(metricas);
  const sec = tabla.base.secuencia ?? metricasDeSecuencia(undefined);
  const HUECO_ENTRE_LIFELINES = sec.huecoEntreLifelines;
  const ANCHO_DE_ACTIVACION = sec.anchoDeActivacion;
  const ANCHO_DE_LAZO = sec.anchoDeLazo;
  const ESPACIO_DESPUES_DEL_MENSAJE = Math.max(0, sec.huecoEntreMensajes - ESPACIO_ANTES_DEL_MENSAJE);
  const RELLENO_H_DE_FRAGMENTO = sec.rellenoDeFragmento;
  const RELLENO_ABAJO_DE_FRAGMENTO = sec.rellenoVerticalDeFragmento;
  const RELLENO_ARRIBA_DE_FRAGMENTO = Math.max(2, RELLENO_ABAJO_DE_FRAGMENTO - 4);
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
  // Notas: `over X, Y` pide que la caja quepa entre X e Y (con su sobresalir); `left of`/`right of` piden hueco con la vecina.
  const cajasDeNota = new Map(notasDe(vista.interaction?.items ?? []).map((nota) => [nota.ruta, cajaDeNota(nota.text, tabla.etiqueta)]));
  const pedidosDeNota = notasDe(vista.interaction?.items ?? []).flatMap((nota): { desde: number; hasta: number; ancho: number }[] => {
    const caja = cajasDeNota.get(nota.ruta)!;
    const cols = nota.targets.map((id) => columna.get(id)!);
    const a = Math.min(...cols);
    const b = Math.max(...cols);
    if (nota.anchor === 'over') return a === b ? [] : [{ desde: a, hasta: b, ancho: caja.width - 2 * SOBRESALE_DE_NOTA }];
    if (nota.anchor === 'left') return a > 0 ? [{ desde: a - 1, hasta: a, ancho: caja.width + 2 * HUECO_DE_NOTA }] : [];
    return a + 1 < lifelines.length ? [{ desde: a, hasta: a + 1, ancho: caja.width + 2 * HUECO_DE_NOTA }] : [];
  });
  const pedidos = [...mensajes.flatMap((mensaje) => necesidades(mensaje) ?? []), ...pedidosDeNota].sort((x, y) => x.hasta - x.desde - (y.hasta - y.desde) || x.desde - y.desde);
  for (const { desde, hasta, ancho } of pedidos) {
    const actual = huecos.slice(desde, hasta).reduce((suma, h) => suma + h, 0);
    if (actual < ancho) huecos[hasta - 1] = huecos[hasta - 1]! + (ancho - actual);
  }

  // `box` de Grupos abiertos: cada nivel reserva una franja de titulo sobre las cabeceras y relleno a los lados.
  const grupos = vista.interaction?.groups ?? [];
  const niveles = Math.max(0, ...grupos.map((g) => g.nivel + 1));
  const titulos = new Map(grupos.map((g) => [g.id, tamanoDeEtiqueta(g.label, tabla.etiqueta)]));
  const altoDeTitulo = Math.max(0, ...[...titulos.values()].map((t) => t.height)) + HOLGURA_DE_TITULO;
  const relleno = (nivel: number): number => RELLENO_H_DE_GRUPO * (niveles - nivel);
  const extremos = new Map(grupos.map((g) => [g.id, { desde: Math.min(...g.lifelines.map((id) => columna.get(id)!)), hasta: Math.max(...g.lifelines.map((id) => columna.get(id)!)) }]));
  // El hueco entre dos columnas suma el relleno del box que termina a la izquierda y el del que empieza a la derecha.
  for (let k = 0; k + 1 < lifelines.length; k++) {
    const termina = Math.max(0, ...grupos.filter((g) => extremos.get(g.id)!.hasta === k).map((g) => relleno(g.nivel)));
    const empieza = Math.max(0, ...grupos.filter((g) => extremos.get(g.id)!.desde === k + 1).map((g) => relleno(g.nivel)));
    huecos[k] = huecos[k]! + termina + empieza;
  }
  const centros: number[] = [];
  const nivelesBajo = new Map<string, number>();
  const profundidad = profundidadDe(vista.interaction?.items ?? [], nivelesBajo);
  const margenIzquierdo = MARGEN + Math.max(profundidad > 0 ? RELLENO_H_DE_FRAGMENTO + SANGRIA_DE_ANIDADO * (profundidad - 1) : 0, ...grupos.filter((g) => extremos.get(g.id)!.desde === 0).map((g) => relleno(g.nivel)));
  // Lo que las Notas de la primera columna sobresalen a su izquierda.
  const saliente0 = Math.max(
    0,
    ...notasDe(vista.interaction?.items ?? []).flatMap((nota) => {
      if (!nota.targets.some((id) => columna.get(id) === 0)) return [];
      const ancho = cajasDeNota.get(nota.ruta)!.width;
      return [nota.anchor === 'left' ? ancho + HUECO_DE_NOTA : nota.anchor === 'over' && nota.targets.length === 1 ? ancho / 2 : SOBRESALE_DE_NOTA];
    }),
  );
  lifelines.forEach((_, i) => centros.push(i === 0 ? margenIzquierdo + Math.max((medidas[0]?.width ?? 0) / 2, saliente0) : centros[i - 1]! + huecos[i - 1]!));
  const x = (id: string): number => Math.round(centros[columna.get(id)!]!);
  const yCabecera = MARGEN + niveles * altoDeTitulo + (niveles > 0 ? RELLENO_V_DE_GRUPO : 0);
  const yInicio = yCabecera + altoDeCabecera + MARGEN;

  // Filas: la `y` de cada flecha, de arriba abajo; un Fragmento suma pestana, guarda y padding arriba, padding abajo y un divisor por operando.
  const { activaciones } = activacionesDe(mensajes);
  const creada = (id: string): number => mensajes.findIndex((m) => m.kind === 'create' && m.to === id);
  const destruccion = (id: string): number => mensajes.findIndex((m) => m.kind === 'destroy' && m.to === id);
  const indiceDe = new Map(mensajes.map((m, i) => [m.ruta, i]));
  const ys: number[] = [];
  const altosDeLazo: number[] = [];
  const marcos: MarcoDeFragmento[] = [];
  /** Mensajes (rutas) contenidos en cada Fragmento, anidados incluidos. */
  const contenido = new Map<string, string[]>();
  /** Extremos horizontales de las Notas de cada Fragmento y columnas de cada `ref`. */
  const extremosDeNota = new Map<string, number[]>();
  const columnasDeRef = new Map<string, number[]>();
  const notas: NotaColocada[] = [];
  let cursor = yInicio;
  const colocarMensaje = (mensaje: MensajeResuelto): void => {
    const i = indiceDe.get(mensaje.ruta)!;
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
  };
  /** Coloca los items y devuelve la profundidad de Fragmentos anidados que contienen (0 si no hay). */
  const colocarItems = (items: readonly ItemResuelto[], nivel: number, rutas: string[], extremos: number[]): number => {
    let altura = 0;
    for (const item of items) {
      if (item.type === 'message') {
        colocarMensaje(item.message);
        rutas.push(item.message.ruta);
        continue;
      }
      if (item.type === 'note') {
        const caja = cajasDeNota.get(item.ruta)!;
        const cols = item.targets.map((id) => x(id));
        const izq = Math.min(...cols);
        const der = Math.max(...cols);
        const ancho = item.anchor === 'over' && cols.length > 1 && izq !== der ? Math.max(caja.width, der - izq + 2 * SOBRESALE_DE_NOTA) : caja.width;
        const nx = item.anchor === 'left' ? izq - HUECO_DE_NOTA - ancho : item.anchor === 'right' ? der + HUECO_DE_NOTA : Math.round((izq + der) / 2 - ancho / 2);
        const arriba = cursor + ESPACIO_ENTRE_NOTAS;
        notas.push({ ruta: item.ruta, anchor: item.anchor, x: nx, y: arriba, width: ancho, height: caja.height, lines: caja.lines, lineHeight: caja.lineHeight, fold: ESQUINA_DE_NOTA });
        extremos.push(nx, nx + ancho);
        cursor = arriba + caja.height + ESPACIO_ENTRE_NOTAS;
        continue;
      }
      if (item.type === 'ref') {
        const arriba = cursor + HUECO_ENTRE_FRAGMENTOS;
        const pestana = tamanoDeEtiqueta('ref', tabla.etiqueta);
        const titulo = tamanoDeEtiqueta(item.title, tabla.etiqueta);
        const tab = { x: 0, y: arriba, width: pestana.width + HOLGURA_DE_PESTANA, height: pestana.height };
        const alto = pestana.height + titulo.height + RELLENO_ARRIBA_DE_FRAGMENTO + RELLENO_ABAJO_DE_FRAGMENTO;
        marcos.push({ ruta: item.ruta, operator: 'ref', nivel, x: 0, y: arriba, width: 0, height: alto, tab, title: { text: item.title, box: { x: 0, y: arriba + pestana.height + RELLENO_ARRIBA_DE_FRAGMENTO / 2, ...titulo } }, operands: [{ y1: arriba, y2: arriba + alto }] });
        columnasDeRef.set(item.ruta, (item.participantes.length > 0 ? item.participantes : lifelines.map((l) => l.id)).map(x));
        cursor = arriba + alto + HUECO_ENTRE_FRAGMENTOS;
        altura = Math.max(altura, 1);
        continue;
      }
      const dentro: string[] = [];
      const extremosDentro: number[] = [];
      const arriba = cursor + HUECO_ENTRE_FRAGMENTOS;
      const pestana = tamanoDeEtiqueta(item.operator, tabla.etiqueta);
      const tab = { x: 0, y: arriba, width: pestana.width + HOLGURA_DE_PESTANA, height: pestana.height };
      const marco: MarcoDeFragmento = { ruta: item.ruta, operator: item.operator, nivel, x: 0, y: arriba, width: 0, height: 0, tab, operands: [] };
      marcos.push(marco);
      let alturaInterna = 0;
      item.operands.forEach((operando, k) => {
        const arribaDelOperando = k === 0 ? arriba : cursor;
        const guarda = operando.guard === undefined ? undefined : textoDeGuarda(operando.guard);
        const medida = guarda === undefined ? undefined : tamanoDeEtiqueta(guarda, tabla.etiqueta);
        const colocado: OperandoColocado = { y1: arribaDelOperando, y2: arribaDelOperando, ...(k > 0 && { divider: arribaDelOperando }) };
        if (guarda !== undefined && medida !== undefined) {
          // En el primer operando la guarda va junto a la pestana; en los siguientes, bajo su divisor.
          colocado.guard = { text: guarda, box: { x: 0, y: arribaDelOperando, ...medida } };
        }
        const cabecera = k === 0 ? Math.max(tab.height, medida?.height ?? 0) : (medida?.height ?? 0);
        cursor = arribaDelOperando + cabecera + RELLENO_ARRIBA_DE_FRAGMENTO;
        alturaInterna = Math.max(alturaInterna, colocarItems(operando.items, nivel + 1, dentro, extremosDentro));
        cursor += RELLENO_ABAJO_DE_FRAGMENTO;
        colocado.y2 = cursor;
        marco.operands.push(colocado);
      });
      marco.height = cursor - arriba;
      cursor += HUECO_ENTRE_FRAGMENTOS;
      contenido.set(item.ruta, dentro);
      extremosDeNota.set(item.ruta, extremosDentro);
      extremos.push(...extremosDentro);
      rutas.push(...dentro);
      altura = Math.max(altura, alturaInterna + 1);
    }
    return altura;
  };
  colocarItems(vista.interaction?.items ?? [], 0, [], []);
  const yFinal = cursor;
  const finDeFragmento = (ruta: string): number => {
    const marco = marcos.find((m) => m.ruta === ruta)!;
    return marco.y + marco.height;
  };

  /** `y` de la cabecera de cada Lifeline: la inicial, o centrada en su Mensaje `create`. */
  const yDeCabecera = (id: string): number => {
    const c = creada(id);
    return c < 0 ? yCabecera : Math.max(yCabecera, Math.round(ys[c]! - altoDeCabecera / 2 + sec.desplazamientoDeCreate));
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
    y2: Math.min(a.cierraEn !== undefined ? finDeFragmento(a.cierraEn) : a.hasta === null ? yFinal : ys[a.hasta]!, yFinalDe(a.lifeline)),
    width: ANCHO_DE_ACTIVACION,
  }));

  /** Indice del Mensaje en que termina la activacion; el que cierra un Fragmento termina medio indice tras su ultimo Mensaje. */
  const cortes = new Map<Activacion, number>();
  const corte = (a: Activacion): number => {
    if (a.cierraEn === undefined) return a.hasta ?? Infinity;
    let c = cortes.get(a);
    if (c === undefined) {
      c = Math.max(...mensajes.flatMap((m, i) => (m.ambito?.includes(a.cierraEn!) ? [i] : []))) + 0.5;
      cortes.set(a, c);
    }
    return c;
  };
  /** Nivel de la activacion mas anidada de `lifeline` vigente tras (`despues`) o justo antes de enviar el Mensaje `i`; -1 si no hay. */
  const nivelVigente = (lifeline: string, i: number, despues: boolean): number =>
    Math.max(-1, ...activaciones.filter((a: Activacion) => a.lifeline === lifeline && (despues ? a.desde <= i && corte(a) > i : a.desde < i && corte(a) >= i)).map((a) => a.nivel));
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

  // Marcos: cubren las Lifelines de su contenido mas relleno; cada nivel de anidacion suma una sangria.
  for (const marco of marcos) {
    const rutasDentro = contenido.get(marco.ruta) ?? [];
    const xs = [
      ...rutasDentro.flatMap((ruta) => {
        const r = rutas[ruta];
        return r === undefined ? [] : [...r.points.map((p) => p.x), ...(r.label === undefined ? [] : [r.label.x, r.label.x + r.label.width])];
      }),
      ...(extremosDeNota.get(marco.ruta) ?? []),
    ];
    const columnas = [
      ...rutasDentro.flatMap((ruta) => {
        const m = mensajes[indiceDe.get(ruta)!]!;
        return [x(m.from), x(m.to)];
      }),
      ...(columnasDeRef.get(marco.ruta) ?? []),
    ];
    const relleno = RELLENO_H_DE_FRAGMENTO + SANGRIA_DE_ANIDADO * (nivelesBajo.get(marco.ruta) ?? 0);
    const izquierda = Math.min(...xs, ...columnas) - relleno;
    const guardaPrimera = marco.operands[0]?.guard?.box.width ?? 0;
    const minimo = Math.max(marco.title === undefined ? 0 : marco.title.box.width + 2 * HOLGURA_DE_GUARDA, marco.tab.width) + (guardaPrimera > 0 ? guardaPrimera + HOLGURA_DE_GUARDA : 0) + 2 * HOLGURA_DE_GUARDA;
    const ancho = Math.max(Math.max(...xs, ...columnas) + relleno - izquierda, minimo, ...marco.operands.map((o) => (o.guard?.box.width ?? 0) + 2 * HOLGURA_DE_GUARDA));
    marco.x = Math.round(izquierda);
    marco.width = Math.round(ancho);
    marco.tab = { ...marco.tab, x: marco.x };
    if (marco.title !== undefined) marco.title = { text: marco.title.text, box: { ...marco.title.box, x: marco.x + HOLGURA_DE_GUARDA } };
    marco.operands.forEach((operando, k) => {
      if (operando.guard === undefined) return;
      const box = k === 0 ? { ...operando.guard.box, x: marco.x + marco.tab.width + HOLGURA_DE_GUARDA } : { ...operando.guard.box, x: marco.x + HOLGURA_DE_GUARDA };
      operando.guard = { text: operando.guard.text, box };
    });
    derecha = Math.max(derecha, marco.x + marco.width);
  }
  for (const nota of notas) derecha = Math.max(derecha, nota.x + nota.width);

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
  // Cada box rodea las cabeceras de sus Lifelines hasta el pie de sus lineas (los exteriores sobresalen mas).
  const pie = yFinal + RELLENO_FINAL;
  const cajasDeGrupo: CajaDeGrupoColocada[] = grupos.map((g) => {
    const cajas = g.lifelines.map((id) => nodes[id]!);
    const titulo = titulos.get(g.id)!;
    const izquierda = Math.min(...cajas.map((c) => c.x)) - relleno(g.nivel);
    const ancho = Math.max(Math.max(...cajas.map((c) => c.x + c.width)) + relleno(g.nivel) - izquierda, titulo.width + 2 * HOLGURA_DE_TITULO);
    const arriba = MARGEN + g.nivel * altoDeTitulo;
    const abajo = pie + RELLENO_V_DE_GRUPO * (niveles - g.nivel);
    derecha = Math.max(derecha, izquierda + ancho);
    return { id: g.id, label: g.label, nivel: g.nivel, x: Math.round(izquierda), y: arriba, width: Math.round(ancho), height: abajo - arriba, title: { x: Math.round(izquierda) + HOLGURA_DE_TITULO, y: arriba + HOLGURA_DE_TITULO / 2, ...titulo } };
  });
  const hayAlgo = lifelines.length > 0;
  return {
    kind: 'secuencia',
    nodes,
    lifelines: lineas,
    activations: cajasDeActivacion,
    messages: rutas,
    fragments: marcos,
    notes: notas,
    groups: cajasDeGrupo,
    width: hayAlgo ? derecha + MARGEN : 2 * MARGEN,
    height: hayAlgo ? pie + RELLENO_V_DE_GRUPO * niveles + MARGEN : 2 * MARGEN,
  };
}
