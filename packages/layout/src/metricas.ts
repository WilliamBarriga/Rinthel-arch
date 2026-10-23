/**
 * Metricas: los numeros de espaciado y escala derivados del Tema que `layout`
 * usa para medir y `render` para dibujar. Un solo modulo, para que lo reservado
 * y lo dibujado no puedan divergir. Sin medir texto real (el layout corre en
 * Node y en Worker, sin DOM): el ancho se estima por caracter segun el tamano y
 * la familia de la fuente del Tema; una medicion real entraria aqui, como
 * adaptador de `metricasDe`.
 */
import { tamanoDeTexto } from 'canonico';
import type { Atributo, NodoResuelto, Tema } from 'canonico';

export interface Metricas {
  /** Tamano del texto del Tema. */
  fontSize: number;
  /** Ancho medio de un caracter, relativo al tamano. */
  factorDeAncho: number;
  /** Familias del Tema; solo para la clave de layout. */
  fuentes: Record<string, string>;
  /** Ancho minimo de un Nodo hoja. */
  anchoMinimo: number;
  /** Suma de los margenes izquierdo y derecho del texto de un Nodo hoja. */
  paddingHorizontal: number;
  /** Margen izquierdo del titulo y de los Atributos. */
  margenDeTexto: number;
  /** Alto de la cabecera (titulo) de un Nodo. */
  cabecera: number;
  /** Alto de cada fila de Atributo. */
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

export function metricasDe(tema: Tema): Metricas {
  const fontSize = tamanoDeTexto(tema);
  const proporcional = !/mono/i.test(tema.fonts['body'] ?? '');
  return {
    fontSize,
    factorDeAncho: proporcional ? 0.55 : 0.6,
    fuentes: tema.fonts,
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
    escalaEtiqueta: 0.85,
    escalaAtributo: 0.85,
    escalaCardinalidad: 0.8,
    holguraDeEtiqueta: 8,
    altoDeEtiqueta: 1.4,
  };
}

/** Centro vertical de la fila `indice` de Atributos, medido desde el borde superior del Nodo. */
export function yDeFila(metricas: Metricas, indice: number): number {
  return metricas.cabecera + (indice + 0.5) * metricas.fila;
}

/**
 * Atributos que un Nodo muestra como filas: solo los de un Nodo hoja (un Grupo
 * abierto contiene Nodos; uno colapsado es hoja). Una sola regla para `layout`
 * (tamano y puertos) y `render` (dibujo).
 */
export function atributosVisibles(nodo: Pick<NodoResuelto, 'children' | 'attributes'>): readonly Atributo[] {
  return nodo.children.length === 0 ? nodo.attributes : [];
}

/** Texto de la fila de un Atributo; `render` escribe lo mismo. */
export function textoDeAtributo(atributo: Atributo): string {
  return `${atributo.name}: ${atributo.type}`;
}

/** Tamano de un Nodo hoja: cabecera con el titulo y una fila por Atributo; cada texto se mide a la escala con que se dibuja. */
export function tamanoDeNodo(
  texto: string,
  metricas: Metricas,
  atributos: readonly Atributo[] = [],
): { width: number; height: number } {
  const { fontSize, factorDeAncho, escalaAtributo } = metricas;
  const delTitulo = texto.length * fontSize * factorDeAncho;
  const deAtributos = atributos.map((atributo) => textoDeAtributo(atributo).length * fontSize * escalaAtributo * factorDeAncho);
  const mayor = Math.max(delTitulo, ...deAtributos);
  return {
    width: Math.max(metricas.anchoMinimo, Math.ceil(mayor + metricas.paddingHorizontal)),
    height: metricas.cabecera + atributos.length * metricas.fila,
  };
}

/** Caja de una etiqueta de Arista: texto a `escalaEtiqueta`, medido como el de los Nodos. */
export function tamanoDeEtiqueta(texto: string, metricas: Metricas): { width: number; height: number } {
  const tamano = metricas.fontSize * metricas.escalaEtiqueta;
  return {
    width: Math.ceil(texto.length * tamano * metricas.factorDeAncho) + metricas.holguraDeEtiqueta,
    height: Math.ceil(tamano * metricas.altoDeEtiqueta),
  };
}
