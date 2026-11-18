/** Derivacion de los Elementos de Tema de secuencia y ER que el Tema no declara, desde la pintura resuelta de `node` y `edge`. */
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

/** Recortan el contenido de una tabla ER o un marco: se derivan como `rect` con `RADIO_DE_TABLA`. */
const FORMAS_DE_PASTILLA: readonly NombreDePrimitiva[] = ['pill', 'circle'];
export const esPastilla = (tipo: string): boolean => FORMAS_DE_PASTILLA.some((forma) => forma === tipo);
export const RADIO_DE_TABLA = 8;

/** px; cuando la Arista no declara marcador. */
const LARGO_DE_MARCADOR = 10;
/** Porcentaje del color del relleno que queda en el Fragmento, para no ocultar los Mensajes. */
const TINTE_DE_FRAGMENTO = 14;
const OPACIDAD_DE_PAPEL = 0.2;
const COLOR_DE_NOTA = 'amber';
/** Reserva de un marcador sin color ni trazo del que tomarlo. */
const NEGRO = '#000000';

const MARCADOR_DE_MENSAJE: Record<TipoDeMensaje, NombreDePrimitiva> = { sync: 'arrow', async: 'chevron', reply: 'chevron', create: 'chevron', destroy: 'arrow' };

const FAMILIAS_DE_CAJA: readonly string[] = [...primitivasDeFamilia('forma'), ...primitivasDeFamilia('relleno'), ...primitivasDeFamilia('borde')];
const FAMILIAS_DE_RELLENO: readonly string[] = primitivasDeFamilia('relleno');

const primitiva = (tipo: NombreDePrimitiva, props: Record<string, number | string>): PrimitivaPintada => ({ tipo, props });
const colorDelTrazo = (capas: readonly CapaPintada[]): number | string => capas.at(-1)?.props['color'] ?? NEGRO;

/** Solo forma, relleno y borde. */
export const capasDeCaja = (capas: readonly CapaPintada[]): CapaPintada[] => capas.filter((capa) => FAMILIAS_DE_CAJA.includes(capa.tipo));

// ---- Trazos: lifeline y message ----

/** `cross` del color del trazo y del largo del marcador de la Arista. */
const finDeLifeline = (arista: PinturaDeArista, capas: readonly CapaPintada[]): PrimitivaPintada =>
  primitiva('cross', { size: Number(arista.fin?.props['size'] ?? LARGO_DE_MARCADOR), color: colorDelTrazo(capas) });

/** La declarada (con `cross` si no declara `end`) o la derivada de `arista`, discontinua y sin marcadores. */
export function lifeline(declarada: PinturaDeTrazoDeSecuencia | undefined, arista: PinturaDeArista): PinturaDeTrazoDeSecuencia {
  if (declarada !== undefined) return declarada.fin === undefined ? { ...declarada, fin: finDeLifeline(arista, declarada.capas) } : declarada;
  const capas = arista.capas.map((capa) => ({ ...capa, props: { ...capa.props, style: 'dashed' } }));
  return { capas, fin: finDeLifeline(arista, capas), variantes: {}, tipos: {} };
}

const estiloDeTrazo = (capas: readonly CapaPintada[]): string => String(capas.at(-1)?.props['style'] ?? 'solid');

/** Continuidad opuesta en `reply` y `create`, y el marcador del tipo, sin marcador de origen. */
function mensajeDerivado(capasBase: readonly CapaPintada[], finBase: PrimitivaPintada | undefined, kind: TipoDeMensaje): TrazoDeVariante {
  const continuo = estiloDeTrazo(capasBase) === 'solid';
  const estilo = kind === 'reply' || kind === 'create' ? (continuo ? 'dashed' : 'solid') : undefined;
  const capas = estilo === undefined ? [...capasBase] : capasBase.map((capa) => ({ ...capa, props: { ...capa.props, style: estilo } }));
  return { capas, fin: primitiva(MARCADOR_DE_MENSAJE[kind], { size: Number(finBase?.props['size'] ?? LARGO_DE_MARCADOR), color: finBase?.props['color'] ?? colorDelTrazo(capas) }) };
}

/** Por tipo de Mensaje, el parche `kind` o la derivacion; sin bloque `message` parte de la Arista, con bloque, de su trazo y `end`. */
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

/** Reducida a forma, relleno y borde, sin estados, textos ni animacion. */
function elementoDeCaja(elemento: PinturaDeElemento): PinturaDeElemento {
  return { capas: capasDeCaja(elemento.capas), textos: {}, estados: {}, tipos: Object.fromEntries(Object.entries(elemento.tipos).map(([tipo, pila]) => [tipo, { capas: capasDeCaja(pila.capas), textos: {}, estados: {} }])) };
}

export function activacionDerivada(pintura: Pick<Pintura, 'nodo' | 'grupo'>): PinturaDeActivacion {
  const porNodo = { nodo: elementoDeCaja(pintura.nodo), grupo: { abierto: elementoDeCaja(pintura.grupo.abierto), colapsado: elementoDeCaja(pintura.grupo.colapsado) } };
  return { ...cajaVacia(porNodo.nodo.capas), porNodo };
}

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

/** El declarado o el derivado del Nodo sin Tipo. Guardas: `guard` o el color del trazo de la Arista; sin `divider`, discontinuo del color del borde. */
export function fragmento(declarado: PinturaDeCajaDeSecuencia | undefined, nodo: readonly CapaPintada[], arista: PinturaDeArista, borde: string): PinturaDeFragmento {
  const base = declarado ?? cajaVacia(capasDeFragmentoDerivado(nodo));
  const divisor = base.textos['divider'];
  const divider = divisor === undefined ? primitiva('line', { width: 1, style: 'dashed', color: borde }) : { ...divisor, props: { ...divisor.props, color: divisor.props['color'] ?? borde } };
  return { ...base, textos: { ...base.textos, divider }, colorDeGuarda: String(base.textos['guard']?.props['color'] ?? arista.capas.at(-1)?.props['color'] ?? borde) };
}

/** La declarada o la derivada: tinte suave y trazo fino del color de nota de la Paleta (`amber`, si no el borde). */
export function nota(declarada: PinturaDeCajaDeSecuencia | undefined, paleta: Readonly<Record<string, string>>, borde: string): PinturaDeNota {
  const color = paleta[COLOR_DE_NOTA] ?? borde;
  if (declarada !== undefined) return { ...declarada, papel: { color, opacidadDeRelleno: 1 } };
  return { ...cajaVacia([{ nombre: 'relleno', ...primitiva('solid', { color }) }, { nombre: 'borde', ...primitiva('border', { color, width: 1 }) }]), papel: { color, opacidadDeRelleno: OPACIDAD_DE_PAPEL } };
}

/** Filas sin Capas cuyo texto es el del Slot `attrs`. */
export const filaDerivada = (): PinturaDeFila => ({ base: [], variantes: {}, estados: {}, textos: {}, derivado: true });
