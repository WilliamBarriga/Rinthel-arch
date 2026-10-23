/**
 * Temas incorporados del nucleo (ADR 0008): `neutral` (el de una Vista sin Tema),
 * `neutral-dark` y `alto-contraste`. Estan escritos en el mismo DSL que cualquier
 * Tema y se compilan con el Workspace como si fueran un archivo mas, por lo que
 * sirven de referencia y se pueden extender. Solo Primitivas simples, fuentes del
 * sistema (las del neutro base de `tema`), animacion minima (`hover`, `en-ruta`) y
 * cero warnings de contraste: texto 4.5:1 y partes graficas 3:1 sobre su fondo.
 */
import type { Documento, Theme } from './generated/ast';

/** Nombre con el que los issues y los `related` se refieren a este texto. */
export const ARCHIVO_INCORPORADOS = '<incorporados>';

export const FUENTE_INCORPORADOS = `theme neutral {
  palette {
    gray "#6b7280"  blue "#2563eb"  green "#16a34a"  amber "#d97706"  red "#dc2626"  purple "#7c3aed"
    papel "#ffffff"  tinta "#1f2937"  linea "#6b7280"
  }
  tokens { background "#ffffff"  foreground "#1f2937"  border "#6b7280" }
  node {
    layer forma rect { radius 6 }
    layer relleno solid { color papel }
    layer borde border { color COLOR  width 2 }
    slots { title { weight 600  color tinta }  attrs { color tinta } }
    state hover { layer borde { color blue }  transition 120ms ease-out }
    state en-ruta { layer borde { color blue  motion pulso 1.2s ease-in-out intensity 0.4 } }
  }
  edge {
    layer linea line { color linea  width 1.5 }
    end arrow { size 8 }
    label { pad 4  fill papel }
  }
}

theme neutral-dark extends neutral {
  palette {
    gray "#9ca3af"  blue "#60a5fa"  green "#4ade80"  amber "#fbbf24"  red "#f87171"  purple "#a78bfa"
    papel "#1f2937"  tinta "#f3f4f6"  linea "#9ca3af"
  }
  tokens { background "#111827"  foreground "#f3f4f6"  border "#9ca3af" }
}

theme alto-contraste extends neutral {
  palette {
    gray "#404040"  blue "#0033cc"  green "#006400"  amber "#8a4b00"  red "#b00000"  purple "#5a1a9e"
    papel "#ffffff"  tinta "#000000"  linea "#000000"
  }
  tokens { background "#ffffff"  foreground "#000000"  border "#000000" }
  node {
    layer borde { width 3 }
    slots { title { weight 700  color tinta }  attrs { color tinta } }
  }
  edge { layer linea { width 2.5 } }
}
`;

/** Nombres de los Temas incorporados, en orden. */
export const NOMBRES_INCORPORADOS = ['neutral', 'neutral-dark', 'alto-contraste'] as const;

/** Temas del texto incorporado ya parseados; el llamador sabe parsear (`parse` es el de `compile`). */
export const temasIncorporados = (parse: (texto: string) => Documento): Theme[] => parse(FUENTE_INCORPORADOS).themes;
