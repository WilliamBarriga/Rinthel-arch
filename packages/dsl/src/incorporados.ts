/**
 * Temas incorporados del nucleo (ADR 0008): `neutral` (el de una Vista sin Tema),
 * y `neutral-dark`. Estan escritos en el mismo DSL que cualquier Tema y se compilan con el Workspace como si fueran un archivo mas, por lo que
 * sirven de referencia y se pueden extender. Solo Primitivas simples, fuentes del
 * sistema (las del neutro base de `tema`), animacion minima (`hover`, `en-ruta`) y
 * cero warnings de contraste: texto 4.5:1 y partes graficas 3:1 sobre su fondo.
 * `alto-contraste` es el tercer incorporado, pero lo define `tema` (`TEMA_ALTO_CONTRASTE`, ya
 * resuelto) porque el visor lo necesita sin compilar; `resolverTemas` lo anade a la Fuente.
 */
import type { Documento, Theme } from './generated/ast';

/** Nombre con el que los issues y los `related` se refieren a este texto. */
export const ARCHIVO_INCORPORADOS = '<incorporados>';

export const FUENTE_INCORPORADOS = `// Tarjeta sobria clara: fondo de puntos, tarjeta blanca con borde fino, icono en caja del color del Tipo,
// titulo con la insignia del Tipo debajo y, en un Grupo cerrado, una tarjeta apilada con el contador.
// Todo color sale de la Paleta: neutral-dark solo cambia la Paleta.
theme neutral {
  palette {
    gray "#64748b"  blue "#2563eb"  green "#16a34a"  amber "#d97706"  red "#dc2626"  purple "#7c3aed"
    fondo "#f8fafc"  papel "#ffffff"  tinta "#0f172a"  marco "#878f9e"  linea "#808a9a"  sombra "#0f172a"
  }
  fonts { body "system-ui, sans-serif"  mono "ui-monospace, monospace" }
  tokens { background "#f8fafc"  foreground "#0f172a"  border "#878f9e" }
  page {
    layer puntos dots { color tinta/0.09  size 22  radius 1 }
    fixed
  }
  node {
    layer forma rect { radius 10 }
    layer relleno solid { color papel }
    layer borde border { color marco }
    layer sombra shadow { color sombra/0.06  y 2  blur 6 }
    slots column min-width 160 slack 26 {
      row gap 10 pad 10 min-height 54 {
        icon { variant box  side 28  radius 7  fill COLOR/0.14  border COLOR/0.45  color COLOR }
        column { title { weight 600  text-align start  leading 1.25  color tinta }  badge { alpha 0.6  tracking 0.02  color tinta } }
        counter { fill tinta/0.06  border tinta/0.18  color tinta }
      }
      attrs { color tinta }
    }
    state hover { layer borde { color COLOR }  transition 120ms ease-out }
    state en-ruta { layer borde { color COLOR  width 2  motion pulso 1.2s ease-in-out intensity 0.4 } }
    state atenuado { layer sombra none }
  }
  group {
    layer forma rect { radius 16 }
    layer relleno solid { color tinta/0.025 }
    layer borde dashed { color marco }
    slots row pad 18 pad-y 6 { title { dot COLOR  transform uppercase  size 0.8  tracking 0.1  alpha 0.7  weight 600  color tinta } }
    padding 12 20 20 20
    // Cerrado: la tarjeta del Nodo con otra desplazada debajo y una barra del color del Tipo a la izquierda.
    state collapsed {
      layer pila solid before forma { color papel  offset 5 5 }
      layer pila-borde border before forma { color marco  offset 5 5 }
      layer forma { radius 10 }
      layer relleno { color papel }
      layer borde border { color marco }
      layer acento shadow after borde { color COLOR  x 3  y 0  inset 1 }
    }
  }
  edge {
    layer linea line { color linea  width 1.2  corner round  radius 6 }
    start dot { size 4.4  color linea }
    end chevron { size 9 }
    label { scale 0.82  pad 10  pad-y 2.5  radius 50  fill papel  border tinta/0.16  color tinta }
  }
}

// La misma tarjeta sobre fondo oscuro (estilo Linear/Vercel).
theme neutral-dark extends neutral {
  palette {
    gray "#a1a1aa"  blue "#60a5fa"  green "#34d399"  amber "#fbbf24"  red "#f87171"  purple "#a78bfa"
    fondo "#09090b"  papel "#141417"  tinta "#fafafa"  marco "#5f5f69"  linea "#71717a"  sombra "#000000"
  }
  tokens { background "#09090b"  foreground "#fafafa"  border "#5f5f69" }
}
`;

/** Nombres de los Temas incorporados, en orden. */
export const NOMBRES_INCORPORADOS = ['neutral', 'neutral-dark', 'alto-contraste'] as const;


/** Temas del texto incorporado ya parseados; el llamador sabe parsear (`parse` es el de `compile`). */
export const temasIncorporados = (parse: (texto: string) => Documento): Theme[] => parse(FUENTE_INCORPORADOS).themes;
