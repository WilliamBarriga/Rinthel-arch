/**
 * Estilo resuelto: la tabla de todo lo que el dibujo necesita saber de aspecto
 * (colores, fuentes, radios, trazos, halo, glifos y las Metricas
 * compartidas con `layout`). `resolverEstilo` lo deriva del Tema, valida el
 * contrato del Tema y es el unico sitio con defaults y numeros de dibujo: los
 * pintores solo leen de aqui. Pura.
 */
import type { Tema } from 'canonico';
import { estiloResuelto, resolverTema, tablaUniforme } from 'tema';
import type { CaraDeFuente, Estado, MedidasDeTexto, Metricas, Pintura, TablaDeMetricas } from 'tema';

/** Estado visual de un elemento dibujado, ademas de su aspecto normal. */
export type EstadoVisual = Estado;

/** Grosor minimo del anillo de foco: el nucleo lo garantiza, ningun Estilo lo quita (ADR 0008). */
export const ANILLO_DE_FOCO_MINIMO = 2;

/** Contorno de un estado: color, grosor, trazo discontinuo opcional y opacidad. En `atenuado` solo cuenta `opacidad`: la del elemento entero. */
export interface AspectoDeEstado {
  color: string;
  ancho: number;
  trazo?: string;
  opacidad: number;
}

export interface Estilo {
  /** Entrada base de las Metricas (Nodo sin Tipo); para un Nodo concreto, `metricasDeNodo(tabla, tipo)`. */
  metricas: Metricas;
  /** Metricas por elemento con las que se dibuja; deben ser las del layout. */
  tabla: TablaDeMetricas;
  /** Pintura del Tema: la pila de Capas de cada elemento, con los colores ya resueltos. */
  pintura: Pintura;
  fondo: string;
  texto: string;
  borde: string;
  fuenteCuerpo: string;
  fuenteMono: string;
  /** Caras de fuente del Workspace que usa el Tema (`@font-face`); vacio si el consumidor no dio archivos. */
  caras: CaraDeFuente[];
  /** Color de los avisos de error del chrome: el token `error` del Tema o, si falta, un rojo por defecto. */
  colorDeError: string;
  /** Nombre de Paleta -> valor. */
  paleta: Record<string, string>;
  nodo: {
    radio: number;
    relleno: string;
    /** `stroke-dasharray` de un Grupo colapsado. */
    trazoColapsado: string;
  };
  arista: {
    /** Margen entre la cardinalidad y el punto del extremo. */
    separacionCardinalidad: number;
    /** Cuanto se sube la cardinalidad de un segmento horizontal para no pisar la linea. */
    elevacionCardinalidad: number;
    /** Cuanto se sube la etiqueta sobre el segmento cuando no tiene caja propia. */
    elevacionEtiquetaSinCaja: number;
  };
  etiqueta: {
    /** Halo del color de fondo para leerse sobre las lineas. */
    halo: { color: string; ancho: number };
    /** Fraccion del tamano de texto que baja la linea base para centrar en la caja. */
    centradoVertical: number;
  };
  /** Contorno de cada estado visual; se dibuja con los mismos pintores que el resto. */
  estados: Record<EstadoVisual, AspectoDeEstado>;
  glifos: { expandido: string; colapsado: string };
}

/**
 * Estilo resuelto del Tema. Lanza si el Tema no cumple el contrato (`resolverTema`),
 * con un mensaje que nombra cada ruta que falta. `metricas` sustituye a las derivadas del Tema; `medidas`
 * son las medidas reales de texto con las que se calculo la Geometria (las Metricas del dibujo salen de ellas).
 */
export function resolverEstilo(tema: Tema, metricas?: Metricas, archivosDeFuente?: readonly string[], medidas?: MedidasDeTexto): Estilo {
  const { tokens, palette } = resolverTema(tema);
  const acento = palette['blue'] ?? tokens.foreground;
  // `COLOR` de una Capa es la variable `--trazo` que cada Nodo y Grupo fija con su color: una hoja sirve a todos los colores.
  const resuelto = estiloResuelto(tema, { colorEnVariable: '--trazo', ...(archivosDeFuente !== undefined && { archivosDeFuente }), ...(medidas !== undefined && { medidas }) });
  const tabla = metricas === undefined ? resuelto.tabla : tablaUniforme(metricas);
  return {
    metricas: tabla.base,
    tabla,
    pintura: resuelto.pintura,
    fondo: tokens.background,
    texto: tokens.foreground,
    borde: tokens.border,
    fuenteCuerpo: resuelto.fuentes.cuerpo,
    fuenteMono: resuelto.fuentes.mono,
    caras: resuelto.fuentes.caras,
    colorDeError: tokens['error'] ?? COLOR_DE_ERROR_POR_DEFECTO,
    paleta: palette,
    nodo: { radio: 6, relleno: tokens.background, trazoColapsado: '6 3' },
    arista: {
      separacionCardinalidad: 8,
      elevacionCardinalidad: 4,
      elevacionEtiquetaSinCaja: 4,
    },
    etiqueta: { halo: { color: tokens.background, ancho: 3 }, centradoVertical: 0.35 },
    estados: {
      seleccionado: { color: acento, ancho: 3, opacidad: 1 },
      hover: { color: acento, ancho: 2, opacidad: 0.6 },
      fantasma: { color: tokens.border, ancho: 2, trazo: '4 3', opacidad: 0.7 },
      'en-ruta': { color: acento, ancho: 3, opacidad: 1 },
      atenuado: { color: tokens.border, ancho: 0, opacidad: 0.3 },
      foco: { color: acento, ancho: 3, opacidad: 1 },
    },
    glifos: { expandido: '-', colapsado: '+' },
  };
}

/** Aspecto de un estado tal como se dibuja: el anillo de foco nunca baja del minimo ni es invisible. */
export function aspectoDeEstado(estilo: Estilo, estado: EstadoVisual): AspectoDeEstado {
  const aspecto = estilo.estados[estado];
  if (estado !== 'foco') return aspecto;
  return { ...aspecto, ancho: Math.max(aspecto.ancho, ANILLO_DE_FOCO_MINIMO), opacidad: 1 };
}

const COLOR_DE_ERROR_POR_DEFECTO = '#dc2626';
