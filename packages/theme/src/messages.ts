import type { PaintedLayer, EdgePaint } from './style';

/** Strokes of an ER Edge: a `solid`/`dashed` stroke becomes solid if identifying and dashed if not; on identifying Edges the `identifying` stack replaces the base. Used by `render` and the color-only warning. */
export function erEdgeLayers(base: EdgePaint, identifying: boolean): PaintedLayer[] {
  const layers = identifying && base.identificante !== undefined ? base.identificante : base.capas;
  return layers.map((layer) => {
    const style = layer.props['style'];
    return style === 'solid' || style === 'dashed' ? { ...layer, props: { ...layer.props, style: identifying ? 'solid' : 'dashed' } } : layer;
  });
}
