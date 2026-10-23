/**
 * Determinismo de los efectos pintados (ADR 0008): mano alzada, giro y
 * decoracion salen de una semilla FNV-1a de 32 bits del id del elemento mezclado
 * con el nombre de la Capa. Nunca entran el tamano de la caja, el orden de
 * render ni la Vista, asi redimensionar o colapsar no cambia el trazo. El `seed
 * N` del Tema (token `seed`) se mezcla para "tirar de nuevo". Puro: sin azar ni reloj.
 */

/** FNV-1a de 32 bits (sin signo) sobre las unidades UTF-16 del texto. */
export function fnv1a(texto: string): number {
  let h = 0x811c9dc5;
  for (let i = 0; i < texto.length; i++) h = Math.imul(h ^ texto.charCodeAt(i), 0x01000193) >>> 0;
  return h;
}

/** Semilla de una Capa de un elemento; `semillaDelTema` (el `seed N`) la cambia si esta declarado. */
export function semillaDeCapa(idDeElemento: string, nombreDeCapa: string, semillaDelTema?: number): number {
  const clave = `${idDeElemento}\u0000${nombreDeCapa}`;
  return fnv1a(semillaDelTema === undefined ? clave : `${semillaDelTema}\u0000${clave}`);
}

/** PRNG mulberry32 sembrado una vez por Capa: devuelve numeros en [0, 1). */
export function crearPrng(semilla: number): () => number {
  let s = semilla >>> 0;
  return () => {
    s = (s + 0x6d2b79f5) >>> 0;
    let t = s;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** Primer sorteo de la Capa como giro en grados, en [-maximo, maximo] con dos decimales. */
export function giroDeCapa(semilla: number, maximo: number): number {
  const grados = Math.round((crearPrng(semilla)() * 2 - 1) * maximo * 100) / 100;
  return grados === 0 ? 0 : grados;
}
