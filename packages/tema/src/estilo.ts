/**
 * Estilo resuelto de un Tema: Metricas (caja y Slots, lo que mide `layout`) y
 * pintura (Capas con el color ya convertido de nombre de Paleta a valor). Son
 * dos mitades separadas a proposito: cambiar solo la pintura no relayoutea.
 * Pura y determinista: mismo Tema, mismo resultado.
 */
import type { Tema } from 'canonico';

import { metricasDe } from './metricas';
import type { Metricas } from './metricas';
import { CATALOGO } from './catalogo';
import type { DefinicionDePrimitiva, NombreDePrimitiva, NombreDeSlot } from './catalogo';
import { resolverColor } from './color';
import { aplicarOps } from './parches';
import type { CapaDeTema, Estado, OpDeCapa } from './parches';
import { resolverTema } from './tema';
import type { TemaResuelto } from './tema';

/** Capa con los colores ya resueltos contra la Paleta del Tema. */
export interface CapaPintada {
  nombre: string;
  tipo: NombreDePrimitiva;
  props: Record<string, number | string>;
  /** Va sobre el contenido (`over`); sin la clave, bajo el. */
  encima?: true;
}

/** Primitiva de marcador o etiqueta con sus colores ya resueltos. */
export interface PrimitivaPintada {
  tipo: NombreDePrimitiva;
  props: Record<string, number | string>;
}

/** Pintura de una Arista: trazos (de abajo hacia arriba), marcadores y etiqueta. El color del marcador sin `color` es el del primer trazo. */
export interface PinturaDeArista {
  capas: CapaPintada[];
  origen?: PrimitivaPintada;
  fin?: PrimitivaPintada;
  etiqueta: PrimitivaPintada;
}

/** Pila de un Nodo por estado: `capas` es el reposo; cada estado declarado trae su pila completa. */
export interface PinturaDeNodo {
  capas: CapaPintada[];
  /** Estilo de texto de los Slots que lo declaran. */
  textos: Partial<Record<NombreDeSlot, PrimitivaPintada>>;
  estados: Partial<Record<Estado, CapaPintada[]>>;
}

export interface Pintura {
  /** Reposo y estados del Nodo sin Tipo, y los de cada Tipo de nodo pedido en `OpcionesDeEstilo.tipos`. */
  nodo: PinturaDeNodo & { tipos: Record<string, PinturaDeNodo> };
  /** Reposo de la Arista y, por color de Paleta del Nodo de origen, la suya (`ORIGEN` toma ese color). */
  arista: PinturaDeArista & { origenes: Record<string, PinturaDeArista> };
}

export interface EstiloResuelto {
  metricas: Metricas;
  pintura: Pintura;
}

export interface OpcionesDeEstilo {
  /** Tipos de nodo de la Fuente y el nombre de Paleta de su `color` (`COLOR` lo usa). */
  tipos?: Readonly<Record<string, string | undefined>>;
  /** Cuarto nivel de la cascada: parches de la Vista, aplicados al final de cada pila. */
  vista?: readonly OpDeCapa[];
}

const COLOR_DE_RESPALDO = '__borde';

/**
 * Pila de Capas tras la cascada: Tema base, Tipo de nodo, estado, override de la
 * Vista; el ultimo gana. Un parche que no encuentra su Capa en esta pila (p. ej.
 * una Capa que solo anade otro Tipo) no aplica a ella: `validate` ya lo acepto
 * por existir en alguna.
 */
export function cascada(tema: TemaResuelto, nivel: { tipo?: string; estado?: Estado; vista?: readonly OpDeCapa[] } = {}): CapaDeTema[] {
  const aplicar = (pila: CapaDeTema[], ops: readonly OpDeCapa[] | undefined): CapaDeTema[] =>
    ops === undefined || ops.length === 0 ? pila : aplicarOps(pila, ops, tema.palette, 'parchear').pila;
  const porTipo = aplicar(tema.nodo.capas as CapaDeTema[], nivel.tipo === undefined ? undefined : tema.nodo.tipos[nivel.tipo]);
  const porEstado = aplicar(porTipo, nivel.estado === undefined ? undefined : tema.nodo.estados[nivel.estado]);
  return aplicar(porEstado, nivel.vista);
}

const contextoDeColor = (tema: TemaResuelto, colorDelTipo: string | undefined): { paleta: Record<string, string>; contexto: { color: string; origen: string } } => {
  const nombre = colorDelTipo !== undefined && Object.hasOwn(tema.palette, colorDelTipo) ? colorDelTipo : COLOR_DE_RESPALDO;
  return { paleta: { ...tema.palette, [COLOR_DE_RESPALDO]: tema.tokens.border }, contexto: { color: nombre, origen: nombre } };
};

/** Props de una Primitiva con sus colores (nombre de Paleta y modificadores) convertidos a valor. */
function resolverProps(
  primitiva: { tipo: string; props: Readonly<Record<string, number | string>> },
  paleta: Readonly<Record<string, string>>,
  contexto: { color: string; origen: string },
): Record<string, number | string> {
  const definicion: DefinicionDePrimitiva = CATALOGO[primitiva.tipo as NombreDePrimitiva];
  return Object.fromEntries(
    Object.entries(primitiva.props).map(([clave, valor]) => [
      clave,
      definicion.propiedades[clave]?.tipo === 'color' ? resolverColor(String(valor), paleta, contexto) : valor,
    ]),
  );
}

function pintar(pila: readonly CapaDeTema[], tema: TemaResuelto, colorDelTipo: string | undefined): CapaPintada[] {
  const { paleta, contexto } = contextoDeColor(tema, colorDelTipo);
  return pila.map(({ nombre, primitiva, encima }) => ({
    nombre,
    tipo: primitiva.tipo as NombreDePrimitiva,
    props: resolverProps(primitiva, paleta, contexto),
    ...(encima === true && { encima: true as const }),
  }));
}

/** Trazo por defecto de una Arista sin pila: una linea del color del borde. */
const TRAZO_POR_DEFECTO: CapaDeTema = { nombre: 'linea', primitiva: { tipo: 'line', props: { color: COLOR_DE_RESPALDO, width: 1, style: 'solid', corner: 'sharp', cut: 6 } } };

/** Pintura de una Arista cuyo Nodo de origen tiene el color `colorDeOrigen` (nombre de Paleta). */
function pintarArista(tema: TemaResuelto, colorDeOrigen: string | undefined): PinturaDeArista {
  const { arista } = tema;
  const { paleta, contexto } = contextoDeColor(tema, colorDeOrigen);
  const capas = pintar(arista.capas.length === 0 ? [TRAZO_POR_DEFECTO] : (arista.capas as CapaDeTema[]), tema, colorDeOrigen);
  const colorDelTrazo = capas[0]?.props['color'];
  const marcador = (primitiva: { tipo: string; props: Record<string, number | string> } | undefined): PrimitivaPintada | undefined => {
    if (primitiva === undefined) return undefined;
    const props = resolverProps(primitiva, paleta, contexto);
    if (props['color'] === undefined && colorDelTrazo !== undefined) props['color'] = colorDelTrazo;
    return { tipo: primitiva.tipo as NombreDePrimitiva, props };
  };
  const etiqueta = arista.etiqueta ?? { tipo: 'label', props: { scale: 0.85, pad: 4, radius: 0 } };
  const origen = marcador(arista.origen);
  const fin = marcador(arista.fin);
  return {
    capas,
    ...(origen !== undefined && { origen }),
    ...(fin !== undefined && { fin }),
    etiqueta: { tipo: etiqueta.tipo as NombreDePrimitiva, props: resolverProps(etiqueta, paleta, contexto) },
  };
}

export function estiloResuelto(tema: Tema, opciones: OpcionesDeEstilo = {}): EstiloResuelto {
  const resuelto = resolverTema(tema);
  const pinturaDe = (tipo: string | undefined, color: string | undefined): PinturaDeNodo => ({
    capas: pintar(cascada(resuelto, { ...(tipo !== undefined && { tipo }), ...(opciones.vista && { vista: opciones.vista }) }), resuelto, color),
    textos: Object.fromEntries(
      Object.entries(resuelto.nodo.textos).map(([slot, texto]) => {
        const { paleta, contexto } = contextoDeColor(resuelto, color);
        return [slot, { tipo: texto.tipo as NombreDePrimitiva, props: resolverProps(texto, paleta, contexto) }];
      }),
    ),
    estados: Object.fromEntries(
      (Object.keys(resuelto.nodo.estados) as Estado[])
        .sort()
        .map((estado) => [
          estado,
          pintar(cascada(resuelto, { ...(tipo !== undefined && { tipo }), estado, ...(opciones.vista && { vista: opciones.vista }) }), resuelto, color),
        ]),
    ),
  });
  return {
    metricas: metricasDe(tema),
    pintura: {
      nodo: {
        ...pinturaDe(undefined, undefined),
        tipos: Object.fromEntries(Object.entries(opciones.tipos ?? {}).map(([tipo, color]) => [tipo, pinturaDe(tipo, color)])),
      },
      arista: {
        ...pintarArista(resuelto, undefined),
        origenes: Object.fromEntries(Object.keys(resuelto.palette).sort().map((color) => [color, pintarArista(resuelto, color)])),
      },
    },
  };
}
