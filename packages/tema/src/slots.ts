/**
 * Colocacion de Slots: unico sitio que decide posiciones (lo usan `layout` y `render`). Rectangulos relativos a la
 * esquina superior izquierda de la caja del Nodo. Una caja reserva `pad` por lado y `gap` entre hijos presentes
 * (nada si no tiene ninguno). En `column` cada hijo ocupa su alto natural y, sin `align`, todo el ancho; en `row`
 * los elasticos se reparten el ancho libre y, sin `align`, se centran en vertical. Con `align` un hijo toma su
 * tamano natural.
 */

import { DEFINICION_DE_SLOT, SLOTS_DE_TEXTO } from './catalogo';
import type { DefinicionDeSlot, NombreDeSlot, NombreDeSlotDeTexto } from './catalogo';
import { esCaja, slotsDe } from './disposicion';
import type { Alineacion, CajaDeSlots, ElementoDeSlots } from './disposicion';
import { anchoDeTexto } from './medicion';
import type { TextoAMedir } from './medicion';
import { anchoDeChips, muestra, piezasDeAtributo } from './contenido';
import type { ContenidoDeNodo } from './contenido';
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

/** `undefined`: el Slot no reserva espacio. `elastico` sustituye al de `DEFINICION_DE_SLOT`. */
export type MedidaDeSlot = (slot: NombreDeSlot) => (Tamano & { elastico?: boolean }) | undefined;

interface Medido {
  tam: Tamano;
  elastico: boolean;
  align?: Alineacion | undefined;
  slot?: NombreDeSlot;
  caja?: CajaDeSlots;
  hijos: Medido[];
}

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
  const elasticos = horizontal ? nodo.hijos.filter((h) => h.elastico).length : 0;
  const parte = elasticos === 0 ? 0 : Math.max(0, principalLibre - fijo) / elasticos;
  let cursor = horizontal ? dentro.x : dentro.y;
  for (const hijo of nodo.hijos) {
    const principal = horizontal ? (hijo.elastico ? parte : hijo.tam.width) : hijo.tam.height;
    const cruzadoTotal = horizontal ? dentro.height : dentro.width;
    const natural = horizontal ? hijo.tam.height : hijo.tam.width;
    const alineacion = hijo.align ?? (horizontal ? 'center' : undefined);
    const cruzado = alineacion === undefined ? cruzadoTotal : Math.min(natural, cruzadoTotal);
    const origen = (horizontal ? dentro.y : dentro.x) + (alineacion === 'end' ? cruzadoTotal - cruzado : alineacion === 'center' ? (cruzadoTotal - cruzado) / 2 : 0);
    colocar(hijo, horizontal ? { x: cursor, y: origen, width: principal, height: cruzado } : { x: origen, y: cursor, width: cruzado, height: principal }, salida);
    cursor += principal + caja.gap;
  }
}

/** Tamano sin estirar; vacia, 0 x 0. */
export function medirDisposicion(arbol: CajaDeSlots, medida: MedidaDeSlot): Tamano {
  return medir(arbol, medida)?.tam ?? { width: 0, height: 0 };
}

/** No conoce ningun Slot por nombre; los que `medida` no reserva no aparecen en el resultado. */
export function colocarDisposicion(arbol: CajaDeSlots, medida: MedidaDeSlot, ancho: number): { slots: Partial<Record<NombreDeSlot, Rect>>; alto: number } {
  const medido = medir(arbol, medida);
  const slots: Partial<Record<NombreDeSlot, Rect>> = {};
  if (medido === undefined) return { slots, alto: 0 };
  colocar(medido, { x: 0, y: 0, width: ancho, height: medido.tam.height }, slots);
  return { slots, alto: medido.tam.height };
}

export interface ColocacionDeNodo {
  width: number;
  height: number;
  slots: Partial<Record<NombreDeSlot, Rect>>;
  /** Vacio sin `attrs`. */
  filas: Rect[];
}

/** Padding mas borde de la caja del contador. */
const HOLGURA_DE_CHIP = { x: 14, y: 2 };

/** Diametro mas separacion del punto del titulo, en em. */
export const PUNTO_DE_TITULO_EM = 1;

/** `undefined`: el Nodo no tiene ese contenido y el Slot no reserva espacio. */
export function textoDeSlot(slot: NombreDeSlotDeTexto, metricas: Metricas, contenido: ContenidoDeNodo): (TextoAMedir & { alto: number; holgura: number }) | undefined {
  const crudo = { title: contenido.titulo, badge: contenido.tipo, desc: contenido.descripcion, footer: contenido.fuente, counter: contenido.cuenta?.toString() }[slot];
  if (crudo === undefined || (crudo === '' && slot !== 'title')) return undefined;
  const estilo = slot === 'title' ? metricas.titulo : undefined;
  const { size, leading, mono, peso, prefijo = '', borde = 0 } = metricas.medidaDeTexto[slot] ?? {};
  const texto = prefijo + (estilo?.mayusculas === true ? crudo.toUpperCase() : crudo);
  const definicion: DefinicionDeSlot = DEFINICION_DE_SLOT[slot];
  const tamano = metricas.fontSize * (size ?? definicion.escala ?? 1);
  const interlineado = leading ?? definicion.interlineado;
  const chip = slot === 'counter';
  return {
    familia: metricas.fuentes[mono === true ? 'mono' : 'body']!,
    tamano,
    texto,
    ...(peso !== undefined && { peso }),
    alto: (interlineado === undefined ? metricas.cabecera : Math.ceil(tamano * interlineado)) + (chip ? HOLGURA_DE_CHIP.y + 2 * borde : 0),
    holgura: chip ? HOLGURA_DE_CHIP.x + 2 * borde : estilo === undefined ? 0 : estilo.tracking * tamano * texto.length + (estilo.punto ? PUNTO_DE_TITULO_EM * tamano : 0) + 2 * (estilo.relleno + estilo.borde),
  };
}

function medidasDeNodo(metricas: Metricas, contenido: ContenidoDeNodo): MedidaDeSlot {
  const { fuentes } = metricas;
  const delTexto = (slot: NombreDeSlotDeTexto) => (): Tamano | undefined => {
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
            width: Math.max(...contenido.atributos.map((a) => piezasDeAtributo(a, metricas).reduce((suma, p) => suma + anchoDeTexto(metricas, fuentes['mono']!, p.tamano, p.texto), 0) + anchoDeChips(a, metricas))),
            height: contenido.atributos.length * metricas.fila,
          },
  };
  return (slot) => medidas[slot]();
}

/** Los mismos que mide `medidasDeNodo`, solo de los Slots que el Tema muestra. */
export function textosDeNodo(metricas: Metricas, contenido: ContenidoDeNodo): TextoAMedir[] {
  const delTexto = SLOTS_DE_TEXTO.filter((slot) => muestra(metricas, slot)).flatMap((slot) => textoDeSlot(slot, metricas, contenido) ?? []);
  const atributos = contenido.atributos.flatMap((a) => piezasDeAtributo(a, metricas).map(({ texto, tamano }) => ({ familia: metricas.fuentes['mono']!, tamano, texto })));
  return [...delTexto.map(({ familia, tamano, texto, peso }) => ({ familia, tamano, texto, ...(peso !== undefined && { peso }) })), ...atributos];
}

/** Nodo hoja o Grupo colapsado, con `atributos` ya filtrados por `atributosVisibles`. */
export function colocarNodo(contenido: ContenidoDeNodo, metricas: Metricas): ColocacionDeNodo {
  const raiz = { ...metricas.disposicion, holgura: metricas.paddingHorizontal };
  const natural = medirDisposicion(raiz, medidasDeNodo(metricas, contenido));
  const ancho = Math.max(metricas.anchoMinimo, Math.ceil(natural.width));
  return colocarEnCaja(metricas, contenido, metricas.cajaCuadrada ? Math.max(ancho, natural.height) : ancho);
}

/** Dentro de una caja de ancho conocido (la de la Geometria). */
export function colocarEnCaja(metricas: Metricas, contenido: ContenidoDeNodo, ancho: number): ColocacionDeNodo {
  const { slots: crudos, alto: altoNatural } = colocarDisposicion(metricas.disposicion, medidasDeNodo(metricas, contenido), ancho);
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

/** `metricas` es la entrada `grupoAbierto`; no depende del texto ni del Grupo. */
export function alturaDeCabecera(metricas: Metricas): number {
  const icono = slotsDe(metricas.disposicion).includes('icon');
  return medirDisposicion(metricas.disposicion, medidasDeNodo(metricas, { titulo: '', atributos: [], icono })).height;
}
