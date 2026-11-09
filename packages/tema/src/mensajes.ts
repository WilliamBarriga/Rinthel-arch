/**
 * Pintura de los Mensajes de secuencia y de las Aristas de ER (ADR 0009) a partir de la Arista del Tema. Un solo
 * modulo para `render` (que dibuja) y para `solo-color` (que compara tipos), asi lo avisado y lo dibujado no divergen.
 * - Sin bloque `message`, el Mensaje se deriva de la Arista: `reply` y `create` llevan la continuidad opuesta a la del
 *   trazo base y el marcador final depende del tipo (`sync` flecha, `async` y `reply` chevron).
 * - Con bloque `message`, manda el parche `kind` del tipo; un tipo sin parche parte del trazo del bloque con la misma
 *   distincion derivada.
 */
import type { TipoDeMensaje } from 'canonico';

import type { CapaPintada, PinturaDeArista, PinturaDeSecuencia, PrimitivaPintada } from './estilo';
import type { NombreDePrimitiva } from './catalogo';

/** Marcador final de cada tipo de Mensaje. */
const MARCADOR_DE_MENSAJE: Record<TipoDeMensaje, NombreDePrimitiva> = { sync: 'arrow', async: 'chevron', reply: 'chevron', create: 'chevron', destroy: 'arrow' };

/** Estilo de trazo de la Capa principal: el de la Arista base. */
const estiloDeTrazo = (capas: readonly CapaPintada[]): string => String(capas[capas.length - 1]?.props['style'] ?? 'solid');

/** Pintura derivada de la Arista para un Mensaje de ese tipo: continuidad opuesta en `reply` y `create`, y el marcador del tipo. */
export function pinturaDeMensaje(base: PinturaDeArista, kind: TipoDeMensaje): PinturaDeArista {
  const continuo = estiloDeTrazo(base.capas) === 'solid';
  const estilo = kind === 'reply' || kind === 'create' ? (continuo ? 'dashed' : 'solid') : undefined;
  const capas: CapaPintada[] = estilo === undefined ? base.capas : base.capas.map((capa) => ({ ...capa, props: { ...capa.props, style: estilo } }));
  const principal = capas[capas.length - 1];
  const fin: PrimitivaPintada = { tipo: MARCADOR_DE_MENSAJE[kind], props: { size: Number(base.fin?.props['size'] ?? 10), color: base.fin?.props['color'] ?? principal?.props['color'] ?? '#000000' } };
  const { origen: _origen, ...resto } = base;
  return { ...resto, capas, fin };
}

/** Pintura de un Mensaje de ese tipo: la del bloque `message` del Tema si lo declara y, si no, la derivada de la Arista `base`. `color` es el del Nodo de origen. */
export function pinturaDeMensajeConTema(secuencia: PinturaDeSecuencia | undefined, base: PinturaDeArista, color: string | undefined, kind: TipoDeMensaje): PinturaDeArista {
  const declarado = secuencia?.mensaje;
  if (declarado === undefined) return pinturaDeMensaje(base, kind);
  const trazo = (color === undefined ? undefined : declarado.origenes[color]) ?? declarado.base;
  const { etiqueta } = base;
  const parche = trazo.variantes[kind];
  if (parche !== undefined) {
    const fin = parche.fin ?? trazo.fin;
    const origen = parche.origen ?? trazo.origen;
    return { capas: parche.capas, ...(origen !== undefined && { origen }), ...(fin !== undefined && { fin }), etiqueta };
  }
  const derivada = pinturaDeMensaje({ capas: trazo.capas, etiqueta }, kind);
  return trazo.fin === undefined ? derivada : { ...derivada, fin: trazo.fin };
}

/** Trazos de una Arista de Vista ER: continuo si es identificante y discontinuo si no (si el trazo del Tema es `solid` o `dashed`); la pila `identifying` del Tema sustituye a la base en las identificantes. */
export function capasDeAristaEr(base: PinturaDeArista, identificante: boolean): CapaPintada[] {
  const capas = identificante && base.identificante !== undefined ? base.identificante : base.capas;
  return capas.map((capa) => {
    const estilo = capa.props['style'];
    return estilo === 'solid' || estilo === 'dashed' ? { ...capa, props: { ...capa.props, style: identificante ? 'solid' : 'dashed' } } : capa;
  });
}
