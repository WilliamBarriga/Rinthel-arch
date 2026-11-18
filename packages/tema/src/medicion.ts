/**
 * Medicion de texto: `estimado` calcula el ancho por caracter; `medido` lo recibe como datos del visor.
 * El nivel y los hashes de fuente entran en la clave de estructura; los anchos no (dependen de textos y fuentes).
 */

export interface MedicionDeMetricas {
  nivel: 'estimado' | 'medido';
  /** Hash del archivo de cada familia declarada por el Tema; vacio al estimar. */
  fuentes: Record<string, string>;
}

/** Serializable: viaja al Worker de layout. */
export interface MedidasDeTexto {
  nivel: 'medido';
  fuentes: Record<string, string>;
  /** Ancho en px por `claveDeTexto(familia, tamano, texto)`. */
  anchos: Record<string, number>;
}

export interface TextoAMedir {
  familia: string;
  tamano: number;
  texto: string;
  /** `weight` del estilo; sin el, el normal. */
  peso?: number;
}

export const claveDeTexto = (familia: string, tamano: number, texto: string, peso?: number): string =>
  peso === undefined ? `${familia}|${tamano}|${texto}` : `${familia}|${peso}|${tamano}|${texto}`;

/** La medida si existe; si no, la estimacion por caracter (`factor` = ancho medio relativo al tamano). */
export function anchoDeTexto(
  origen: { anchos?: Readonly<Record<string, number>> | undefined; factorDeAncho: number },
  familia: string,
  tamano: number,
  texto: string,
  peso?: number,
): number {
  return origen.anchos?.[claveDeTexto(familia, tamano, texto, peso)] ?? texto.length * tamano * origen.factorDeAncho;
}

/** FNV-1a de 32 bits en hex, estable entre motores. */
export function hashDeFuente(bytes: Uint8Array): string {
  let h = 0x811c9dc5;
  for (const byte of bytes) h = Math.imul(h ^ byte, 0x01000193) >>> 0;
  return h.toString(16).padStart(8, '0');
}
