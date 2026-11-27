/// <reference lib="dom" />
/**
 * Pointer helpers over the drawn canvas, shared by the `shell` and `dev-ui` tests (single copy). The canvas has no
 * role to query: it is read through `data-diagram`, `data-camara` and `data-id` (docs/CODING.md, Tests).
 * `fireEvent` comes in as an argument so the events go through each package's Testing Library `act`.
 */

/** What the helpers use from Testing Library's `fireEvent`. */
export interface PointerEvents {
  click(element: Element, init?: MouseEventInit): boolean;
  doubleClick(element: Element, init?: MouseEventInit): boolean;
}

export interface CanvasHelpers {
  /** Container of the drawing (`Diagram`): it carries the camera in `data-camara`. */
  drawingOf(container: ParentNode): HTMLElement;
  /** Drawn camera, `x y width height`. */
  cameraOf(container: ParentNode): string | null;
  /** Corner `[x, y]` (canvas coordinates) of a drawn box; boxes are flat and absolute. */
  positionOf(container: ParentNode, id: string): [number, number] | undefined;
  /** Inline opacity of a Node's own part, or null if it has none (1). */
  nodeOpacity(container: ParentNode, id: string): string | null;
  /** Click at point (x, y) of the canvas: it translates it to the screen with the drawn camera, like the mouse would. */
  pressAt(container: ParentNode, x: number, y: number, init?: MouseEventInit): void;
  /** Click at the center of a drawn Node. */
  pressNode(container: ParentNode, id: string, init?: MouseEventInit): void;
  /** Double click at the center of a drawn Node (two clicks and the `dblclick`, like the mouse). */
  doubleClickNode(container: ParentNode, id: string): void;
}

export function canvasHelpers(fireEvent: PointerEvents): CanvasHelpers {
  const drawingOf = (container: ParentNode): HTMLElement => container.querySelector<HTMLElement>('[data-diagram]')!;

  const positionOf = (container: ParentNode, id: string): [number, number] | undefined => {
    const box = container.querySelector<HTMLElement>(`[data-id="${id}"]`);
    const t = /translate\(([-\d.]+)px,\s*([-\d.]+)px\)/.exec(box?.style.transform ?? '');
    return t === null ? undefined : [Number(t[1]), Number(t[2])];
  };

  /** Screen point of the canvas point (x, y), with the drawn camera. */
  const onScreen = (drawing: HTMLElement, x: number, y: number): { clientX: number; clientY: number } => {
    const [vx, vy, vw] = drawing.getAttribute('data-camara')!.split(' ').map(Number) as [number, number, number, number];
    const k = Number.parseFloat(drawing.style.width) / vw;
    return { clientX: (x - vx) * k, clientY: (y - vy) * k };
  };

  /** Each event may redraw the canvas: the target is looked up again before each one. */
  const nodeCenter = (container: ParentNode, id: string): { drawing: HTMLElement; point: { clientX: number; clientY: number } } => {
    const [x, y] = positionOf(container, id)!;
    const box = container.querySelector<HTMLElement>(`[data-id="${id}"]`)!;
    const drawing = drawingOf(container);
    return { drawing, point: onScreen(drawing, x + Number.parseFloat(box.style.width) / 2, y + Number.parseFloat(box.style.height) / 2) };
  };

  return {
    drawingOf,
    cameraOf: (container) => drawingOf(container).getAttribute('data-camara'),
    positionOf,
    nodeOpacity: (container, id) => {
      const value = container.querySelector<HTMLElement>(`[data-id="${id}"] [data-part="nodo"]`)?.style.opacity;
      return value === undefined || value === '' ? null : value;
    },
    pressAt: (container, x, y, init = {}) => {
      const drawing = drawingOf(container);
      fireEvent.click(drawing, { ...onScreen(drawing, x, y), ...init });
    },
    pressNode: (container, id, init = {}) => {
      const { drawing, point } = nodeCenter(container, id);
      fireEvent.click(drawing, { ...point, ...init });
    },
    doubleClickNode: (container, id) => {
      const at = () => nodeCenter(container, id);
      fireEvent.click(at().drawing, { ...at().point, detail: 1 });
      fireEvent.click(at().drawing, { ...at().point, detail: 2 });
      fireEvent.doubleClick(at().drawing, at().point);
    },
  };
}
