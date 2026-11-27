/** React component of a View: no state nor effects; collapse, visibility and camera come in through props. */
import { createElement } from 'react';
import type { MouseEvent, ReactElement, ReactNode } from 'react';

import { WithBoundary } from './boundary';
import { buildScene } from './scene';
import type { MarkupElement, SceneInput } from './scene';

export type DiagramProps = SceneInput;

export function Diagram(props: DiagramProps): ReactElement {
  return toReact(buildScene(props), 'raiz');
}

/** `stroke-dasharray` -> `strokeDasharray`, `class` -> `className`; `data-*` and `aria-*` stay as they are. */
function reactName(attribute: string): string {
  if (attribute === 'class') return 'className';
  return attribute.startsWith('data-') || attribute.startsWith('aria-') ? attribute : attribute.replace(/-(\w)/g, (_, c: string) => c.toUpperCase());
}

/** `a:1px;--b:2` -> React style object (the `--x` variables are kept as is). */
function reactStyle(text: string): Record<string, string> {
  const style: Record<string, string> = {};
  for (const declaration of text.split(';')) {
    const cutoff = declaration.indexOf(':');
    if (cutoff < 0) continue;
    const property = declaration.slice(0, cutoff).trim();
    style[property.startsWith('--') ? property : property.replace(/-(\w)/g, (_, c: string) => c.toUpperCase())] = declaration.slice(cutoff + 1).trim();
  }
  return style;
}

function toReact({ tag, attrs, children, html, onClick, component }: MarkupElement, key: string): ReactElement {
  const props: Record<string, unknown> = { key };
  for (const [name, value] of Object.entries(attrs)) props[reactName(name)] = name === 'style' ? reactStyle(value) : value;
  if (onClick !== undefined) {
    props['onClick'] = (event?: Pick<MouseEvent, 'stopPropagation'>) => {
      event?.stopPropagation();
      onClick();
    };
  }
  if (html !== undefined) props['dangerouslySetInnerHTML'] = { __html: html };
  const contents: ReactNode[] | undefined = children?.map((child, i) => (typeof child === 'string' ? child : toReact(child, String(i))));
  if (component !== undefined) return createElement(tag, props, createElement(WithBoundary, null, createElement(component.kind, component.props)));
  return createElement(tag, props, ...(contents ?? []));
}
