/**
 * Estilo resuelto de un Tema: Metricas (caja y Slots, lo que mide `layout`) y
 * pintura (Capas con el color ya convertido de nombre de Paleta a valor). Son
 * dos mitades separadas a proposito: cambiar solo la pintura no relayoutea.
 * Pura y determinista: mismo Tema, mismo resultado.
 */
import type { Tema } from 'canonico';

import { metricasDe, tablaDeMetricas } from './metricas';
import type { Metricas, TablaDeMetricas } from './metricas';
import { CATALOGO } from './catalogo';
import type { DefinicionDePrimitiva, NombreDePrimitiva } from './catalogo';
import { resolverColor } from './color';
import { cascada } from './parches';
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

/** Pila de un Nodo por estado: `capas` es el reposo; cada estado declarado trae su pila completa. */
export interface PinturaDeNodo {
  capas: CapaPintada[];
  estados: Partial<Record<Estado, CapaPintada[]>>;
}

export interface Pintura {
  /** Reposo y estados del Nodo sin Tipo, y los de cada Tipo de nodo pedido en `OpcionesDeEstilo.tipos`. */
  nodo: PinturaDeNodo & { tipos: Record<string, PinturaDeNodo> };
}

export interface EstiloResuelto {
  /** Entrada base de la tabla (Nodo sin Tipo): lo que mide un Nodo que el Tema no menciona. */
  metricas: Metricas;
  /** Metricas por elemento (ADR 0008): Nodo por Tipo, Grupo abierto y colapsado, etiqueta de Arista. */
  tabla: TablaDeMetricas;
  pintura: Pintura;
}

export interface OpcionesDeEstilo {
  /** Tipos de nodo de la Fuente y el nombre de Paleta de su `color` (`COLOR` lo usa). */
  tipos?: Readonly<Record<string, string | undefined>>;
  /** Cuarto nivel de la cascada: parches de la Vista, aplicados al final de cada pila. */
  vista?: readonly OpDeCapa[];
}

const COLOR_DE_RESPALDO = '__borde';

function pintar(pila: readonly CapaDeTema[], tema: TemaResuelto, colorDelTipo: string | undefined): CapaPintada[] {
  const paleta = { ...tema.palette, [COLOR_DE_RESPALDO]: tema.tokens.border };
  const contexto = { color: colorDelTipo !== undefined && Object.hasOwn(tema.palette, colorDelTipo) ? colorDelTipo : COLOR_DE_RESPALDO };
  return pila.map(({ nombre, primitiva, encima }) => {
    const definicion: DefinicionDePrimitiva = CATALOGO[primitiva.tipo as NombreDePrimitiva];
    const props = Object.fromEntries(
      Object.entries(primitiva.props).map(([clave, valor]) => [
        clave,
        definicion.propiedades[clave]?.tipo === 'color' ? resolverColor(String(valor), paleta, contexto) : valor,
      ]),
    );
    return { nombre, tipo: primitiva.tipo as NombreDePrimitiva, props, ...(encima === true && { encima: true as const }) };
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
    tabla: tablaDeMetricas(tema),
    pintura: {
      nodo: {
        ...pinturaDe(undefined, undefined),
        tipos: Object.fromEntries(Object.entries(opciones.tipos ?? {}).map(([tipo, color]) => [tipo, pinturaDe(tipo, color)])),
      },
    },
  };
}
