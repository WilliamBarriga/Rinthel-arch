/**
 * Tema `alto-contraste` del nucleo (ADR 0008): fondo negro, texto blanco y bordes
 * gruesos del color del Tipo. Misma tarjeta que `neutral` (icono en caja, titulo,
 * insignia del Tipo en mayusculas, contador del Grupo cerrado), sin translucidos.
 * Lo activa un interruptor del visor o `prefers-contrast: more` y reemplaza el
 * Tema de la Vista solo en el visor, por eso va ya resuelto y no en el DSL.
 * Cero warnings de contraste.
 */
import { TEMA_NEUTRO } from './tema';
import type { TemaResuelto } from './tema';

const texto = (props: Record<string, string | number>) => ({ tipo: 'text', props: { weight: 400, style: 'normal', transform: 'none', tracking: 0, radius: 0, pad: 0, color: 'white', ...props } });

export const TEMA_ALTO_CONTRASTE: TemaResuelto = {
  ...TEMA_NEUTRO,
  name: 'alto-contraste',
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
      { nombre: 'forma', primitiva: { tipo: 'rect', props: { radius: 0 } } },
      { nombre: 'relleno', primitiva: { tipo: 'solid', props: { color: 'black' } } },
      { nombre: 'borde', primitiva: { tipo: 'border', props: { color: 'COLOR', width: 3 } } },
    ],
    // Icono en caja, titulo con la insignia del Tipo debajo y, en un Grupo cerrado, el contador.
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
    estados: { seleccionado: [{ nombre: 'borde', props: { width: 6 } }] },
  },
  grupo: {
    ...TEMA_NEUTRO.grupo,
    capas: [
      { nombre: 'forma', primitiva: { tipo: 'rect', props: { radius: 0 } } },
      { nombre: 'relleno', primitiva: { tipo: 'solid', props: { color: 'black' } } },
      { nombre: 'borde', primitiva: { tipo: 'dashed', props: { color: 'white', width: 2 } } },
    ],
    slots: { direccion: 'row', gap: 0, pad: 12, padY: 6, hijos: [{ slot: 'title' }] },
    textos: { title: texto({ dot: 'COLOR', transform: 'uppercase', size: 0.85, tracking: 0.08, weight: 700 }) },
    padding: { top: 12, left: 20, bottom: 20, right: 20 },
    // Cerrado: la tarjeta del Nodo, con borde continuo del color del Tipo.
    colapsado: { ops: [{ nombre: 'borde', primitiva: 'border', props: { color: 'COLOR', width: 3 } }] },
  },
  arista: {
    capas: [{ nombre: 'linea', primitiva: { tipo: 'line', props: { color: 'white', width: 2, style: 'solid', corner: 'sharp', cut: 6, radius: 8 } } }],
    fin: { tipo: 'arrow', props: { size: 9 } },
    etiqueta: { tipo: 'label', props: { scale: 0.85, pad: 6, 'pad-y': 2, fill: 'black', border: 'white', 'border-width': 1.5, color: 'white', radius: 0 } },
  },
};
