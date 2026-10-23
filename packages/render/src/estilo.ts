/**
 * Estilo resuelto: la tabla de todo lo que el dibujo necesita saber de aspecto
 * (colores, fuentes, radios, trazos, flecha, halo, glifos y las Metricas
 * compartidas con `layout`). `resolverEstilo` lo deriva del Tema, valida el
 * contrato del Tema y es el unico sitio con defaults y numeros de dibujo: los
 * pintores solo leen de aqui. Pura.
 */
import { contratoDeTemaSchema } from 'canonico';
import type { Tema } from 'canonico';
import { metricasDe } from 'layout';
import type { Metricas } from 'layout';

export interface Estilo {
  /** Metricas con las que se dibuja; deben ser las del layout. */
  metricas: Metricas;
  fondo: string;
  texto: string;
  borde: string;
  fuenteCuerpo: string;
  fuenteMono: string;
  /** Nombre de Paleta -> valor. */
  paleta: Record<string, string>;
  nodo: {
    radio: number;
    relleno: string;
    /** `stroke-dasharray` de un Grupo colapsado. */
    trazoColapsado: string;
  };
  arista: {
    color: string;
    flecha: { ancho: number; alto: number; forma: string };
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
  glifos: { expandido: string; colapsado: string };
}

/**
 * Estilo resuelto del Tema. Lanza si el Tema no cumple el contrato (`contratoDeTemaSchema`),
 * con un mensaje que nombra cada ruta que falta. `metricas` sustituye a las derivadas del Tema.
 */
export function resolverEstilo(tema: Tema, metricas?: Metricas): Estilo {
  const contrato = contratoDeTemaSchema.safeParse(tema);
  if (!contrato.success) {
    const detalle = contrato.error.issues.map((i) => `${i.path.join('.')}: ${i.message}`).join('; ');
    throw new Error(`El Tema '${tema.name}' no cumple el contrato: ${detalle}`);
  }
  const { fonts, tokens } = contrato.data;
  return {
    metricas: metricas ?? metricasDe(tema),
    fondo: tokens.background,
    texto: tokens.foreground,
    borde: tokens.border,
    fuenteCuerpo: fonts.body,
    fuenteMono: fonts.mono,
    paleta: tema.palette,
    nodo: { radio: 6, relleno: tokens.background, trazoColapsado: '6 3' },
    arista: {
      color: tokens.border,
      flecha: { ancho: 8, alto: 8, forma: 'M 0 0 L 10 5 L 0 10 z' },
      separacionCardinalidad: 8,
      elevacionCardinalidad: 4,
      elevacionEtiquetaSinCaja: 4,
    },
    etiqueta: { halo: { color: tokens.background, ancho: 3 }, centradoVertical: 0.35 },
    glifos: { expandido: '-', colapsado: '+' },
  };
}
