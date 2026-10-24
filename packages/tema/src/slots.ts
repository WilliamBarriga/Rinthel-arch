/**
 * Colocacion de Slots: dado el Tema (por sus Metricas) y el contenido de un
 * Nodo, el rectangulo de cada Slot dentro de la caja y el tamano de esta. Es el
 * unico sitio que decide posiciones: `layout` lo usa para medir la caja y para
 * los puertos de Atributo, `render` pinta cada Slot en su rectangulo, asi que
 * lo reservado es lo dibujado. Los rectangulos son relativos a la esquina
 * superior izquierda de la caja del Nodo.
 *
 * El nucleo es `colocarDisposicion(arbol, medida, ancho)`: recorre el arbol de
 * cajas `row`/`column` (ver `disposicion.ts`) y devuelve un rectangulo por Slot.
 * No conoce ningun Slot por nombre: solo pregunta a `medida` cuanto ocupa cada
 * uno (`undefined`: no reserva espacio) y si es elastico (`DEFINICION_DE_SLOT`).
 * Un Slot nuevo se anade a la tabla de medidas de abajo, no a este algoritmo.
 *
 * Reglas: una caja reserva `pad` por cada lado y `gap` entre hijos presentes
 * (una caja sin hijos presentes no reserva nada). En `column` cada hijo ocupa
 * su alto natural y, sin `align`, todo el ancho; en `row` cada hijo ocupa su
 * ancho natural, los elasticos se reparten por igual el ancho libre y, sin
 * `align`, se centran en vertical. Con `align` un hijo toma su tamano natural y
 * se pega al inicio, centro o final del eje cruzado.
 */
import type { Atributo } from 'canonico';

import { DEFINICION_DE_SLOT } from './catalogo';
import type { DefinicionDeSlot, NombreDeSlot } from './catalogo';
import { esCaja, slotsDe } from './disposicion';
import type { Alineacion, CajaDeSlots, ElementoDeSlots } from './disposicion';
import { anchoDeTexto } from './medicion';
import type { TextoAMedir } from './medicion';
import { muestra, textoDeAtributo } from './metricas';
import type { Metricas } from './metricas';

export interface Rect {
  x: number;
  y: number;
  width: number;
  height: number;
}

export interface Tamano {
  width: number;
  height: number;
}

/**
 * Cuanto ocupa un Slot por si mismo; `undefined` si no tiene contenido y no reserva espacio.
 * `elastico` sustituye al de `DEFINICION_DE_SLOT` cuando el contenido lo decide (un titulo en chip no se estira).
 */
export type MedidaDeSlot = (slot: NombreDeSlot) => (Tamano & { elastico?: boolean }) | undefined;

/** Elemento del arbol ya medido. */
interface Medido {
  tam: Tamano;
  elastico: boolean;
  align?: Alineacion | undefined;
  /** Slot, si es una hoja. */
  slot?: NombreDeSlot;
  /** Caja y sus hijos presentes, si es una caja. */
  caja?: CajaDeSlots;
  hijos: Medido[];
}

/** Margen interior horizontal y vertical de una caja. */
const margenes = (caja: CajaDeSlots): { x: number; y: number } => ({ x: caja.pad, y: caja.padY ?? caja.pad });

function medir(elemento: ElementoDeSlots, medida: MedidaDeSlot): Medido | undefined {
  if (!esCaja(elemento)) {
    const medido = medida(elemento.slot);
    if (medido === undefined) return undefined;
    const { elastico = DEFINICION_DE_SLOT[elemento.slot].elastico, ...tam } = medido;
    return { tam, elastico, align: elemento.align, slot: elemento.slot, hijos: [] };
  }
  const hijos = elemento.hijos.flatMap((hijo) => medir(hijo, medida) ?? []);
  if (hijos.length === 0) return undefined;
  const horizontal = elemento.direccion === 'row';
  const { x: padX, y: padY } = margenes(elemento);
  const suma = hijos.reduce((total, h) => total + (horizontal ? h.tam.width : h.tam.height), 0) + elemento.gap * (hijos.length - 1);
  const mayor = Math.max(...hijos.map((h) => (horizontal ? h.tam.height : h.tam.width)));
  const ancho = (horizontal ? suma : mayor) + 2 * padX + (elemento.holgura ?? 0);
  const alto = (horizontal ? mayor : suma) + 2 * padY;
  return {
    tam: { width: Math.max(ancho, elemento.anchoMinimo ?? 0), height: Math.max(alto, elemento.altoMinimo ?? 0) },
    // Una caja es elastica si alguno de sus hijos lo es: dentro de una fila se estira a lo ancho.
    elastico: hijos.some((h) => h.elastico),
    align: elemento.align,
    caja: elemento,
    hijos,
  };
}

function colocar(nodo: Medido, rect: Rect, salida: Partial<Record<NombreDeSlot, Rect>>): void {
  if (nodo.slot !== undefined) {
    salida[nodo.slot] = rect;
    return;
  }
  const caja = nodo.caja!;
  const horizontal = caja.direccion === 'row';
  const { x: padX, y: padY } = margenes(caja);
  const dentro: Rect = { x: rect.x + padX, y: rect.y + padY, width: Math.max(0, rect.width - 2 * padX), height: Math.max(0, rect.height - 2 * padY) };
  const principalLibre = horizontal ? dentro.width : dentro.height;
  const fijo = nodo.hijos.reduce((suma, h) => suma + (horizontal ? (h.elastico ? 0 : h.tam.width) : h.tam.height), 0) + caja.gap * (nodo.hijos.length - 1);
  // Solo se estiran los elasticos de una fila (el ancho libre); en columna cada hijo ocupa su alto.
  const elasticos = horizontal ? nodo.hijos.filter((h) => h.elastico).length : 0;
  const parte = elasticos === 0 ? 0 : Math.max(0, principalLibre - fijo) / elasticos;
  let cursor = horizontal ? dentro.x : dentro.y;
  for (const hijo of nodo.hijos) {
    const principal = horizontal ? (hijo.elastico ? parte : hijo.tam.width) : hijo.tam.height;
    const cruzadoTotal = horizontal ? dentro.height : dentro.width;
    const natural = horizontal ? hijo.tam.height : hijo.tam.width;
    const alineacion = hijo.align ?? (horizontal ? 'center' : undefined);
    // Sin alineacion en una columna, el hijo ocupa todo el ancho; con ella, su tamano natural.
    const cruzado = alineacion === undefined ? cruzadoTotal : Math.min(natural, cruzadoTotal);
    const origen = (horizontal ? dentro.y : dentro.x) + (alineacion === 'end' ? cruzadoTotal - cruzado : alineacion === 'center' ? (cruzadoTotal - cruzado) / 2 : 0);
    colocar(hijo, horizontal ? { x: cursor, y: origen, width: principal, height: cruzado } : { x: origen, y: cursor, width: cruzado, height: principal }, salida);
    cursor += principal + caja.gap;
  }
}

/** Tamano natural de la disposicion: lo que ocupa si nadie la estira. Vacia: 0 x 0. */
export function medirDisposicion(arbol: CajaDeSlots, medida: MedidaDeSlot): Tamano {
  return medir(arbol, medida)?.tam ?? { width: 0, height: 0 };
}

/**
 * Rectangulo de cada Slot con contenido, en una caja de `ancho` (y de alto
 * natural). Los Slots que `medida` no reserva no aparecen en el resultado.
 */
export function colocarDisposicion(arbol: CajaDeSlots, medida: MedidaDeSlot, ancho: number): { slots: Partial<Record<NombreDeSlot, Rect>>; alto: number } {
  const medido = medir(arbol, medida);
  const slots: Partial<Record<NombreDeSlot, Rect>> = {};
  if (medido === undefined) return { slots, alto: 0 };
  colocar(medido, { x: 0, y: 0, width: ancho, height: medido.tam.height }, slots);
  return { slots, alto: medido.tam.height };
}

/** Lo que un Nodo aporta a la colocacion: su titulo, sus Atributos visibles y si tiene icono. */
export interface ContenidoDeNodo {
  titulo: string;
  atributos: readonly Atributo[];
  icono: boolean;
  /** Tipo de nodo (Slot `badge`). */
  tipo?: string;
  /** Descripcion del Nodo (Slot `desc`); vacia: el Slot no reserva espacio. */
  descripcion?: string;
  /** Primera fuente del Nodo (Slot `footer`). */
  fuente?: string;
  /** Hijos que esconde un Grupo colapsado (Slot `counter`); solo existe en el colapsado. */
  cuenta?: number;
}

export interface ColocacionDeNodo {
  /** Tamano de la caja del Nodo. */
  width: number;
  height: number;
  /** Rectangulo de cada Slot mostrado (relativo a la caja). */
  slots: Partial<Record<NombreDeSlot, Rect>>;
  /** Rectangulo de cada fila de Atributo, en orden (vacio sin `attrs`). */
  filas: Rect[];
}

type SlotDeTexto = 'title' | 'badge' | 'desc' | 'footer' | 'counter';

/** Holgura de la caja del contador alrededor de su texto (padding mas borde). */
const HOLGURA_DE_CHIP = { x: 14, y: 2 };

/** Em que ocupa el punto del titulo (diametro mas separacion): `render` lo pinta con la misma cuenta. */
export const PUNTO_DE_TITULO_EM = 1;

/**
 * Texto de un Slot de una sola linea: que se escribe, con que familia y tamano, y cuanto
 * mide su caja. Una sola regla para la colocacion (`medidasDeNodo`) y para lo que `layout` mide
 * (`textosDeNodo`). `undefined`: el Nodo no tiene ese contenido y el Slot no reserva espacio.
 */
export function textoDeSlot(slot: SlotDeTexto, metricas: Metricas, contenido: ContenidoDeNodo): (TextoAMedir & { alto: number; holgura: number }) | undefined {
  const crudo = { title: contenido.titulo, badge: contenido.tipo, desc: contenido.descripcion, footer: contenido.fuente, counter: contenido.cuenta?.toString() }[slot];
  if (crudo === undefined || (crudo === '' && slot !== 'title')) return undefined;
  // El estilo `text` del titulo cambia lo que se mide: mayusculas, separacion entre letras, punto y relleno del chip.
  const estilo = slot === 'title' ? metricas.titulo : undefined;
  const texto = estilo?.mayusculas === true ? crudo.toUpperCase() : crudo;
  const definicion: DefinicionDeSlot = DEFINICION_DE_SLOT[slot];
  const { size, leading, mono, peso } = metricas.medidaDeTexto[slot] ?? {};
  const tamano = metricas.fontSize * (size ?? definicion.escala ?? 1);
  const interlineado = leading ?? definicion.interlineado;
  const chip = slot === 'counter';
  return {
    familia: metricas.fuentes[mono === true ? 'mono' : 'body']!,
    tamano,
    texto,
    ...(peso !== undefined && { peso }),
    alto: (interlineado === undefined ? metricas.cabecera : Math.ceil(tamano * interlineado)) + (chip ? HOLGURA_DE_CHIP.y : 0),
    holgura: chip ? HOLGURA_DE_CHIP.x : estilo === undefined ? 0 : estilo.tracking * tamano * texto.length + (estilo.punto ? PUNTO_DE_TITULO_EM * tamano : 0) + 2 * (estilo.relleno + estilo.borde),
  };
}

const SLOTS_DE_TEXTO: readonly SlotDeTexto[] = ['title', 'badge', 'desc', 'footer', 'counter'];

/** Tabla de medidas de los Slots de un Nodo (ver `DEFINICION_DE_SLOT`): una entrada por Slot del catalogo. */
function medidasDeNodo(metricas: Metricas, contenido: ContenidoDeNodo): MedidaDeSlot {
  const { fontSize, escalaAtributo, fuentes } = metricas;
  const delTexto = (slot: SlotDeTexto) => (): Tamano | undefined => {
    const t = textoDeSlot(slot, metricas, contenido);
    return t === undefined ? undefined : { width: anchoDeTexto(metricas, t.familia, t.tamano, t.texto, t.peso) + t.holgura, height: t.alto, ...(slot === 'title' && { elastico: !metricas.titulo.caja }) };
  };
  const medidas: Record<NombreDeSlot, () => Tamano | undefined> = {
    icon: () => (contenido.icono ? { width: metricas.iconoLado, height: metricas.iconoLado } : undefined),
    title: delTexto('title'),
    badge: delTexto('badge'),
    desc: delTexto('desc'),
    footer: delTexto('footer'),
    counter: delTexto('counter'),
    attrs: () =>
      contenido.atributos.length === 0
        ? undefined
        : {
            width: Math.max(...contenido.atributos.map((a) => anchoDeTexto(metricas, fuentes['mono']!, fontSize * escalaAtributo, textoDeAtributo(a)))),
            height: contenido.atributos.length * metricas.fila,
          },
  };
  return (slot) => medidas[slot]();
}

/** Los textos que `layout` debe medir para este Nodo: los mismos que `medidasDeNodo` mide, solo de los Slots que el Tema muestra. */
export function textosDeNodo(metricas: Metricas, contenido: ContenidoDeNodo): TextoAMedir[] {
  const delTexto = SLOTS_DE_TEXTO.filter((slot) => muestra(metricas, slot)).flatMap((slot) => textoDeSlot(slot, metricas, contenido) ?? []);
  const atributos = contenido.atributos.map((a) => ({ familia: metricas.fuentes['mono']!, tamano: metricas.fontSize * metricas.escalaAtributo, texto: textoDeAtributo(a) }));
  return [...delTexto.map(({ familia, tamano, texto, peso }) => ({ familia, tamano, texto, ...(peso !== undefined && { peso }) })), ...atributos];
}

/**
 * Colocacion de un Nodo hoja (o Grupo colapsado) con `atributos` ya filtrados
 * por `atributosVisibles`. El ancho sale del contenido natural de los Slots mas
 * el margen del Tema; el alto, de la disposicion.
 */
export function colocarNodo(contenido: ContenidoDeNodo, metricas: Metricas): ColocacionDeNodo {
  // La raiz se mide con la caja minima y la holgura de las Metricas (las suyas o las del nucleo).
  const raiz = { ...metricas.disposicion, holgura: metricas.paddingHorizontal };
  const natural = medirDisposicion(raiz, medidasDeNodo(metricas, contenido));
  const ancho = Math.max(metricas.anchoMinimo, Math.ceil(natural.width));
  // Forma que pide un cuadrado (circulo): el lado contiene el contenido en ambos ejes.
  return colocarEnCaja(metricas, contenido, metricas.cajaCuadrada ? Math.max(ancho, natural.height) : ancho);
}

/** Colocacion dentro de una caja de ancho conocido (la que entrega la Geometria); `render` la usa para pintar. */
export function colocarEnCaja(metricas: Metricas, contenido: ContenidoDeNodo, ancho: number): ColocacionDeNodo {
  const { slots: crudos, alto: altoNatural } = colocarDisposicion(metricas.disposicion, medidasDeNodo(metricas, contenido), ancho);
  // En una caja cuadrada el contenido se centra en vertical; el resto de formas se ajusta al contenido.
  const alto = metricas.cajaCuadrada ? Math.max(altoNatural, ancho) : altoNatural;
  const desplazamiento = (alto - altoNatural) / 2;
  const slots = Object.fromEntries(Object.entries(crudos).map(([nombre, r]) => [nombre, { ...r, y: r.y + desplazamiento }])) as ColocacionDeNodo['slots'];
  const zona = slots.attrs;
  return {
    width: ancho,
    height: alto,
    slots,
    filas:
      zona === undefined
        ? []
        : Array.from({ length: contenido.atributos.length }, (_, i) => ({ x: zona.x, y: zona.y + i * metricas.fila, width: zona.width, height: metricas.fila })),
  };
}

/**
 * Alto de la cabecera de un Grupo abierto (`metricas` es la entrada `grupoAbierto`): la disposicion
 * a su alto natural, reservando el icono si el Tema lo lista (no depende del texto ni del Grupo).
 */
export function alturaDeCabecera(metricas: Metricas): number {
  const icono = slotsDe(metricas.disposicion).includes('icon');
  return medirDisposicion(metricas.disposicion, medidasDeNodo(metricas, { titulo: '', atributos: [], icono })).height;
}
