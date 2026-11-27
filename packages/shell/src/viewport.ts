/** Clipping of a resolved View to what falls in the camera; pure. Boxes are compared in canvas coordinates. */
import { edgeId } from 'canonical';
import type { ResolvedEdge, NodeBox, Geometry, ResolvedNode, ResolvedView } from 'canonical';
import { geometryIndex } from 'layout';
import type { Camera } from 'render';

/** Intersection with the border included, so a straight route (height or width 0) counts. */
function crossing(box: NodeBox, camera: Camera): boolean {
  return (
    box.x <= camera.x + camera.width &&
    box.x + box.width >= camera.x &&
    box.y <= camera.y + camera.height &&
    box.y + box.height >= camera.y
  );
}

/** In sequence a Lifeline takes its whole column (header, line and activations): if the camera sees the line, the Lifeline is drawn even if its header is outside. */
function extension(geometry: Geometry, id: string, box: NodeBox): NodeBox {
  const line = geometry.kind === 'secuencia' ? geometry.lifelines[id] : undefined;
  return line === undefined ? box : { ...box, height: Math.max(box.height, line.y2 - box.y) };
}

/**
 * Keeps only the Nodes whose box crosses the camera and the Edges whose route crosses
 * the camera. A visible Group keeps only its visible children. A Node without a box
 * in the geometry is kept so `render` reports the usage error.
 */
export function clipToViewport(view: ResolvedView, geometry: Geometry, camera: Camera): ResolvedView {
  const { boxes } = geometryIndex(view, geometry);
  const inside = new Set<string>();
  for (const node of view.nodes) {
    const box = boxes.get(node.id);
    if (box === undefined || crossing(extension(geometry, node.id, box), camera)) inside.add(node.id);
  }
  const prune = (node: ResolvedNode): ResolvedNode => ({
    ...node,
    children: node.children.filter((child) => inside.has(child.id)).map(prune),
  });
  const nodes = view.nodes.filter((node) => inside.has(node.id)).map(prune);
  switch (view.type) {
    case 'sequence':
      return { ...view, nodes };
    case 'architecture':
    case 'flow':
    case 'er':
      return { ...view, nodes, edges: edgesInCamera(view.edges, geometry, camera) };
  }
}

/** Edges whose route crosses the camera (one without a route in the geometry is discarded). */
function edgesInCamera(edges: readonly ResolvedEdge[], geometry: Geometry, camera: Camera): ResolvedEdge[] {
  return edges.filter((edge) => {
    const points = (geometry.kind === 'grafo' ? geometry.edges[edgeId(edge)]?.points : undefined) ?? [];
    if (points.length === 0) return false;
    const xs = points.map((p) => p.x);
    const ys = points.map((p) => p.y);
    const x = Math.min(...xs);
    const y = Math.min(...ys);
    return crossing({ x, y, width: Math.max(...xs) - x, height: Math.max(...ys) - y }, camera);
  });
}
