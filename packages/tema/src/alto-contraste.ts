/**
 * Tema `alto-contraste` del nucleo (ADR 0008): fondo negro, texto y bordes
 * claros gruesos. Lo activa un interruptor del visor o `prefers-contrast: more`
 * y reemplaza el Tema de la Vista solo en el visor. Cero warnings de contraste.
 */
import type { TemaResuelto } from './tema';

export const TEMA_ALTO_CONTRASTE: TemaResuelto = {
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
  nodo: {
    capas: [
      { nombre: 'forma', primitiva: { tipo: 'rect', props: { radius: 0 } } },
      { nombre: 'relleno', primitiva: { tipo: 'solid', props: { color: 'black' } } },
      { nombre: 'borde', primitiva: { tipo: 'border', props: { color: 'COLOR', width: 3 } } },
    ],
    slots: ['title', 'attrs'],
    tipos: {},
    estados: { seleccionado: [{ nombre: 'borde', props: { width: 6 } }] },
  },
};
