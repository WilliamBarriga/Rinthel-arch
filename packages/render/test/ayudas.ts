import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';

import { Diagram } from 'render';
import type { DiagramProps } from 'render';

/** El marcado SVG que dibuja `Diagram` para esas props, como cadena. */
export function aSvg(props: DiagramProps): string {
  return renderToStaticMarkup(createElement(Diagram, props));
}
