/**
 * Animacion declarativa del Estilo resuelto compilada a CSS nativo (ADR 0008):
 * Movimientos y `keyframes` de Capa, `transition` entre estados, `enter`/`exit`
 * y `stagger`. Pura y determinista; sin dependencias ni reloj: el navegador
 * corre las animaciones. Solo se animan propiedades pintadas o componibles
 * (opacidad, color, `scale`/`rotate`/`translate`, sombra, filtro, posicion de
 * fondo), nunca las que cambian la caja: lo animado no provoca relayout.
 *
 * La politica de `prefers-reduced-motion` vive solo en `politicaReducida`: una
 * media query del sistema mas el atributo manual `data-reduced-motion="on"|"off"`
 * del contenedor, que decide aunque el sistema diga otra cosa. Un Tema declara
 * `reduced` por animacion pero no puede desactivar la politica.
 */
import { ESTADOS } from 'tema';
import type { Animacion, CapaPintada, KeyframesDeCapa, Movimiento, NombreDeEfecto, NombreDeMovimiento, PropiedadAnimable, Transicion } from 'tema';

import { huella, limpiarValorCss, num } from './elemento';
import type { Elemento } from './elemento';
import type { Estilo } from './estilo';

export type Declaraciones = Record<string, string>;
type Regla = [selector: string, declaraciones: Declaraciones];

/** Duracion y retardo del fundido al que reduced-motion reduce las entradas, salidas y transiciones. */
const FUNDIDO_CORTO = '100ms';

/** Cuerpo del `@keyframes` de cada Movimiento; `--rd-i` es la intensidad. Anadir uno al catalogo sin entrada aqui rompe el typecheck. */
const MOVIMIENTO_CSS: { readonly [M in NombreDeMovimiento]: string } = {
  flujo: 'to{background-position:var(--rd-flujo,40px) 0}',
  pulso: '0%,100%{opacity:1}50%{opacity:calc(1 - var(--rd-i,0.5) * 0.7)}',
  respiracion: '0%,100%{scale:1}50%{scale:calc(1 + var(--rd-i,0.5) * 0.08)}',
  giro: 'to{rotate:360deg}',
  aura: '0%,100%{box-shadow:0 0 0 0 transparent}50%{box-shadow:0 0 calc(var(--rd-i,0.5) * 24px) calc(var(--rd-i,0.5) * 4px) var(--trazo,currentColor)}',
};

/** Estado inicial (entrada) o final (salida) de cada efecto; la opacidad de salida la pone la visibilidad. */
const EFECTO_CSS: { readonly [E in NombreDeEfecto]: Declaraciones } = {
  fundido: { opacity: '0' },
  escala: { opacity: '0', scale: '0.85' },
  deslizar: { opacity: '0', translate: '0 12px' },
};

/** Declaracion CSS de cada propiedad animable de `keyframes`. */
const PROPIEDAD_CSS: { readonly [P in PropiedadAnimable]: (valor: number) => string } = {
  opacity: (v) => `opacity:${num(v)}`,
  scale: (v) => `scale:${num(v)}`,
  rotate: (v) => `rotate:${num(v)}deg`,
  'shift-x': (v) => `translate:${num(v)}px 0`,
  'shift-y': (v) => `translate:0 ${num(v)}px`,
  blur: (v) => `filter:blur(${num(v)}px)`,
};

/** Propiedades que `transition` interpola: solo pintura y composicion. */
const PROPIEDADES_DE_TRANSICION = ['opacity', 'color', 'background-color', 'border-color', 'box-shadow', 'filter', 'scale', 'rotate', 'translate'];

const CAJAS = '& .rd-nodo, & .rd-grupo';
const VISIBLES = '& .rd-nodo:not([data-oculto]), & .rd-grupo:not([data-oculto])';
const OCULTOS = '& .rd-nodo[data-oculto], & .rd-grupo[data-oculto]';

const bloque = (d: Declaraciones): string => Object.entries(d).map(([k, v]) => `${k}:${v}`).join(';');

/** Nombres de las Capas de la pila base con animacion propia o en algun estado. */
export function nombresAnimados(estilo: Estilo): Set<string> {
  const { capas, estados } = estilo.pintura.nodo;
  const conEstado = new Set(Object.values(estados).flatMap((pila) => (pila ?? []).filter((c) => c.animacion !== undefined).map((c) => c.nombre)));
  return new Set(capas.filter((c) => c.animacion !== undefined || conEstado.has(c.nombre)).map((c) => c.nombre));
}

/** Elementos de las Capas animadas, bajo el contenido (`encima` falso) o sobre el. */
export function pintarCapasAnimadas(estilo: Estilo, encima: boolean): Elemento[] {
  const animadas = nombresAnimados(estilo);
  return estilo.pintura.nodo.capas
    .filter((capa) => animadas.has(capa.nombre) && (capa.encima === true) === encima)
    .map((capa) => ({ tag: 'div', attrs: { class: 'rd-anim', 'data-anim': capa.nombre, 'aria-hidden': 'true' } }));
}

const ms = (valor: number): string => `${num(valor)}ms`;

interface Compilada {
  declaraciones: Declaraciones;
  bloques: string[];
}

function compilarAnimacion(animacion: Animacion): Compilada {
  const tiempo = `${ms(animacion.duracionMs)} ${animacion.easing} ${ms(animacion.retardoMs)} infinite`;
  if (animacion.clase === 'movimiento') return compilarMovimiento(animacion, tiempo);
  return compilarKeyframes(animacion, tiempo);
}

function compilarMovimiento(m: Movimiento, tiempo: string): Compilada {
  const nombre = `rd-mov-${m.movimiento}`;
  return {
    declaraciones: { animation: `${nombre} ${tiempo}`, ...(m.intensidad !== undefined && { '--rd-i': num(m.intensidad) }) },
    bloques: [`@keyframes ${nombre}{${MOVIMIENTO_CSS[m.movimiento]}}`],
  };
}

function compilarKeyframes(k: KeyframesDeCapa, tiempo: string): Compilada {
  const nombre = `rd-kf-${huella(JSON.stringify([k.propiedad, k.pasos]))}`;
  const pasos = k.pasos.map((paso) => `${num(paso.en)}%{${PROPIEDAD_CSS[k.propiedad](paso.valor)}}`).join('');
  return { declaraciones: { animation: `${nombre} ${tiempo}` }, bloques: [`@keyframes ${nombre}{${pasos}}`] };
}

const transicionCss = (t: Transicion): string => PROPIEDADES_DE_TRANSICION.map((p) => `${p} ${ms(t.duracionMs)} ${t.easing}`).join(',');

function reglasDeCapas(estilo: Estilo, declaracionesDeCapa: (capa: CapaPintada) => Declaraciones, salida: { reglas: Regla[]; bloques: string[] }): void {
  const { capas, estados } = estilo.pintura.nodo;
  const animadas = nombresAnimados(estilo);
  const emitidos = new Set<string>();
  const anadir = (c: Compilada): void => {
    for (const b of c.bloques) if (!emitidos.has(b)) (emitidos.add(b), salida.bloques.push(b));
  };
  for (const capa of capas.filter((c) => animadas.has(c.nombre))) {
    const selector = `& .rd-anim[data-anim="${capa.nombre.replace(/[^\w-]/g, '')}"]`;
    const propia = capa.animacion === undefined ? undefined : compilarAnimacion(capa.animacion);
    if (propia !== undefined) anadir(propia);
    salida.reglas.push([
      selector,
      {
        position: 'absolute',
        left: '0',
        top: '0',
        width: '100%',
        height: '100%',
        'box-sizing': 'border-box',
        'pointer-events': 'none',
        'border-radius': 'inherit',
        ...Object.fromEntries(Object.entries(declaracionesDeCapa(capa)).map(([k, v]) => [k, limpiarValorCss(v)])),
        ...propia?.declaraciones,
      },
    ]);
    for (const estado of ESTADOS) {
      const deEstado = estados[estado]?.find((c) => c.nombre === capa.nombre);
      if (deEstado === undefined || JSON.stringify(deEstado.animacion) === JSON.stringify(capa.animacion)) continue;
      const compilada = deEstado.animacion === undefined ? undefined : compilarAnimacion(deEstado.animacion);
      if (compilada !== undefined) anadir(compilada);
      salida.reglas.push([`& [data-estados~="${estado}"] ${selector.slice(2)}`, compilada?.declaraciones ?? { animation: 'none' }]);
    }
  }
}

function reglasDeElemento(estilo: Estilo, salida: { reglas: Regla[]; bloques: string[]; reducidas: Regla[] }): void {
  const animacion = estilo.pintura.nodo.animacion;
  if (animacion === undefined) return;
  const { transicion, transicionesDeEstado, entrada, salida: salidaDeNodo, escalonadoMs } = animacion;
  const destino = `${CAJAS}, & .rd-anim`;

  if (transicion !== undefined) {
    salida.reglas.push([destino, { transition: transicionCss(transicion) }]);
    salida.reducidas.push([destino, reducida(transicion.reducido, 'transition')]);
  }
  for (const estado of ESTADOS) {
    const t = transicionesDeEstado?.[estado];
    if (t === undefined) continue;
    const selector = `& .rd-nodo[data-estados~="${estado}"], & .rd-grupo[data-estados~="${estado}"], & [data-estados~="${estado}"] .rd-anim`;
    salida.reglas.push([selector, { transition: transicionCss(t) }]);
    salida.reducidas.push([selector, reducida(t.reducido, 'transition')]);
  }
  if (entrada !== undefined) {
    const retardo = `calc(${ms(entrada.retardoMs)} + var(--rd-n, 0) * ${ms(escalonadoMs ?? 0)})`;
    salida.bloques.push(`@keyframes rd-in-${entrada.efecto}{from{${bloque(EFECTO_CSS[entrada.efecto])}}}`);
    salida.reglas.push([VISIBLES, { animation: `rd-in-${entrada.efecto} ${ms(entrada.duracionMs)} ${entrada.easing} ${retardo} backwards` }]);
    if (entrada.reducido === 'fade' && entrada.efecto !== 'fundido') salida.bloques.push(`@keyframes rd-in-fundido{from{${bloque(EFECTO_CSS['fundido'])}}}`);
    salida.reducidas.push([VISIBLES, reducida(entrada.reducido, 'animation')]);
  }
  if (salidaDeNodo !== undefined) {
    const { efecto, duracionMs, easing, retardoMs } = salidaDeNodo;
    const propiedades = ['opacity', 'scale', 'translate'].map((p) => `${p} ${ms(duracionMs)} ${easing} ${ms(retardoMs)}`).join(',');
    const { opacity: _opacidad, ...final } = EFECTO_CSS[efecto];
    salida.reglas.push([OCULTOS, { transition: propiedades, ...final }]);
    salida.reducidas.push([OCULTOS, reducida(salidaDeNodo.reducido, 'transition')]);
  }
}

/** Declaraciones a las que reduced-motion reduce una animacion: un fundido corto o cambio instantaneo. */
function reducida(modo: 'fade' | 'instant', tipo: 'transition' | 'animation'): Declaraciones {
  if (modo === 'instant') return tipo === 'transition' ? { transition: 'none!important' } : { animation: 'none!important' };
  if (tipo === 'transition') return { transition: `opacity ${FUNDIDO_CORTO} linear!important` };
  return { 'animation-name': 'rd-in-fundido!important', 'animation-duration': `${FUNDIDO_CORTO}!important`, 'animation-delay': '0s!important' };
}

/**
 * Politica unica de reduced-motion. Con la preferencia del sistema (salvo que el
 * interruptor diga `off`) o con el interruptor en `on`: los Movimientos quedan en
 * su fotograma estatico y el resto se reduce segun el `reduced` de cada animacion.
 */
function politicaReducida(reglas: readonly Regla[]): string[] {
  if (reglas.length === 0) return [];
  const bajo = (prefijo: string): string =>
    reglas.map(([selector, d]) => `${selector.split(', ').map((s) => s.replace('&', prefijo)).join(',')}{${bloque(d)}}`).join('');
  return [`@media (prefers-reduced-motion:reduce){${bajo('&:not([data-reduced-motion="off"])')}}`, bajo('&[data-reduced-motion="on"]')];
}

/**
 * Reglas y bloques de la animacion del Estilo. Los bloques ya llevan `&` donde
 * va la clase de alcance; `declaracionesDeCapa` es el pintor de Primitivas.
 */
export function animacionDeHoja(estilo: Estilo, declaracionesDeCapa: (capa: CapaPintada) => Declaraciones): { reglas: Regla[]; bloques: string[] } {
  const salida = { reglas: [] as Regla[], bloques: [] as string[], reducidas: [] as Regla[] };
  reglasDeCapas(estilo, declaracionesDeCapa, salida);
  reglasDeElemento(estilo, salida);
  const hayCapas = nombresAnimados(estilo).size > 0;
  const reducidas: Regla[] = [...(hayCapas ? ([['& .rd-anim', { animation: 'none!important' }]] as Regla[]) : []), ...salida.reducidas];
  return { reglas: salida.reglas, bloques: [...salida.bloques, ...politicaReducida(reducidas)] };
}
