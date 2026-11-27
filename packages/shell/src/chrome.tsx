/** Chrome del shell: colores y fuente salen del Estilo resuelto como variables CSS del contenedor; el aspecto vive en clases. */
import type { CSSProperties, ReactElement } from 'react';

import type { Style } from 'render';

import { CSS_DE_ACCESIBILIDAD } from './accesibilidad';
import { CSS_DE_AVISOS } from './avisos';

export function variablesDeChrome(estilo: Style): CSSProperties {
  return {
    '--rd-fondo': estilo.background,
    '--rd-texto': estilo.text,
    '--rd-borde': estilo.border,
    '--rd-acento': estilo.states.selected.color,
    '--rd-fuente': estilo.bodyFont,
    '--rd-error': estilo.errorColor,
  } as CSSProperties;
}

const CSS = `
.rd-vista { position: relative; overflow: hidden; touch-action: none; background: var(--rd-fondo); }
.rd-chrome { position: absolute; display: flex; align-items: center; font: 12px var(--rd-fuente); color: var(--rd-texto); }
.rd-migas { left: 8px; top: 8px; gap: 6px; }
.rd-pasos { left: 8px; top: 40px; gap: 8px; }
.rd-chrome button { font: inherit; color: var(--rd-texto); background: var(--rd-fondo); border: 1px solid var(--rd-borde); border-radius: 4px; cursor: pointer; }
.rd-chrome button:disabled { opacity: 0.5; cursor: default; }
.rd-chrome button:focus-visible { outline: 2px solid var(--rd-acento); }
.rd-contenido { display: contents; }
${CSS_DE_AVISOS}${CSS_DE_ACCESIBILIDAD}`;

/** Hoja de estilo del chrome; va una vez dentro del contenedor. */
export function EstiloDelChrome(): ReactElement {
  return <style data-rd-chrome>{CSS}</style>;
}
