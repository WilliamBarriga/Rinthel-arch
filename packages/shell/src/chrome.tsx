/**
 * Chrome del shell (pasos, breadcrumbs): sus colores y fuente salen del Estilo
 * resuelto como variables CSS en el contenedor, y su aspecto vive en clases. Un
 * Tema nuevo cambia las variables y el chrome sigue al Tema sin tocar las clases.
 */
import type { CSSProperties, ReactElement } from 'react';

import type { Estilo } from 'render';

import { CSS_DE_AVISOS } from './avisos';

/** Variables CSS del chrome derivadas del Estilo resuelto. */
export function variablesDeChrome(estilo: Estilo): CSSProperties {
  return {
    '--rd-fondo': estilo.fondo,
    '--rd-texto': estilo.texto,
    '--rd-borde': estilo.borde,
    '--rd-acento': estilo.estados.seleccionado.color,
    '--rd-fuente': estilo.fuenteCuerpo,
    '--rd-error': estilo.colorDeError,
  } as CSSProperties;
}

const CSS = `
.rd-vista { position: relative; overflow: hidden; touch-action: none; background: var(--rd-fondo); }
.rd-chrome { position: absolute; display: flex; align-items: center; font: 12px var(--rd-fuente); color: var(--rd-texto); }
.rd-migas { left: 8px; top: 8px; gap: 6px; }
.rd-pasos { left: 8px; bottom: 8px; gap: 8px; }
.rd-chrome button { font: inherit; color: var(--rd-texto); background: var(--rd-fondo); border: 1px solid var(--rd-borde); border-radius: 4px; cursor: pointer; }
.rd-chrome button:disabled { opacity: 0.5; cursor: default; }
.rd-chrome button:focus-visible { outline: 2px solid var(--rd-acento); }
.rd-contenido { display: contents; }
${CSS_DE_AVISOS}`;

/** Hoja de estilo del chrome; va una vez dentro del contenedor. */
export function EstiloDelChrome(): ReactElement {
  return <style data-rd-chrome>{CSS}</style>;
}
