/**
 * Metricas: los numeros de espaciado y escala derivados del Tema que `layout`
 * usa para medir y `render` para dibujar. Un solo modulo, para que lo reservado
 * y lo dibujado no puedan divergir. Solo dependen de la caja y de los Slots
 * (fuentes, tamano de texto, que Slots se muestran y en que orden): las Capas
 * de pintura nunca las cambian. Sin medir texto real (el layout corre en Node
 * y en Worker, sin DOM): el ancho se estima por caracter segun el tamano y la
 * familia de la fuente del Tema; una medicion real entraria aqui, como
 * adaptador de `metricasDe`.
 */
import type { Atributo, NodoResuelto, Tema } from 'canonico';

import type { NombreDeSlot } from './catalogo';
import { resolverTema } from './tema';

export interface Metricas {
  /** Tamano del texto del Tema. */
  fontSize: number;
  /** Ancho medio de un caracter, relativo al tamano. */
  factorDeAncho: number;
  /** Familias del Tema; solo para la clave de layout. */
  fuentes: Record<string, string>;
  /** Slots del Nodo que el Tema muestra, en orden visual. */
  slots: readonly NombreDeSlot[];
  /** Ancho minimo de un Nodo hoja. */
  anchoMinimo: number;
  /** Suma de los margenes izquierdo y derecho del texto de un Nodo hoja. */
  paddingHorizontal: number;
  /** Margen izquierdo del titulo y de los Atributos. */
  margenDeTexto: number;
  /** Alto del Slot `title` de un Nodo. */
  cabecera: number;
  /** Alto de cada fila del Slot `attrs`. */
  fila: number;
  /** Margen interior de un Grupo abierto; `top` deja sitio al titulo. */
  paddingGrupo: { top: number; left: number; bottom: number; right: number };
  /** Lado de la caja del icono y margen entre el icono y el borde del Nodo. */
  iconoLado: number;
  margenIcono: number;
  /** Linea base del titulo de un Grupo abierto y del control de colapso, desde el borde superior. */
  baseDeTitulo: number;
  /** Distancia del control de colapso al borde derecho. */
  margenDeControl: number;
  /** Tamano de texto respecto al del Tema. */
  escalaEtiqueta: number;
  escalaAtributo: number;
  escalaCardinalidad: number;
  /** Holgura horizontal y relacion alto/tamano de la caja de una etiqueta de Arista. */
  holguraDeEtiqueta: number;
  altoDeEtiqueta: number;
}

const TAMANO_DE_TEXTO_POR_DEFECTO = 14;

/** Tamano de texto en px del Tema (`tokens.fontSize`, p. ej. `"16px"`); 14 si falta. */
function tamanoDeTexto(fontSize: string | undefined): number {
  const declarado = Number.parseFloat(fontSize ?? '');
  return Number.isFinite(declarado) && declarado > 0 ? declarado : TAMANO_DE_TEXTO_POR_DEFECTO;
}

export function metricasDe(tema: Tema): Metricas {
  const resuelto = resolverTema(tema);
  const fontSize = tamanoDeTexto(resuelto.tokens.fontSize);
  // Solo la etiqueta de Arista cuenta en las Metricas: trazos y marcadores son pintura.
  const etiqueta = resuelto.arista.etiqueta?.props as { scale?: number; pad?: number } | undefined;
  const proporcional = !/mono/i.test(resuelto.fonts.body);
  return {
    fontSize,
    factorDeAncho: proporcional ? 0.55 : 0.6,
    fuentes: resuelto.fonts,
    slots: resuelto.nodo.slots,
    anchoMinimo: 120,
    paddingHorizontal: 32,
    margenDeTexto: 10,
    cabecera: Math.ceil(fontSize * 3.4),
    fila: Math.ceil(fontSize * 1.8),
    paddingGrupo: { top: 32, left: 16, bottom: 16, right: 16 },
    iconoLado: fontSize,
    margenIcono: 6,
    baseDeTitulo: fontSize + 8,
    margenDeControl: 12,
    escalaEtiqueta: etiqueta?.scale ?? 0.85,
    escalaAtributo: 0.85,
    escalaCardinalidad: 0.8,
    holguraDeEtiqueta: 2 * (etiqueta?.pad ?? 4),
    altoDeEtiqueta: 1.4,
  };
}

/**
 * Atributos que un Nodo muestra como filas: solo los de un Nodo hoja (un Grupo
 * abierto contiene Nodos; uno colapsado es hoja) y solo si el Tema lista el Slot
 * `attrs`. Una sola regla para `layout` (tamano y puertos) y `render` (dibujo).
 */
export function atributosVisibles(
  nodo: Pick<NodoResuelto, 'children' | 'attributes'>,
  metricas: Pick<Metricas, 'slots'>,
): readonly Atributo[] {
  return nodo.children.length === 0 && metricas.slots.includes('attrs') ? nodo.attributes : [];
}

/** Texto de la fila de un Atributo; `render` escribe lo mismo. */
export function textoDeAtributo(atributo: Atributo): string {
  return `${atributo.name}: ${atributo.type}`;
}

/** Caja de una etiqueta de Arista: texto a `escalaEtiqueta`, medido como el de los Nodos. */
export function tamanoDeEtiqueta(texto: string, metricas: Metricas): { width: number; height: number } {
  const tamano = metricas.fontSize * metricas.escalaEtiqueta;
  return {
    width: Math.ceil(texto.length * tamano * metricas.factorDeAncho) + metricas.holguraDeEtiqueta,
    height: Math.ceil(tamano * metricas.altoDeEtiqueta),
  };
}
