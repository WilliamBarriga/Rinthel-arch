/**
 * Elementos de Tema de la secuencia (ADR 0009): `lifeline`, `activation`, `message`, `fragment` y `note`. Cada uno es
 * un bloque con una pila de Capas, parches (`kind` en `message`, `op` en `fragment`), estilo de texto y, solo en
 * algunos, Metricas propias (las separaciones de secuencia). Esta tabla es la unica fuente de lo que cada bloque
 * admite: `dsl` la usa para compilar, `tema` para validar y la referencia del catalogo para documentar.
 */
import { OPERADORES_DE_FRAGMENTO, TIPOS_DE_MENSAJE } from 'canonico';

import type { NombreDePrimitiva, UbicacionDePrimitiva } from './catalogo';

export const BLOQUES_DE_SECUENCIA = ['lifeline', 'activation', 'message', 'fragment', 'note'] as const;
export type BloqueDeSecuencia = (typeof BLOQUES_DE_SECUENCIA)[number];

/** Una Metrica del bloque: nombre en el DSL, rango y defecto del nucleo (px). */
export interface MetricaDeBloque {
  min: number;
  max: number;
  defecto: number;
}

export interface EspecificacionDeBloque {
  /** Ubicacion de sus Capas: trazos de Arista (`lifeline`, `message`) o Capas de Nodo. */
  capas: Extract<UbicacionDePrimitiva, 'capa-arista' | 'capa-nodo'>;
  /** Marcadores de extremo que admite (`start`, `end`). */
  marcadores: readonly ('start' | 'end')[];
  /** Estilo de texto o trazo suelto (`operator`, `guard`...) y la Primitiva y ubicacion con que se estiliza. */
  textos: Readonly<Record<string, { primitiva: NombreDePrimitiva; ubicacion: UbicacionDePrimitiva }>>;
  /** Parches por variante: la palabra del DSL (`kind`, `op`) y las variantes validas. */
  parches?: { palabra: 'kind' | 'op'; nombres: readonly string[] };
  /** Metricas propias, por nombre del DSL. */
  metricas: Readonly<Record<string, MetricaDeBloque>>;
}

export const ESPECIFICACION_DE_SECUENCIA: Readonly<Record<BloqueDeSecuencia, EspecificacionDeBloque>> = {
  lifeline: { capas: 'capa-arista', marcadores: ['end'], textos: {}, metricas: { gap: { min: 40, max: 600, defecto: 160 } } },
  activation: { capas: 'capa-nodo', marcadores: [], textos: {}, metricas: { width: { min: 4, max: 40, defecto: 10 } } },
  message: {
    capas: 'capa-arista',
    marcadores: ['start', 'end'],
    textos: { label: { primitiva: 'label', ubicacion: 'etiqueta' } },
    parches: { palabra: 'kind', nombres: TIPOS_DE_MENSAJE },
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
    parches: { palabra: 'op', nombres: [...OPERADORES_DE_FRAGMENTO, 'ref'] },
    metricas: { padding: { min: 0, max: 64, defecto: 16 }, 'padding-y': { min: 2, max: 40, defecto: 10 } },
  },
  note: { capas: 'capa-nodo', marcadores: [], textos: { text: { primitiva: 'text', ubicacion: 'texto-slot' } }, metricas: {} },
};

/** Separaciones de secuencia que `layout` lee de las Metricas: el Tema las ajusta en los bloques; sin ajuste, los defectos del nucleo. */
export interface MetricasDeSecuencia {
  huecoEntreLifelines: number;
  huecoEntreMensajes: number;
  anchoDeLazo: number;
  desplazamientoDeCreate: number;
  anchoDeActivacion: number;
  rellenoDeFragmento: number;
  rellenoVerticalDeFragmento: number;
}

/** Metricas de secuencia de un Tema: los valores de `bloques` (nombres del DSL) sobre los defectos. */
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
