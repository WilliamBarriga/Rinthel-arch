/**
 * Estilo resuelto de un Tema: Metricas (caja y Slots, lo que mide `layout`) y
 * pintura (Capas con el color ya convertido de nombre de Paleta a valor). Son
 * dos mitades separadas a proposito: cambiar solo la pintura no relayoutea.
 * Pura y determinista: mismo Tema, mismo resultado.
 */
import type { Tema } from 'canonico';

import type { Animacion, Efecto, Transicion } from './animacion';
import { metricasDe } from './metricas';
import type { Metricas } from './metricas';
import { CATALOGO } from './catalogo';
import type { DefinicionDePrimitiva, NombreDePrimitiva } from './catalogo';
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
  animacion?: Animacion;
}

/** Pila de un Nodo por estado: `capas` es el reposo; cada estado declarado trae su pila completa. */
export interface PinturaDeNodo {
  capas: CapaPintada[];
  estados: Partial<Record<Estado, CapaPintada[]>>;
  /** Animacion del elemento (no de una Capa); ausente si el Tema no declara ninguna. */
  animacion?: AnimacionDeNodo;
}

/**
 * `transition` base, por estado, `enter`/`exit` y `stagger` del Nodo. Solo
 * pintura: ninguno de estos valores entra en las Metricas.
 */
export interface AnimacionDeNodo {
  transicion?: Transicion;
  transicionesDeEstado?: Partial<Record<Estado, Transicion>>;
  entrada?: Efecto;
  salida?: Efecto;
  escalonadoMs?: number;
}

export interface Pintura {
  /** `seed N` del Tema (token `seed`); sin el, la semilla de cada Capa sale solo del id y del nombre. */
  semilla?: number;
  /** Reposo y estados del Nodo sin Tipo, y los de cada Tipo de nodo pedido en `OpcionesDeEstilo.tipos`. */
  nodo: PinturaDeNodo & { tipos: Record<string, PinturaDeNodo> };
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

function pintar(pila: readonly CapaDeTema[], tema: TemaResuelto, colorDelTipo: string | undefined): CapaPintada[] {
  const paleta = { ...tema.palette, [COLOR_DE_RESPALDO]: tema.tokens.border };
  const contexto = { color: colorDelTipo !== undefined && Object.hasOwn(tema.palette, colorDelTipo) ? colorDelTipo : COLOR_DE_RESPALDO };
  return pila.map(({ nombre, primitiva, encima, animacion }) => {
    const definicion: DefinicionDePrimitiva = CATALOGO[primitiva.tipo as NombreDePrimitiva];
    const props = Object.fromEntries(
      Object.entries(primitiva.props).map(([clave, valor]) => [
        clave,
        definicion.propiedades[clave]?.tipo === 'color' ? resolverColor(String(valor), paleta, contexto) : valor,
      ]),
    );
    return { nombre, tipo: primitiva.tipo as NombreDePrimitiva, props, ...(encima === true && { encima: true as const }), ...(animacion !== undefined && { animacion }) };
  });
}

export function estiloResuelto(tema: Tema, opciones: OpcionesDeEstilo = {}): EstiloResuelto {
  const resuelto = resolverTema(tema);
  const pinturaDe = (tipo: string | undefined, color: string | undefined): PinturaDeNodo => ({
    capas: pintar(cascada(resuelto, { ...(tipo !== undefined && { tipo }), ...(opciones.vista && { vista: opciones.vista }) }), resuelto, color),
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
      ...(resuelto.tokens.seed !== undefined && { semilla: Number(resuelto.tokens.seed) }),
      nodo: {
        ...pinturaDe(undefined, undefined),
        ...(resuelto.nodo.animacion !== undefined && { animacion: resuelto.nodo.animacion }),
        tipos: Object.fromEntries(Object.entries(opciones.tipos ?? {}).map(([tipo, color]) => [tipo, pinturaDe(tipo, color)])),
      },
    },
  };
}
