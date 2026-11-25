/**
 * Tema `high-contrast`: la tarjeta de `neutral` sobre fondo negro, texto blanco y bordes gruesos del color del Tipo,
 * sin translucidos ni warnings de contraste. Va ya resuelto porque solo lo aplica el visor, en lugar del de la Vista.
 */
import { TEMA_NEUTRO } from './tema';
import type { Primitiva } from './catalogo';
import type { TemaResuelto } from './tema';

const texto = (props: Record<string, string | number>) : Primitiva => ({ tipo: 'text', props: { weight: 400, style: 'normal', transform: 'none', tracking: 0, radius: 0, pad: 0, color: 'white', ...props } });

export const TEMA_ALTO_CONTRASTE: TemaResuelto = {
  ...TEMA_NEUTRO,
  name: 'high-contrast',
  palette: {
    white: '#ffffff',
    black: '#000000',
    gray: '#d4d4d4',
    blue: '#8ab4ff',
    green: '#7ee787',
    amber: '#ffd866',
    red: '#ff8a80',
    purple: '#d2a8ff',
  },
  fonts: { body: 'sans-serif', mono: 'monospace' },
  tokens: { background: '#000000', foreground: '#ffffff', border: '#ffffff' },
  pagina: { capas: [{ nombre: 'base', primitiva: { tipo: 'solid', props: { color: 'black' } } }], fijo: false },
  nodo: {
    ...TEMA_NEUTRO.nodo,
    capas: [
      { nombre: 'shape', primitiva: { tipo: 'rect', props: { radius: 0 } } },
      { nombre: 'fill', primitiva: { tipo: 'solid', props: { color: 'black' } } },
      { nombre: 'border', primitiva: { tipo: 'border', props: { color: 'COLOR', width: 3 } } },
    ],
    slots: {
      direccion: 'column',
      gap: 0,
      pad: 0,
      anchoMinimo: 150,
      hijos: [
        {
          direccion: 'row',
          gap: 10,
          pad: 10,
          altoMinimo: 52,
          hijos: [{ slot: 'icon' }, { direccion: 'column', gap: 0, pad: 0, hijos: [{ slot: 'title' }, { slot: 'badge' }] }, { slot: 'counter' }],
        },
        { slot: 'attrs' },
      ],
    },
    textos: {
      icon: { tipo: 'icon', props: { variant: 'box', side: 28, radius: 0, fill: 'black', border: 'COLOR', 'border-width': 2, color: 'COLOR' } },
      title: texto({ weight: 700, 'text-align': 'start', leading: 1.25 }),
      badge: texto({ transform: 'uppercase', size: 0.72, tracking: 0.06 }),
      counter: { tipo: 'chip', props: { fill: 'black', border: 'white', 'border-width': 2, color: 'white', weight: 700, radius: 50 } },
      attrs: texto({}),
    },
    estados: { selected: [{ nombre: 'border', props: { width: 6 } }] },
  },
  grupo: {
    ...TEMA_NEUTRO.grupo,
    capas: [
      { nombre: 'shape', primitiva: { tipo: 'rect', props: { radius: 0 } } },
      { nombre: 'fill', primitiva: { tipo: 'solid', props: { color: 'black' } } },
      { nombre: 'border', primitiva: { tipo: 'dashed', props: { color: 'white', width: 2 } } },
    ],
    slots: { direccion: 'row', gap: 0, pad: 12, padY: 6, hijos: [{ slot: 'title' }] },
    textos: { title: texto({ dot: 'COLOR', transform: 'uppercase', size: 0.85, tracking: 0.08, weight: 700 }) },
    padding: { top: 12, left: 20, bottom: 20, right: 20 },
    colapsado: { ops: [{ nombre: 'border', primitiva: 'border', props: { color: 'COLOR', width: 3 } }] },
  },
  arista: {
    capas: [{ nombre: 'line', primitiva: { tipo: 'line', props: { color: 'white', width: 2, style: 'solid', corner: 'sharp', cut: 6, radius: 8 } } }],
    fin: { tipo: 'arrow', props: { size: 9 } },
    etiqueta: { tipo: 'label', props: { scale: 0.85, pad: 6, 'pad-y': 2, fill: 'black', border: 'white', 'border-width': 1.5, color: 'white', radius: 0 } },
    diagramas: { er: { ops: [], fin: { tipo: 'arrow', props: { size: 12, color: 'white' } } } },
  },
  fila: {
    alto: 28,
    capas: [
      { nombre: 'background', primitiva: { tipo: 'solid', props: { color: 'black' } } },
      { nombre: 'separator', primitiva: { tipo: 'stripe', props: { color: 'white', side: 'bottom', width: 2 } } },
    ],
    alterna: [],
    textos: { name: texto({ weight: 700 }), type: texto({}) },
    claves: {},
    opcional: [],
    estados: {},
  },
  secuencia: {
    lifeline: { capas: [{ nombre: 'line', primitiva: { tipo: 'line', props: { color: 'white', width: 2, style: 'dashed' } } }], fin: { tipo: 'cross', props: { size: 14, color: 'white' } }, textos: {}, parches: {}, estados: {}, metricas: {} },
    activation: {
      capas: [
        { nombre: 'shape', primitiva: { tipo: 'rect', props: { radius: 0 } } },
        { nombre: 'fill', primitiva: { tipo: 'solid', props: { color: 'black' } } },
        { nombre: 'border', primitiva: { tipo: 'border', props: { color: 'COLOR', width: 3 } } },
      ],
      textos: {},
      parches: {},
      estados: {},
      metricas: { width: 12 },
    },
    message: {
      capas: [{ nombre: 'line', primitiva: { tipo: 'line', props: { color: 'white', width: 3, style: 'solid', corner: 'sharp' } } }],
      fin: { tipo: 'arrow', props: { size: 11 } },
      textos: {},
      parches: {
        async: { ops: [], fin: { tipo: 'chevron', props: { size: 11 } } },
        reply: { ops: [{ nombre: 'line', props: { style: 'dashed' } }], fin: { tipo: 'chevron', props: { size: 11 } } },
        create: { ops: [{ nombre: 'line', props: { style: 'dashed' } }], fin: { tipo: 'chevron', props: { size: 11 } } },
        destroy: { ops: [], fin: { tipo: 'arrow', props: { size: 11 } } },
      },
      estados: {},
      metricas: {},
    },
    fragment: {
      capas: [
        { nombre: 'shape', primitiva: { tipo: 'rect', props: { radius: 0 } } },
        { nombre: 'fill', primitiva: { tipo: 'solid', props: { color: 'black' } } },
        { nombre: 'border', primitiva: { tipo: 'border', props: { color: 'white', width: 3 } } },
      ],
      textos: {
        operator: { tipo: 'label', props: { color: 'white', weight: 700 } },
        guard: texto({ color: 'white' }),
        divider: { tipo: 'line', props: { color: 'white', width: 2, style: 'dashed' } },
      },
      parches: {},
      estados: {},
      metricas: {},
    },
    note: {
      capas: [
        { nombre: 'fill', primitiva: { tipo: 'solid', props: { color: 'black' } } },
        { nombre: 'border', primitiva: { tipo: 'border', props: { color: 'amber', width: 3 } } },
      ],
      textos: { text: texto({}) },
      parches: {},
      estados: {},
      metricas: {},
    },
  },
};
