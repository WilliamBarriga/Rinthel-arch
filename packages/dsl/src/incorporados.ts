/**
 * Temas incorporados `neutral` (el de una Vista sin Tema) y `neutral-dark`, en DSL y compilados con el Workspace
 * como un archivo mas. Invariante: cero warnings de contraste (texto 4.5:1, partes graficas 3:1).
 * `high-contrast` lo define `tema` (el visor lo necesita sin compilar); `resolverTemas` lo anade a la Fuente.
 */
import type { Documento, Theme } from './generated/ast';

/** Nombre con el que los issues y los `related` se refieren a este texto. */
export const ARCHIVO_INCORPORADOS = '<built-in>';

export const FUENTE_INCORPORADOS = `// Plain light card: dotted background, white card with a thin border, icon in a box of the Node kind color,
// title with the kind badge below and, on a collapsed Group, a stacked card with the counter.
// Every color comes from the Palette: neutral-dark only changes the Palette.
theme neutral {
  palette {
    gray "#64748b"  blue "#2563eb"  green "#16a34a"  amber "#d97706"  red "#dc2626"  purple "#7c3aed"
    background "#f8fafc"  paper "#ffffff"  ink "#0f172a"  frame "#878f9e"  stroke "#808a9a"  shadow "#0f172a"
  }
  fonts { body "system-ui, sans-serif"  mono "ui-monospace, monospace" }
  tokens { background "#f8fafc"  foreground "#0f172a"  border "#878f9e" }
  page {
    layer dots dots { color ink/0.09  size 22  radius 1 }
    fixed
  }
  node {
    layer shape rect { radius 10 }
    layer fill solid { color paper }
    layer border border { color frame }
    layer shadow shadow { color shadow/0.06  y 2  blur 6 }
    slots column min-width 160 slack 26 {
      row gap 10 pad 10 min-height 54 {
        icon { variant box  side 28  radius 7  fill COLOR/0.14  border COLOR/0.45  color COLOR }
        column { title { weight 600  text-align start  leading 1.25  color ink }  badge { alpha 0.6  tracking 0.02  color ink } }
        counter { fill ink/0.06  border ink/0.18  color ink }
      }
      attrs { color ink }
    }
    state hover { layer border { color COLOR }  transition 120ms ease-out }
    state on-path { layer border { color COLOR  width 2  motion pulse 1.2s ease-in-out intensity 0.4 } }
    state dimmed { layer shadow none }
    // In a sequence View the Lifeline header is more compact: icon and name, no badge or counter.
    diagram sequence {
      slots column min-width 130 slack 22 { row gap 8 pad 8 min-height 44 { icon  title } }
    }
    diagram er {
      slots column min-width 170 slack 22 { row gap 8 pad 10 min-height 38 { title } attrs }
    }
  }
  group {
    layer shape rect { radius 16 }
    layer fill solid { color ink/0.025 }
    layer border dashed { color frame }
    slots row pad 18 pad-y 6 { title { dot COLOR  transform uppercase  size 0.8  tracking 0.1  alpha 0.7  weight 600  color ink } }
    padding 12 20 20 20
    // Collapsed: the Node card with another one offset below and a bar of the kind color on the left.
    state collapsed {
      layer stack solid before shape { color paper  offset 5 5 }
      layer stack-border border before shape { color frame  offset 5 5 }
      layer shape { radius 10 }
      layer fill { color paper }
      layer border border { color frame }
      layer accent shadow after border { color COLOR  x 3  y 0  inset 1 }
    }
  }
  edge {
    layer line line { color stroke  width 1.2  corner round  radius 6 }
    start dot { size 4.4  color stroke }
    end chevron { size 9 }
    label { scale 0.82  pad 10  pad-y 2.5  radius 50  fill paper  border ink/0.16  color ink }
    diagram er { end arrow { size 12  color stroke } }
  }
  // ER tables: the header is only the name (no icon, badge or counter) and rows are split by a thin line.
  row {
    height 26
    layer background solid { color paper }
    layer separator stripe { color ink/0.08  side bottom  width 1 }
    alternate { layer background { color ink/0.03 } }
    name { color ink }
    type { color ink  alpha 0.65 }
  }
  // Sequence: a dashed Lifeline with a cross when destroyed; solid Messages with an arrow, async with a chevron, and
  // dashed reply and create; the activation, the Fragment and the Note as plain boxes.
  lifeline {
    layer line line { color stroke  width 1  style dashed }
    end cross { size 10 }
  }
  activation {
    layer shape rect { radius 2 }
    layer fill solid { color paper }
    layer border border { color COLOR }
    width 10
  }
  message {
    layer line line { color stroke  width 1.2  corner round  radius 6 }
    end arrow { size 9 }
    gap 32
    kind async { end chevron { size 9 } }
    kind reply { layer line { style dashed }  end chevron { size 9 } }
    kind create { layer line { style dashed }  end chevron { size 9 } }
    kind destroy { end arrow { size 9 } }
  }
  fragment {
    layer shape rect { radius 6 }
    layer fill solid { color paper }
    layer border border { color frame }
    operator { color ink  weight 600 }
    guard { color stroke }
    divider { color frame  width 1  style dashed }
    op ref { layer fill { color paper } }
    padding 16
  }
  note {
    layer fill solid { color amber/0.2 }
    layer border border { color amber  width 1 }
    text { color ink }
  }
}

// The same card on a dark background (Linear/Vercel style).
theme neutral-dark extends neutral {
  palette {
    gray "#a1a1aa"  blue "#60a5fa"  green "#34d399"  amber "#fbbf24"  red "#f87171"  purple "#a78bfa"
    background "#09090b"  paper "#141417"  ink "#fafafa"  frame "#5f5f69"  stroke "#71717a"  shadow "#000000"
  }
  tokens { background "#09090b"  foreground "#fafafa"  border "#5f5f69" }
}
`;

export const NOMBRES_INCORPORADOS = ['neutral', 'neutral-dark', 'high-contrast'] as const;


export const temasIncorporados = (parse: (texto: string) => Documento): Theme[] => parse(FUENTE_INCORPORADOS).themes;
