import type { CapaPintada, PinturaDeArista } from './estilo';

/** Trazos de una Arista ER: un trazo `solid`/`dashed` pasa a continuo si es identificante y a discontinuo si no; en las identificantes la pila `identifying` sustituye a la base. Lo usan `render` y el aviso de solo-color. */
export function capasDeAristaEr(base: PinturaDeArista, identificante: boolean): CapaPintada[] {
  const capas = identificante && base.identificante !== undefined ? base.identificante : base.capas;
  return capas.map((capa) => {
    const estilo = capa.props['style'];
    return estilo === 'solid' || estilo === 'dashed' ? { ...capa, props: { ...capa.props, style: identificante ? 'solid' : 'dashed' } } : capa;
  });
}
