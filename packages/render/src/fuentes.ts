/**
 * Fuentes incrustadas como `@font-face` con data URI: la pareja serializar /
 * hidratar que comparten el SVG exportado y el HTML autocontenido.
 */

/** Fuente que el export lleva dentro: nombre de familia y archivo en base64. */
export interface FuenteIncrustada {
  family: string;
  /** Tipo MIME del archivo, p. ej. `font/woff2`. */
  mime: string;
  /** Contenido del archivo de fuente en base64. */
  data: string;
}

/** Una regla `@font-face` por familia (la primera gana), separadas por salto de linea; `''` sin fuentes. */
export function serializarFuentes(fuentes: readonly FuenteIncrustada[]): string {
  const vistas = new Set<string>();
  const reglas: string[] = [];
  for (const { family, mime, data } of fuentes) {
    if (vistas.has(family)) continue;
    vistas.add(family);
    reglas.push(`@font-face{font-family:'${family.replace(/['\\]/g, '\\$&')}';src:url(data:${mime};base64,${data})}`);
  }
  return reglas.join('\n');
}

const REGLA = /@font-face\{font-family:'((?:[^'\\]|\\.)*)';src:url\(data:([^;]+);base64,([^)]*)\)\}/g;

/** Inverso de `serializarFuentes`: las fuentes que declara el CSS. */
export function hidratarFuentes(css: string): FuenteIncrustada[] {
  return [...css.matchAll(REGLA)].map(([, family = '', mime = '', data = '']) => ({
    family: family.replace(/\\(.)/g, '$1'),
    mime,
    data,
  }));
}
