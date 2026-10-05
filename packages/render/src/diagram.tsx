/**
 * Componente React de una Vista (ADR 0003). Sin estado ni efectos: pinta la
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

/** `stroke-dasharray` -> `strokeDasharray`; `data-*` se queda como esta. */
function nombreReact(atributo: string): string {
  return atributo.startsWith('data-') ? atributo : atributo.replace(/-(\w)/g, (_, c: string) => c.toUpperCase());
}

function aReact({ tag, attrs, hijos, html, alClic }: Elemento, clave: string): ReactElement {
  const props: Record<string, unknown> = { key: clave };
  for (const [nombre, valor] of Object.entries(attrs)) props[nombreReact(nombre)] = valor;
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
