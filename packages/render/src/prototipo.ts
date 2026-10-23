/**
 * PROTOTIPO DESECHABLE (rama prototype/estetica): tres anatomias distintas de
 * dibujo (A tarjeta sobria, B glass, C compacta) detras de `estilo.variante`.
 * No es el diseno final: sirve para decidir como debe verse.
 */
import { sanearIcono } from 'canonico';
import type { IconProvider, NodoResuelto } from 'canonico';
import type { CajaDeNodo } from 'layout';

import { num } from './elemento';
import type { Elemento } from './elemento';
import type { Estilo } from './estilo';

type Punto = { x: number; y: number };
export type Variante = 'A' | 'B' | 'C' | 'D';

const el = (tag: string, attrs: Record<string, string | number>, hijos?: (Elemento | string)[]): Elemento => ({
  tag,
  attrs: Object.fromEntries(Object.entries(attrs).map(([k, v]) => [k, typeof v === 'number' ? num(v) : v])),
  ...(hijos !== undefined && { hijos }),
});

/** Ruta ortogonal con esquinas redondeadas de radio `r`. */
export function rutaRedondeada(p: readonly Punto[], r: number): string {
  let d = `M ${num(p[0]!.x)} ${num(p[0]!.y)}`;
  for (let i = 1; i < p.length - 1; i++) {
    const [a, b, c] = [p[i - 1]!, p[i]!, p[i + 1]!];
    const l1 = Math.hypot(b.x - a.x, b.y - a.y) || 1;
    const l2 = Math.hypot(c.x - b.x, c.y - b.y) || 1;
    const k = Math.min(r, l1 / 2, l2 / 2);
    d += ` L ${num(b.x - ((b.x - a.x) / l1) * k)} ${num(b.y - ((b.y - a.y) / l1) * k)} Q ${num(b.x)} ${num(b.y)} ${num(b.x + ((c.x - b.x) / l2) * k)} ${num(b.y + ((c.y - b.y) / l2) * k)}`;
  }
  const u = p[p.length - 1]!;
  return `${d} L ${num(u.x)} ${num(u.y)}`;
}

/** Icono inline escalado a `lado`, dentro de un grupo ya trasladado; coloreado con `color`. */
function icono(nodo: NodoResuelto, color: string, lado: number, x: number, y: number, icons?: IconProvider): Elemento[] {
  const crudo = nodo.icon === undefined ? undefined : icons?.resolve(nodo.icon);
  const svg = crudo === undefined ? undefined : sanearIcono(crudo);
  if (svg === undefined) return [];
  const dim = svg.replace(/<svg\b([^>]*)>/, (_, a: string) => `<svg width="${lado}" height="${lado}"${a.replace(/\s(?:width|height)\s*=\s*("[^"]*"|'[^']*')/g, '')}>`);
  return [{ tag: 'g', attrs: { 'data-icon': nodo.icon!, transform: `translate(${num(x)} ${num(y)})`, color }, html: dim }];
}

const ids = (c: string) => c.replace(/[^\w]/g, '');
const colores = (e: Estilo) => [...new Set([e.borde, ...Object.values(e.paleta)])];

/** Definiciones comunes: degradados, brillos y marcadores de la variante. */
export function defsDeVariante(e: Estilo, v: Variante, ancho: number, alto: number): Elemento[] {
  const defs: Elemento[] = [];
  if (v === 'B' || v === 'D') {
    defs.push(
      el('radialGradient', { id: 'p-fondo', cx: '25%', cy: '0%', r: '110%' }, [el('stop', { offset: 0, 'stop-color': '#1b1850' }), el('stop', { offset: 1, 'stop-color': e.fondo })]),
      el('linearGradient', { id: 'p-brillo', x1: '0', y1: '0', x2: '0', y2: '1' }, [el('stop', { offset: 0, 'stop-color': '#fff', 'stop-opacity': 0.09 }), el('stop', { offset: 1, 'stop-color': '#fff', 'stop-opacity': 0.01 })]),
      el('linearGradient', { id: 'p-borde', x1: '0', y1: '0', x2: '0', y2: '1' }, [el('stop', { offset: 0, 'stop-color': '#fff', 'stop-opacity': 0.28 }), el('stop', { offset: 1, 'stop-color': '#fff', 'stop-opacity': 0.05 })]),
    );
    for (const c of colores(e)) {
      defs.push(
        el('linearGradient', { id: `p-g-${ids(c)}`, x1: '0', y1: '0', x2: '1', y2: '1' }, [el('stop', { offset: 0, 'stop-color': c, 'stop-opacity': 0.3 }), el('stop', { offset: 1, 'stop-color': c, 'stop-opacity': 0.07 })]),
        el('filter', { id: `p-glow-${ids(c)}`, x: '-30%', y: '-50%', width: '160%', height: '200%' }, [el('feDropShadow', { dx: 0, dy: 0, stdDeviation: 7, 'flood-color': c, 'flood-opacity': 0.35 })]),
      );
    }
  }
  if (v === 'A' || v === 'C') {
    defs.push(el('pattern', { id: 'p-puntos', width: 22, height: 22, patternUnits: 'userSpaceOnUse' }, [el('circle', { cx: 1, cy: 1, r: 1, fill: e.texto, 'fill-opacity': v === 'A' ? 0.1 : 0.07 })]));
  }
  defs.push(
    el('marker', { id: 'p-flecha', viewBox: '0 0 10 10', refX: 8, refY: 5, markerWidth: v === 'A' ? 9 : 10, markerHeight: v === 'A' ? 9 : 10, markerUnits: 'userSpaceOnUse', orient: 'auto' }, [
      v === 'A'
        ? el('path', { d: 'M 1.5 1.5 L 8 5 L 1.5 8.5', fill: 'none', stroke: e.texto, 'stroke-opacity': 0.55, 'stroke-width': 1.4, 'stroke-linecap': 'round', 'stroke-linejoin': 'round' })
        : el('path', { d: 'M 0 1 L 9 5 L 0 9 z', fill: e.texto, 'fill-opacity': v === 'B' || v === 'D' ? 0.7 : 0.45 }),
    ]),
  );
  void ancho; void alto;
  return defs;
}

export function fondoDeVariante(e: Estilo, v: Variante, ancho: number, alto: number): Elemento[] {
  const base = el('rect', { width: ancho, height: alto, fill: v === 'B' || v === 'D' ? 'url(#p-fondo)' : e.fondo });
  return v === 'B' || v === 'D' ? [base] : [base, el('rect', { width: ancho, height: alto, fill: 'url(#p-puntos)' })];
}

const neutro = (e: Estilo, fill: number, stroke: number, w = 1): Record<string, string | number> => ({ fill: e.texto, 'fill-opacity': fill, stroke: e.texto, 'stroke-opacity': stroke, 'stroke-width': w });

function titulo(e: Estilo, x: number, y: number, texto: string, extra: Record<string, string | number> = {}): Elemento {
  return el('text', { x, y, 'font-family': e.fuenteCuerpo, 'font-size': e.metricas.fontSize, 'font-weight': 600, fill: e.texto, 'dominant-baseline': 'central', ...extra }, [texto]);
}
function pie(e: Estilo, x: number, y: number, texto: string, extra: Record<string, string | number> = {}): Elemento {
  return el('text', { x, y, 'font-family': e.fuenteCuerpo, 'font-size': e.metricas.fontSize * 0.74, fill: e.texto, 'fill-opacity': 0.5, 'dominant-baseline': 'central', 'letter-spacing': '0.02em', ...extra }, [texto]);
}

export function nodoDeVariante(e: Estilo, v: Variante, d: { nodo: NodoResuelto; caja: CajaDeNodo; trazo: string; texto: string; icons?: IconProvider; conAtributos: boolean }): Elemento[] {
  const { nodo, caja, trazo, texto, icons, conAtributos } = d;
  const { cabecera, fontSize } = e.metricas;
  const w = caja.width;
  const h = caja.height;
  const cy = conAtributos ? cabecera / 2 : h / 2;
  const tipo = nodo.type;
  if (v === 'A') {
    const lado = 28;
    return [
      el('rect', { width: w, height: h, rx: 10, fill: e.fondo }),
      el('rect', { width: w, height: h, rx: 10, ...neutro(e, 0.045, 0.13) }),
      el('rect', { x: 10, y: cy - lado / 2, width: lado, height: lado, rx: 7, fill: trazo, 'fill-opacity': 0.14, stroke: trazo, 'stroke-opacity': 0.45 }),
      ...(nodo.icon === undefined ? [el('circle', { cx: 10 + lado / 2, cy, r: 3.5, fill: trazo })] : icono(nodo, trazo, 15, 10 + (lado - 15) / 2, cy - 7.5, icons)),
      titulo(e, 10 + lado + 10, cy - 6, texto),
      pie(e, 10 + lado + 10, cy + 9, tipo),
      ...(conAtributos ? [el('line', { x1: 0, y1: cabecera, x2: w, y2: cabecera, stroke: e.texto, 'stroke-opacity': 0.1 })] : []),
    ];
  }
  if (v === 'B') {
    const c = ids(trazo);
    return [
      el('rect', { width: w, height: h, rx: 14, fill: e.fondo, filter: `url(#p-glow-${c})` }),
      el('rect', { width: w, height: h, rx: 14, fill: `url(#p-g-${c})` }),
      el('rect', { width: w, height: h, rx: 14, fill: 'url(#p-brillo)' }),
      el('rect', { x: 0.5, y: 0.5, width: w - 1, height: h - 1, rx: 13.5, fill: 'none', stroke: 'url(#p-borde)' }),
      el('circle', { cx: 24, cy, r: 13, fill: trazo, 'fill-opacity': 0.22 }),
      el('circle', { cx: 24, cy, r: 13, fill: 'none', stroke: trazo, 'stroke-opacity': 0.6 }),
      ...(nodo.icon === undefined ? [el('circle', { cx: 24, cy, r: 3.5, fill: trazo })] : icono(nodo, trazo, 15, 16.5, cy - 7.5, icons)),
      titulo(e, 46, cy - 6, texto),
      pie(e, 46, cy + 9, tipo),
    ];
  }
  if (v === 'D') {
    const c = ids(trazo);
    const r = h / 2;
    return [
      el('rect', { width: w, height: h, rx: r, fill: e.fondo, filter: `url(#p-glow-${c})` }),
      el('rect', { width: w, height: h, rx: r, fill: `url(#p-g-${c})` }),
      el('rect', { width: w, height: h, rx: r, fill: 'url(#p-brillo)' }),
      el('rect', { x: 0.5, y: 0.5, width: w - 1, height: h - 1, rx: r - 0.5, fill: 'none', stroke: 'url(#p-borde)' }),
      el('circle', { cx: r, cy, r: 9, fill: trazo, 'fill-opacity': 0.25 }),
      el('circle', { cx: r, cy, r: 4, fill: trazo }),
      titulo(e, r + 17, cy, texto, { 'font-weight': 500 }),
    ];
  }
  // C: chip compacto, un punto de color y solo el titulo.
  return [
    el('rect', { width: w, height: h, rx: h / 2, fill: e.fondo }),
    el('rect', { width: w, height: h, rx: h / 2, ...neutro(e, 0.06, 0.16) }),
    el('circle', { cx: h / 2, cy, r: 8, fill: trazo, 'fill-opacity': 0.2 }),
    el('circle', { cx: h / 2, cy, r: 4, fill: trazo }),
    titulo(e, h / 2 + 16, cy, texto, { 'font-weight': 500 }),
    el('text', { x: w - h / 2 + 2, y: cy, 'text-anchor': 'end', 'font-family': e.fuenteCuerpo, 'font-size': fontSize * 0.7, fill: e.texto, 'fill-opacity': 0.4, 'dominant-baseline': 'central' }, [conAtributos ? '' : '']),
  ];
}

export function grupoDeVariante(e: Estilo, v: Variante, d: { nodo: NodoResuelto; caja: CajaDeNodo; trazo: string; texto: string; icons?: IconProvider }): Elemento[] {
  const { caja, trazo, texto, nodo, icons } = d;
  const { w, h } = { w: caja.width, h: caja.height };
  const fs = e.metricas.fontSize;
  if (v === 'A') {
    return [
      el('rect', { width: w, height: h, rx: 16, ...neutro(e, 0.025, 0.14), 'stroke-dasharray': '2 5', 'stroke-linecap': 'round' }),
      el('circle', { cx: 18, cy: 20, r: 3, fill: trazo }),
      el('text', { x: 28, y: 20, 'font-family': e.fuenteCuerpo, 'font-size': fs * 0.8, 'font-weight': 600, 'letter-spacing': '0.1em', fill: e.texto, 'fill-opacity': 0.6, 'dominant-baseline': 'central' }, [texto.toUpperCase()]),
    ];
  }
  if (v === 'B') {
    const c = ids(trazo);
    const ancho = Math.min(w - 24, texto.length * fs * 0.62 + 44);
    return [
      el('rect', { width: w, height: h, rx: 20, fill: `url(#p-g-${c})`, 'fill-opacity': 0.5 }),
      el('rect', { x: 0.5, y: 0.5, width: w - 1, height: h - 1, rx: 19.5, fill: 'none', stroke: 'url(#p-borde)' }),
      el('rect', { x: 12, y: 8, width: ancho, height: 24, rx: 12, fill: trazo, 'fill-opacity': 0.18, stroke: trazo, 'stroke-opacity': 0.5 }),
      ...icono(nodo, trazo, 13, 20, 13.5, icons),
      el('text', { x: nodo.icon === undefined ? 22 : 40, y: 20, 'font-family': e.fuenteCuerpo, 'font-size': fs * 0.85, 'font-weight': 600, fill: e.texto, 'dominant-baseline': 'central' }, [texto]),
    ];
  }
  if (v === 'D') {
    const c = ids(trazo);
    const ancho = Math.min(w - 24, texto.length * fs * 0.62 + 40);
    return [
      el('rect', { width: w, height: h, rx: 24, fill: `url(#p-g-${c})`, 'fill-opacity': 0.45 }),
      el('rect', { x: 0.5, y: 0.5, width: w - 1, height: h - 1, rx: 23.5, fill: 'none', stroke: 'url(#p-borde)' }),
      el('rect', { x: 12, y: 9, width: ancho, height: 24, rx: 12, fill: trazo, 'fill-opacity': 0.2, stroke: trazo, 'stroke-opacity': 0.5 }),
      el('circle', { cx: 25, cy: 21, r: 3.5, fill: trazo }),
      el('text', { x: 36, y: 21, 'font-family': e.fuenteCuerpo, 'font-size': fs * 0.85, 'font-weight': 600, fill: e.texto, 'dominant-baseline': 'central' }, [texto]),
    ];
  }
  return [
    el('rect', { width: w, height: h, rx: 22, fill: trazo, 'fill-opacity': 0.07 }),
    el('circle', { cx: 20, cy: 20, r: 4, fill: trazo }),
    el('text', { x: 32, y: 20, 'font-family': e.fuenteCuerpo, 'font-size': fs * 0.9, 'font-weight': 700, fill: trazo, 'dominant-baseline': 'central' }, [texto]),
  ];
}

/** Ruta, punto de origen y capa de brillo de una Arista. */
export function aristaDeVariante(e: Estilo, v: Variante, puntos: readonly Punto[]): Elemento[] {
  const d = rutaRedondeada(puntos, v === 'A' ? 6 : v === 'B' ? 16 : 20);
  const brillo = v === 'B' || v === 'D';
  const p0 = puntos[0]!;
  const base = { fill: 'none', stroke: e.texto, 'stroke-linecap': 'round', 'stroke-linejoin': 'round' };
  if (v === 'A') {
    return [el('path', { d, ...base, 'stroke-opacity': 0.32, 'stroke-width': 1.2, 'marker-end': 'url(#p-flecha)' }), el('circle', { cx: p0.x, cy: p0.y, r: 2.2, fill: e.texto, 'fill-opacity': 0.5 })];
  }
  if (brillo) {
    return [
      el('path', { d, ...base, 'stroke-opacity': 0.08, 'stroke-width': 6 }),
      el('path', { d, ...base, 'stroke-opacity': 0.55, 'stroke-width': 1.5, 'marker-end': 'url(#p-flecha)' }),
      el('circle', { cx: p0.x, cy: p0.y, r: 3.5, fill: e.fondo, stroke: e.texto, 'stroke-opacity': 0.7 }),
    ];
  }
  return [el('path', { d, ...base, 'stroke-opacity': 0.28, 'stroke-width': 1.6, 'marker-end': 'url(#p-flecha)' }), el('circle', { cx: p0.x, cy: p0.y, r: 3, fill: e.texto, 'fill-opacity': 0.4 })];
}

/** Etiqueta de Arista: pildora con fondo (A, B) o texto con halo (C). */
export function etiquetaDeVariante(e: Estilo, v: Variante, texto: string, centro: Punto): Elemento[] {
  const fs = e.metricas.fontSize * 0.82;
  const ancho = texto.length * fs * 0.56 + 18;
  const alto = fs + 10;
  const t = el('text', { x: centro.x, y: centro.y, 'text-anchor': 'middle', 'dominant-baseline': 'central', 'font-family': e.fuenteCuerpo, 'font-size': fs, fill: e.texto, 'fill-opacity': v === 'C' ? 0.6 : 0.78 }, [texto]);
  if (v === 'C') return [el('text', { ...t.attrs, stroke: e.fondo, 'stroke-width': 4, 'paint-order': 'stroke', 'fill-opacity': 0.6 }, [texto])];
  return [
    el('rect', { x: centro.x - ancho / 2, y: centro.y - alto / 2, width: ancho, height: alto, rx: alto / 2, fill: e.fondo, stroke: e.texto, 'stroke-opacity': v === 'A' ? 0.16 : 0.22 }),
    t,
  ];
}
