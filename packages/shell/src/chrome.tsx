/** Shell chrome: colors and font come from the resolved Style as CSS variables on the container; the look lives in classes. */
import type { CSSProperties, ReactElement } from 'react';

import type { Style } from 'render';

import { ACCESSIBILITY_CSS } from './accessibility';
import { NOTICES_CSS } from './notices';

export function chromeVariables(style: Style): CSSProperties {
  return {
    '--rd-fondo': style.background,
    '--rd-texto': style.text,
    '--rd-borde': style.border,
    '--rd-acento': style.states.selected.color,
    '--rd-fuente': style.bodyFont,
    '--rd-error': style.errorColor,
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
${NOTICES_CSS}${ACCESSIBILITY_CSS}`;

/** Chrome style sheet; it goes once inside the container. */
export function ChromeStyle(): ReactElement {
  return <style data-rd-chrome>{CSS}</style>;
}
