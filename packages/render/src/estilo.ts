/**
 * Estilo resuelto: la tabla de todo lo que el dibujo necesita saber de aspecto
 * (colores, fuentes, radios, trazos, halo, glifos y las Metricas
 * compartidas con `layout`). `resolverEstilo` lo deriva del Tema, valida el
 * contrato del Tema y es el unico sitio con defaults y numeros de dibujo: los
 * pintores solo leen de aqui. Pura.
 */
import type { Tema } from 'canonico';
import { estiloResuelto, metricasDe, resolverTema } from 'tema';
import type { Metricas, Pintura } from 'tema';

/** Estado visual de un elemento dibujado, ademas de su aspecto normal. */
export type EstadoVisual = 'seleccionado' | 'hover' | 'fantasma';

/** Contorno de un estado: color, grosor, trazo discontinuo opcional y opacidad. */
export interface AspectoDeEstado {
  color: string;
  ancho: number;
  trazo?: string;
  opacidad: number;
}

export interface Estilo {
  /** Metricas con las que se dibuja; deben ser las del layout. */
  metricas: Metricas;
  /** Pintura del Tema: la pila de Capas de cada elemento, con los colores ya resueltos. */
  pintura: Pintura;
  fondo: string;
  texto: string;
  borde: string;
  fuenteCuerpo: string;
  fuenteMono: string;
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
 * con un mensaje que nombra cada ruta que falta. `metricas` sustituye a las derivadas del Tema.
 */
export function resolverEstilo(tema: Tema, metricas?: Metricas): Estilo {
  const { fonts, tokens, palette } = resolverTema(tema);
  const acento = palette['blue'] ?? tokens.foreground;
  return {
    metricas: metricas ?? metricasDe(tema),
    pintura: estiloResuelto(tema).pintura,
    fondo: tokens.background,
    texto: tokens.foreground,
    borde: tokens.border,
    fuenteCuerpo: fonts.body,
    fuenteMono: fonts.mono,
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
    },
    glifos: { expandido: '-', colapsado: '+' },
  };
}

const COLOR_DE_ERROR_POR_DEFECTO = '#dc2626';
