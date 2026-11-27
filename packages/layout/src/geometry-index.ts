/** Absolute geometry index: each Node's box on the canvas, its parent and the roots. Pure. */
import type { NodeBox, ResolvedNode, ResolvedView } from 'canonical';


export interface GeometryIndex {
  /** Box of each Node that has a box in the geometry, in canvas coordinates. */
  boxes: Map<string, NodeBox>;
  /** Roots are not in it. */
  parent: Map<string, string>;
  /** The Nodes that no Group of the View nests. */
  roots: ResolvedNode[];
}

/** A Node without a box is skipped together with its subtree; a collapsed Group is a leaf. */
export function geometryIndex(view: ResolvedView, geometry: { nodes: Readonly<Record<string, NodeBox>> }): GeometryIndex {
  const parent = new Map(view.nodes.flatMap((node) => node.children.map((child) => [child.id, node.id] as const)));
  const roots = view.nodes.filter((node) => !parent.has(node.id));
  const boxes = new Map<string, NodeBox>();
  const visit = (node: ResolvedNode, dx: number, dy: number): void => {
    const box = geometry.nodes[node.id];
    if (box === undefined) return;
    const absolute = { ...box, x: box.x + dx, y: box.y + dy };
    boxes.set(node.id, absolute);
    for (const child of node.children) visit(child, absolute.x, absolute.y);
  };
  for (const root of roots) visit(root, 0, 0);
  return { boxes, parent, roots };
}
