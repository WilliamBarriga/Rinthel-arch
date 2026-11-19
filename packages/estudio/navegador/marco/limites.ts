/**
 * Limites del redimensionado de las islas laterales, sin DOM: los usa `useIsla` con el puntero y con el teclado.
 * `alto: null` es "lo que mida el contenido"; un arrastre vertical parte de `altoMedido` y fija px.
 */
export interface TamanoDeIsla {
  ancho: number;
  /** `null`: el alto del contenido. */
  alto: number | null;
}

export interface TamanoMedido extends TamanoDeIsla {
  /** Alto que ocupa hoy la isla en pantalla (el del contenido si `alto` es `null`). */
  altoMedido: number;
}

export type LadoDeIsla = 'izquierda' | 'derecha';
export type EjeDeAsa = 'horizontal' | 'vertical' | 'diagonal';

export interface Asa {
  lado: LadoDeIsla;
  eje: EjeDeAsa;
}

export interface Lienzo {
  ancho: number;
  alto: number;
}

export const LIMITES_DE_ISLA = {
  anchoMin: 220,
  anchoMax: 640,
  /** Una isla no pasa de esta fraccion del ancho del lienzo. */
  fraccionMax: 0.5,
  altoMin: 140,
  /** Hueco que queda bajo la isla mas alta. */
  margenInferior: 30,
  /** Paso de las flechas en el separador. */
  paso: 16,
} as const;

export interface Rango {
  min: number;
  max: number;
}

export function rangoDeIsla(lienzo: Lienzo): { ancho: Rango; alto: Rango } {
  const l = LIMITES_DE_ISLA;
  return {
    ancho: { min: l.anchoMin, max: Math.max(l.anchoMin, Math.min(l.anchoMax, Math.floor(lienzo.ancho * l.fraccionMax))) },
    alto: { min: l.altoMin, max: Math.max(l.altoMin, lienzo.alto - l.margenInferior) },
  };
}

const recortar = (valor: number, { min, max }: Rango): number => Math.min(max, Math.max(min, Math.round(valor)));

const mueveAncho = (eje: EjeDeAsa): boolean => eje !== 'vertical';
const mueveAlto = (eje: EjeDeAsa): boolean => eje !== 'horizontal';

/** El asa de la isla derecha esta en su borde izquierdo: mover a la derecha la estrecha. */
const signo = (lado: LadoDeIsla): number => (lado === 'izquierda' ? 1 : -1);

export function tamanoTrasArrastre(inicio: TamanoMedido, { dx, dy }: { dx: number; dy: number }, { lado, eje }: Asa, lienzo: Lienzo): TamanoDeIsla {
  const rango = rangoDeIsla(lienzo);
  return {
    ancho: mueveAncho(eje) ? recortar(inicio.ancho + signo(lado) * dx, rango.ancho) : inicio.ancho,
    alto: mueveAlto(eje) ? recortar((inicio.alto ?? inicio.altoMedido) + dy, rango.alto) : inicio.alto,
  };
}

/** Teclas del patron "window splitter" de WAI-ARIA; `undefined` si la tecla no es suya. */
export function tamanoPorTeclado(tecla: string, actual: TamanoMedido, { lado, eje }: Asa, lienzo: Lienzo): TamanoDeIsla | undefined {
  const rango = rangoDeIsla(lienzo);
  const { paso } = LIMITES_DE_ISLA;
  const alto = actual.alto ?? actual.altoMedido;
  const base = { ancho: actual.ancho, alto: actual.alto };
  if (eje === 'horizontal') {
    if (tecla === 'ArrowRight' || tecla === 'ArrowLeft') return { ...base, ancho: recortar(actual.ancho + signo(lado) * (tecla === 'ArrowRight' ? paso : -paso), rango.ancho) };
    if (tecla === 'Home') return { ...base, ancho: rango.ancho.min };
    if (tecla === 'End') return { ...base, ancho: rango.ancho.max };
    return undefined;
  }
  if (eje === 'vertical') {
    if (tecla === 'ArrowDown' || tecla === 'ArrowUp') return { ...base, alto: recortar(alto + (tecla === 'ArrowDown' ? paso : -paso), rango.alto) };
    if (tecla === 'Home') return { ...base, alto: rango.alto.min };
    if (tecla === 'End') return { ...base, alto: rango.alto.max };
  }
  return undefined;
}
