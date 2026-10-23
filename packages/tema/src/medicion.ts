/**
 * Medicion de texto (ADR 0008): el ancho de un texto sale de un origen con dos
 * niveles. `estimado` (CLI, Workers sin DOM y pruebas) lo calcula por caracter;
 * `medido` (visor, tras `document.fonts.load`) llega como datos: una tabla de
 * anchos por (familia, tamano, texto) y el hash del archivo de cada fuente. Las
 * medidas son entrada del layout, nunca se leen del DOM aqui. El nivel y los
 * hashes entran en la clave de estructura; los anchos no (son funcion de los
 * textos, que ya entran, y de las fuentes, que entran por su hash).
 */

/** Origen de las medidas que viaja en las `Metricas` y en la clave de estructura. */
export interface MedicionDeMetricas {
  nivel: 'estimado' | 'medido';
  /** Hash del archivo de cada familia declarada por el Tema; vacio al estimar. */
  fuentes: Record<string, string>;
}

/** Medidas reales de texto, tomadas por un adaptador (el visor). Serializable: viaja al Worker de layout. */
export interface MedidasDeTexto {
  nivel: 'medido';
  fuentes: Record<string, string>;
  /** Ancho en px por `claveDeTexto(familia, tamano, texto)`. */
  anchos: Record<string, number>;
}

/** Un texto que el layout necesita medir. */
export interface TextoAMedir {
  familia: string;
  tamano: number;
  texto: string;
}

export const claveDeTexto = (familia: string, tamano: number, texto: string): string => `${familia}|${tamano}|${texto}`;

/** Ancho de `texto`: la medida si existe; si no, la estimacion por caracter (`factor` = ancho medio relativo al tamano). */
export function anchoDeTexto(
  origen: { anchos?: Readonly<Record<string, number>> | undefined; factorDeAncho: number },
  familia: string,
  tamano: number,
  texto: string,
): number {
  return origen.anchos?.[claveDeTexto(familia, tamano, texto)] ?? texto.length * tamano * origen.factorDeAncho;
}

/** Hash FNV-1a de 32 bits (hex) del contenido de un archivo de fuente: puro y estable entre motores. */
export function hashDeFuente(bytes: Uint8Array): string {
  let h = 0x811c9dc5;
  for (const byte of bytes) h = Math.imul(h ^ byte, 0x01000193) >>> 0;
  return h.toString(16).padStart(8, '0');
}
