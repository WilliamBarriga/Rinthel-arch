/**
 * Derivacion de los Elementos de Tema de secuencia y ER que el Tema no declara (ADR 0009, "Derivacion cuando el Tema
 * no declara un Elemento"). Es el unico sitio con estas reglas y sus constantes: `estiloResuelto` las aplica sobre la
 * pintura ya resuelta de `node` y `edge`, y `render` e `inspect tema` solo leen el resultado.
 * - `lifeline`: el trazo de la Arista, discontinuo; una Lifeline destruida termina en `cross`.
 * - `message`: el trazo de la Arista; `reply` y `create` con la continuidad opuesta y el marcador de cada tipo.
 * - `activation`: solo la forma, el relleno y el borde del Nodo de su Lifeline (sin decoraciones ni efectos).
 * - `fragment`: lo mismo del Nodo sin Tipo, con el relleno reducido a un tinte tenue y `pill`/`circle` como `rect`.
 * - `note`: "papel" con el tinte suave del color de nota de la Paleta (`amber`, si no el borde) y trazo fino.
 * - guardas de Fragmento: el color del trazo de la Arista; `divider`, discontinuo del color del borde.
 * - tabla ER: una forma `pill` o `circle` del Nodo pasa a `rect` con radio acotado; `row`, filas sin Capas.
 */
import { TIPOS_DE_MENSAJE } from 'canonico';
import type { TipoDeMensaje } from 'canonico';

import { primitivasDeFamilia } from './catalogo';
import type { NombreDePrimitiva } from './catalogo';
import type {
  CapaPintada,
  PinturaDeActivacion,
  PinturaDeArista,
  PinturaDeCajaDeSecuencia,
  PinturaDeElemento,
  PinturaDeFila,
  PinturaDeFragmento,
  PinturaDeNota,
  PinturaDeTrazoDeSecuencia,
  Pintura,
  PrimitivaPintada,
  TrazoDeVariante,
} from './estilo';

/** Formas que no dibujan una tabla ER ni un marco (recortan el contenido): se derivan como `rect` con `RADIO_DE_TABLA`. */
const FORMAS_DE_PASTILLA: readonly NombreDePrimitiva[] = ['pill', 'circle'];
/** La Primitiva `tipo` es una de `FORMAS_DE_PASTILLA`. */
export const esPastilla = (tipo: string): boolean => FORMAS_DE_PASTILLA.some((forma) => forma === tipo);
export const RADIO_DE_TABLA = 8;

/** Largo del marcador derivado (`end` de una Lifeline destruida, marcador de un Mensaje) cuando la Arista no declara uno (px). */
const LARGO_DE_MARCADOR = 10;
/** Parte del color del relleno que queda al derivar el Fragmento: lo bastante tenue para no ocultar los Mensajes. */
const TINTE_DE_FRAGMENTO = 14;
/** Opacidad del relleno de la Nota derivada ("papel"): un tinte suave de su color. */
const OPACIDAD_DE_PAPEL = 0.2;
/** Color de nota de la Paleta. */
const COLOR_DE_NOTA = 'amber';
/** Color de reserva de un marcador sin color ni trazo del que tomarlo. */
const NEGRO = '#000000';

/** Marcador final de cada tipo de Mensaje. */
const MARCADOR_DE_MENSAJE: Record<TipoDeMensaje, NombreDePrimitiva> = { sync: 'arrow', async: 'chevron', reply: 'chevron', create: 'chevron', destroy: 'arrow' };

const FAMILIAS_DE_CAJA: readonly string[] = [...primitivasDeFamilia('forma'), ...primitivasDeFamilia('relleno'), ...primitivasDeFamilia('borde')];
const FAMILIAS_DE_RELLENO: readonly string[] = primitivasDeFamilia('relleno');

const primitiva = (tipo: NombreDePrimitiva, props: Record<string, number | string>): PrimitivaPintada => ({ tipo, props });
const colorDelTrazo = (capas: readonly CapaPintada[]): number | string => capas.at(-1)?.props['color'] ?? NEGRO;

/** Capas que una caja de secuencia toma del Nodo: solo su forma, relleno y borde. */
export const capasDeCaja = (capas: readonly CapaPintada[]): CapaPintada[] => capas.filter((capa) => FAMILIAS_DE_CAJA.includes(capa.tipo));

// ---- Trazos: lifeline y message ----

/** Marcador final de una Lifeline destruida: `cross` del color del trazo y del largo del marcador de la Arista. */
const finDeLifeline = (arista: PinturaDeArista, capas: readonly CapaPintada[]): PrimitivaPintada =>
  primitiva('cross', { size: Number(arista.fin?.props['size'] ?? LARGO_DE_MARCADOR), color: colorDelTrazo(capas) });

/** `lifeline` con la pintura de `arista`: la declarada (con `cross` si no declara `end`) o la derivada, discontinua y sin marcadores. */
export function lifeline(declarada: PinturaDeTrazoDeSecuencia | undefined, arista: PinturaDeArista): PinturaDeTrazoDeSecuencia {
  if (declarada !== undefined) return declarada.fin === undefined ? { ...declarada, fin: finDeLifeline(arista, declarada.capas) } : declarada;
  const capas = arista.capas.map((capa) => ({ ...capa, props: { ...capa.props, style: 'dashed' } }));
  return { capas, fin: finDeLifeline(arista, capas), variantes: {}, tipos: {} };
}

/** Estilo de trazo de la Capa principal. */
const estiloDeTrazo = (capas: readonly CapaPintada[]): string => String(capas.at(-1)?.props['style'] ?? 'solid');

/** Mensaje derivado de un trazo: continuidad opuesta en `reply` y `create`, y el marcador del tipo (sin marcador de origen). */
function mensajeDerivado(capasBase: readonly CapaPintada[], finBase: PrimitivaPintada | undefined, kind: TipoDeMensaje): TrazoDeVariante {
  const continuo = estiloDeTrazo(capasBase) === 'solid';
  const estilo = kind === 'reply' || kind === 'create' ? (continuo ? 'dashed' : 'solid') : undefined;
  const capas = estilo === undefined ? [...capasBase] : capasBase.map((capa) => ({ ...capa, props: { ...capa.props, style: estilo } }));
  return { capas, fin: primitiva(MARCADOR_DE_MENSAJE[kind], { size: Number(finBase?.props['size'] ?? LARGO_DE_MARCADOR), color: finBase?.props['color'] ?? colorDelTrazo(capas) }) };
}

/**
 * `message` con la pintura de `arista`: por tipo de Mensaje, el parche `kind` del Tema o la derivacion. Sin bloque
 * `message`, todo sale de la Arista; con bloque, un tipo sin parche parte del trazo del bloque (y de su `end`).
 */
export function mensaje(declarado: PinturaDeTrazoDeSecuencia | undefined, arista: PinturaDeArista): PinturaDeTrazoDeSecuencia {
  const tipoDe = (kind: TipoDeMensaje): TrazoDeVariante => {
    if (declarado === undefined) return mensajeDerivado(arista.capas, arista.fin, kind);
    const parche = declarado.variantes[kind];
    if (parche !== undefined) {
      const fin = parche.fin ?? declarado.fin;
      const origen = parche.origen ?? declarado.origen;
      return { capas: parche.capas, ...(origen !== undefined && { origen }), ...(fin !== undefined && { fin }) };
    }
    const derivado = mensajeDerivado(declarado.capas, undefined, kind);
    return declarado.fin === undefined ? derivado : { ...derivado, fin: declarado.fin };
  };
  const tipos = Object.fromEntries(TIPOS_DE_MENSAJE.map((kind) => [kind, tipoDe(kind)]));
  if (declarado !== undefined) return { ...declarado, tipos };
  return { capas: arista.capas, ...(arista.origen !== undefined && { origen: arista.origen }), ...(arista.fin !== undefined && { fin: arista.fin }), variantes: {}, tipos };
}

// ---- Cajas: activation, fragment, note ----

const cajaVacia = (capas: CapaPintada[]): PinturaDeCajaDeSecuencia & { derivado: true } => ({ capas, textos: {}, variantes: {}, estados: {}, derivado: true });

/** Una pila de Nodo o Grupo reducida a su forma, relleno y borde, sin estados, textos ni animacion. */
function elementoDeCaja(elemento: PinturaDeElemento): PinturaDeElemento {
  return { capas: capasDeCaja(elemento.capas), textos: {}, estados: {}, tipos: Object.fromEntries(Object.entries(elemento.tipos).map(([tipo, pila]) => [tipo, { capas: capasDeCaja(pila.capas), textos: {}, estados: {} }])) };
}

/** `activation` derivada: la pila del Nodo de su Lifeline (por elemento y Tipo) reducida a forma, relleno y borde. */
export function activacionDerivada(pintura: Pick<Pintura, 'nodo' | 'grupo'>): PinturaDeActivacion {
  const porNodo = { nodo: elementoDeCaja(pintura.nodo), grupo: { abierto: elementoDeCaja(pintura.grupo.abierto), colapsado: elementoDeCaja(pintura.grupo.colapsado) } };
  return { ...cajaVacia(porNodo.nodo.capas), porNodo };
}

/** Capas del marco de un Fragmento derivado del Nodo: forma, relleno y borde; el relleno como tinte tenue y `pill`/`circle` como `rect`. */
function capasDeFragmentoDerivado(capasDelNodo: readonly CapaPintada[]): CapaPintada[] {
  const capas = capasDeCaja(capasDelNodo);
  const colorDeRelleno = capas.filter((capa) => FAMILIAS_DE_RELLENO.includes(capa.tipo)).map((capa) => capa.props['color'] ?? capa.props['from']).filter((c) => c !== undefined).at(-1);
  const salida: CapaPintada[] = [];
  let tinteColocado = false;
  for (const capa of capas) {
    if (FAMILIAS_DE_RELLENO.includes(capa.tipo)) {
      if (tinteColocado || colorDeRelleno === undefined) continue;
      tinteColocado = true;
      salida.push({ ...capa, ...primitiva('solid', { color: `color-mix(in srgb,${String(colorDeRelleno)} ${TINTE_DE_FRAGMENTO}%,transparent)` }) });
    } else if (esPastilla(capa.tipo)) {
      salida.push({ ...capa, ...primitiva('rect', { radius: RADIO_DE_TABLA }) });
    } else salida.push(capa);
  }
  return salida;
}

/**
 * `fragment`: el declarado o el derivado del Nodo sin Tipo. Las guardas toman el color de `guard` o, si no, el del trazo
 * de la Arista; sin `divider`, el divisor es discontinuo del color del borde.
 */
export function fragmento(declarado: PinturaDeCajaDeSecuencia | undefined, nodo: readonly CapaPintada[], arista: PinturaDeArista, borde: string): PinturaDeFragmento {
  const base = declarado ?? cajaVacia(capasDeFragmentoDerivado(nodo));
  const divisor = base.textos['divider'];
  const divider = divisor === undefined ? primitiva('line', { width: 1, style: 'dashed', color: borde }) : { ...divisor, props: { ...divisor.props, color: divisor.props['color'] ?? borde } };
  return { ...base, textos: { ...base.textos, divider }, colorDeGuarda: String(base.textos['guard']?.props['color'] ?? arista.capas.at(-1)?.props['color'] ?? borde) };
}

/** `note`: la declarada o la derivada como "papel" (relleno con tinte suave y trazo fino del color de nota de la Paleta). */
export function nota(declarada: PinturaDeCajaDeSecuencia | undefined, paleta: Readonly<Record<string, string>>, borde: string): PinturaDeNota {
  const color = paleta[COLOR_DE_NOTA] ?? borde;
  if (declarada !== undefined) return { ...declarada, papel: { color, opacidadDeRelleno: 1 } };
  return { ...cajaVacia([{ nombre: 'relleno', ...primitiva('solid', { color }) }, { nombre: 'borde', ...primitiva('border', { color, width: 1 }) }]), papel: { color, opacidadDeRelleno: OPACIDAD_DE_PAPEL } };
}

/** `row` derivada: filas sin Capas cuyo texto es el del Slot `attrs`. */
export const filaDerivada = (): PinturaDeFila => ({ base: [], variantes: {}, estados: {}, textos: {}, derivado: true });
