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
import type { DefinicionDePrimitiva, NombreDePrimitiva } from './catalogo';
import { resolverTema } from './tema';

/** Capa con los colores ya resueltos contra la Paleta del Tema. */
export interface CapaPintada {
  nombre: string;
  tipo: NombreDePrimitiva;
  props: Record<string, number | string>;
}

export interface Pintura {
  nodo: { capas: CapaPintada[] };
}

export interface EstiloResuelto {
  metricas: Metricas;
  pintura: Pintura;
}

export function estiloResuelto(tema: Tema): EstiloResuelto {
  const resuelto = resolverTema(tema);
  return {
    metricas: metricasDe(tema),
    pintura: {
      nodo: {
        capas: resuelto.nodo.capas.map(({ nombre, primitiva }) => {
          const definicion: DefinicionDePrimitiva = CATALOGO[primitiva.tipo as NombreDePrimitiva];
          const props = Object.fromEntries(
            Object.entries(primitiva.props).map(([clave, valor]) => [
              clave,
              definicion.propiedades[clave]?.tipo === 'color' ? (resuelto.palette[String(valor)] ?? String(valor)) : valor,
            ]),
          );
          return { nombre, tipo: primitiva.tipo as NombreDePrimitiva, props };
        }),
      },
    },
  };
}
