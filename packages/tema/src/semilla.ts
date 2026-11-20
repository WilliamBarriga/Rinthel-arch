/**
 * Semillas de los efectos pintados: dependen solo del id del elemento, el nombre de la Capa y el
 * `seed` del Tema, nunca del tamano de la caja, el orden de render ni la Vista.
 */

/** Nucleo de FNV-1a de 32 bits (sin signo) sobre `longitud` unidades leidas con `unidad(i)`. */
export function fnv1aDeUnidades(longitud: number, unidad: (i: number) => number): number {
  let h = 0x811c9dc5;
  for (let i = 0; i < longitud; i++) h = Math.imul(h ^ unidad(i), 0x01000193) >>> 0;
  return h;
}

/** FNV-1a de 32 bits (sin signo) sobre las unidades UTF-16 del texto. */
export function fnv1a(texto: string): number {
  return fnv1aDeUnidades(texto.length, (i) => texto.charCodeAt(i));
}

export function semillaDeCapa(idDeElemento: string, nombreDeCapa: string, semillaDelTema?: number): number {
  const clave = `${idDeElemento}\u0000${nombreDeCapa}`;
  return fnv1a(semillaDelTema === undefined ? clave : `${semillaDelTema}\u0000${clave}`);
}

/** PRNG mulberry32: devuelve numeros en [0, 1). */
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
