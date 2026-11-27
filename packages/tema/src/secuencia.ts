/** Elementos de Tema de la secuencia: tabla unica de lo que admite cada bloque (la usan `dsl`, la validacion y la referencia). */
import { FRAGMENT_OPERATORS, MESSAGE_KINDS } from 'canonical';

import type { NombreDePrimitiva, UbicacionDePrimitiva } from './catalogo';

export const BLOQUES_DE_SECUENCIA = ['lifeline', 'activation', 'message', 'fragment', 'note'] as const;
export type BloqueDeSecuencia = (typeof BLOQUES_DE_SECUENCIA)[number];

/** Rango y defecto del nucleo, en px. */
export interface MetricaDeBloque {
  min: number;
  max: number;
  defecto: number;
}

export interface EspecificacionDeBloque {
  capas: Extract<UbicacionDePrimitiva, 'capa-arista' | 'capa-nodo'>;
  marcadores: readonly ('start' | 'end')[];
  /** Estilos de texto o trazo sueltos (`operator`, `guard`...) por nombre del DSL. */
  textos: Readonly<Record<string, { primitiva: NombreDePrimitiva; ubicacion: UbicacionDePrimitiva }>>;
  parches?: { palabra: 'kind' | 'op'; nombres: readonly string[] };
  /** Por nombre del DSL. */
  metricas: Readonly<Record<string, MetricaDeBloque>>;
}

export const ESPECIFICACION_DE_SECUENCIA: Readonly<Record<BloqueDeSecuencia, EspecificacionDeBloque>> = {
  lifeline: { capas: 'capa-arista', marcadores: ['end'], textos: {}, metricas: { gap: { min: 40, max: 600, defecto: 160 } } },
  activation: { capas: 'capa-nodo', marcadores: [], textos: {}, metricas: { width: { min: 4, max: 40, defecto: 10 } } },
  message: {
    capas: 'capa-arista',
    marcadores: ['start', 'end'],
    textos: { label: { primitiva: 'label', ubicacion: 'etiqueta' } },
    parches: { palabra: 'kind', nombres: MESSAGE_KINDS },
    metricas: {
      gap: { min: 12, max: 120, defecto: 32 },
      'loop-width': { min: 12, max: 120, defecto: 36 },
      'create-offset': { min: -40, max: 40, defecto: 0 },
    },
  },
  fragment: {
    capas: 'capa-nodo',
    marcadores: [],
    textos: {
      operator: { primitiva: 'label', ubicacion: 'etiqueta' },
      guard: { primitiva: 'text', ubicacion: 'texto-slot' },
      divider: { primitiva: 'line', ubicacion: 'capa-arista' },
    },
    parches: { palabra: 'op', nombres: [...FRAGMENT_OPERATORS, 'ref'] },
    metricas: { padding: { min: 0, max: 64, defecto: 16 }, 'padding-y': { min: 2, max: 40, defecto: 10 } },
  },
  note: { capas: 'capa-nodo', marcadores: [], textos: { text: { primitiva: 'text', ubicacion: 'texto-slot' } }, metricas: {} },
};

/** Separaciones de secuencia en px; sin ajuste del Tema, los defectos del nucleo. */
export interface MetricasDeSecuencia {
  huecoEntreLifelines: number;
  huecoEntreMensajes: number;
  anchoDeLazo: number;
  desplazamientoDeCreate: number;
  anchoDeActivacion: number;
  rellenoDeFragmento: number;
  rellenoVerticalDeFragmento: number;
}

export function metricasDeSecuencia(bloques: Partial<Record<BloqueDeSecuencia, { metricas: Readonly<Record<string, number>> } | undefined>> | undefined): MetricasDeSecuencia {
  const valor = (bloque: BloqueDeSecuencia, nombre: string): number => bloques?.[bloque]?.metricas[nombre] ?? ESPECIFICACION_DE_SECUENCIA[bloque].metricas[nombre]!.defecto;
  return {
    huecoEntreLifelines: valor('lifeline', 'gap'),
    huecoEntreMensajes: valor('message', 'gap'),
    anchoDeLazo: valor('message', 'loop-width'),
    desplazamientoDeCreate: valor('message', 'create-offset'),
    anchoDeActivacion: valor('activation', 'width'),
    rellenoDeFragmento: valor('fragment', 'padding'),
    rellenoVerticalDeFragmento: valor('fragment', 'padding-y'),
  };
}
