/**
 * Componente React de una Vista (ADR 0002, 0008). Sin estado ni efectos: pinta la
 * escena que dan sus props y avisa de lo que el usuario toca; quien lo usa (el
 * shell, slides, video) decide el colapso, la visibilidad y la camara.
 */
import { createElement } from 'react';
import type { MouseEvent, ReactElement, ReactNode } from 'react';

import { construirEscena } from './escena';
import type { Elemento, EntradaDeEscena } from './escena';

export type DiagramProps = EntradaDeEscena;

export function Diagram(props: DiagramProps): ReactElement {
  return aReact(construirEscena(props), 'raiz');
}

/** `stroke-dasharray` -> `strokeDasharray`, `class` -> `className`; `data-*` y `aria-*` se quedan como estan. */
function nombreReact(atributo: string): string {
  if (atributo === 'class') return 'className';
  return atributo.startsWith('data-') || atributo.startsWith('aria-') ? atributo : atributo.replace(/-(\w)/g, (_, c: string) => c.toUpperCase());
}

/** `a:1px;--b:2` -> objeto de estilo de React (las variables `--x` se conservan tal cual). */
function estiloReact(texto: string): Record<string, string> {
  const estilo: Record<string, string> = {};
  for (const declaracion of texto.split(';')) {
    const corte = declaracion.indexOf(':');
    if (corte < 0) continue;
    const propiedad = declaracion.slice(0, corte).trim();
    estilo[propiedad.startsWith('--') ? propiedad : propiedad.replace(/-(\w)/g, (_, c: string) => c.toUpperCase())] = declaracion.slice(corte + 1).trim();
  }
  return estilo;
}

function aReact({ tag, attrs, hijos, html, alClic }: Elemento, clave: string): ReactElement {
  const props: Record<string, unknown> = { key: clave };
  for (const [nombre, valor] of Object.entries(attrs)) props[nombreReact(nombre)] = nombre === 'style' ? estiloReact(valor) : valor;
  if (alClic !== undefined) {
    props['onClick'] = (evento?: Pick<MouseEvent, 'stopPropagation'>) => {
      evento?.stopPropagation();
      alClic();
    };
  }
  if (html !== undefined) props['dangerouslySetInnerHTML'] = { __html: html };
  const contenido: ReactNode[] | undefined = hijos?.map((hijo, i) => (typeof hijo === 'string' ? hijo : aReact(hijo, String(i))));
  return createElement(tag, props, ...(contenido ?? []));
}
