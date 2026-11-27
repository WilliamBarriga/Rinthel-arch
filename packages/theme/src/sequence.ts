/** Sequence Theme elements: single table of what each block accepts (used by `dsl`, validation and the reference). */
import { FRAGMENT_OPERATORS, MESSAGE_KINDS } from 'canonical';

import type { PrimitiveName, PrimitivePlacement } from './catalog';

export const SEQUENCE_BLOCKS = ['lifeline', 'activation', 'message', 'fragment', 'note'] as const;
export type SequenceBlock = (typeof SEQUENCE_BLOCKS)[number];

/** Core range and default, in px. */
export interface BlockMetric {
  min: number;
  max: number;
  defecto: number;
}

export interface BlockSpec {
  capas: Extract<PrimitivePlacement, 'capa-arista' | 'capa-nodo'>;
  marcadores: readonly ('start' | 'end')[];
  /** Standalone text or stroke styles (`operator`, `guard`...) by DSL name. */
  textos: Readonly<Record<string, { primitiva: PrimitiveName; placement: PrimitivePlacement }>>;
  parches?: { palabra: 'kind' | 'op'; nombres: readonly string[] };
  /** By DSL name. */
  metricas: Readonly<Record<string, BlockMetric>>;
}

export const SEQUENCE_SPEC: Readonly<Record<SequenceBlock, BlockSpec>> = {
  lifeline: { capas: 'capa-arista', marcadores: ['end'], textos: {}, metricas: { gap: { min: 40, max: 600, defecto: 160 } } },
  activation: { capas: 'capa-nodo', marcadores: [], textos: {}, metricas: { width: { min: 4, max: 40, defecto: 10 } } },
  message: {
    capas: 'capa-arista',
    marcadores: ['start', 'end'],
    textos: { label: { primitiva: 'label', placement: 'etiqueta' } },
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
      operator: { primitiva: 'label', placement: 'etiqueta' },
      guard: { primitiva: 'text', placement: 'texto-slot' },
      divider: { primitiva: 'line', placement: 'capa-arista' },
    },
    parches: { palabra: 'op', nombres: [...FRAGMENT_OPERATORS, 'ref'] },
    metricas: { padding: { min: 0, max: 64, defecto: 16 }, 'padding-y': { min: 2, max: 40, defecto: 10 } },
  },
  note: { capas: 'capa-nodo', marcadores: [], textos: { text: { primitiva: 'text', placement: 'texto-slot' } }, metricas: {} },
};

/** Sequence spacings in px; without a Theme setting, the core defaults. */
export interface SequenceMetrics {
  huecoEntreLifelines: number;
  huecoEntreMensajes: number;
  anchoDeLazo: number;
  desplazamientoDeCreate: number;
  anchoDeActivacion: number;
  rellenoDeFragmento: number;
  rellenoVerticalDeFragmento: number;
}

export function sequenceMetrics(blocks: Partial<Record<SequenceBlock, { metricas: Readonly<Record<string, number>> } | undefined>> | undefined): SequenceMetrics {
  const value = (block: SequenceBlock, name: string): number => blocks?.[block]?.metricas[name] ?? SEQUENCE_SPEC[block].metricas[name]!.defecto;
  return {
    huecoEntreLifelines: value('lifeline', 'gap'),
    huecoEntreMensajes: value('message', 'gap'),
    anchoDeLazo: value('message', 'loop-width'),
    desplazamientoDeCreate: value('message', 'create-offset'),
    anchoDeActivacion: value('activation', 'width'),
    rellenoDeFragmento: value('fragment', 'padding'),
    rellenoVerticalDeFragmento: value('fragment', 'padding-y'),
  };
}
