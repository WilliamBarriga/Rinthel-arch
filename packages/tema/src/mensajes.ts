/**
 * Trazos de las Aristas de ER (ADR 0009) a partir de la Arista del Tema. Un solo modulo para `render` (que dibuja) y
 * para `solo-color` (que compara), asi lo avisado y lo dibujado no divergen. Los Mensajes de secuencia salen ya
 * resueltos en el Estilo (`derivacion`).
 */
import type { CapaPintada, PinturaDeArista } from './estilo';

/** Trazos de una Arista de Vista ER: continuo si es identificante y discontinuo si no (si el trazo del Tema es `solid` o `dashed`); la pila `identifying` del Tema sustituye a la base en las identificantes. */
export function capasDeAristaEr(base: PinturaDeArista, identificante: boolean): CapaPintada[] {
  const capas = identificante && base.identificante !== undefined ? base.identificante : base.capas;
  return capas.map((capa) => {
    const estilo = capa.props['style'];
    return estilo === 'solid' || estilo === 'dashed' ? { ...capa, props: { ...capa.props, style: identificante ? 'solid' : 'dashed' } } : capa;
  });
}
