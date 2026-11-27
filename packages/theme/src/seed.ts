/**
 * Seeds of the painted Effects: they depend only on the element id, the Layer name and the Theme
 * `seed`, never on the box size, the render order or the View.
 */

/** Core of 32-bit (unsigned) FNV-1a over `length` units read with `unit(i)`. */
export function fnv1aOfUnits(length: number, unit: (i: number) => number): number {
  let h = 0x811c9dc5;
  for (let i = 0; i < length; i++) h = Math.imul(h ^ unit(i), 0x01000193) >>> 0;
  return h;
}

/** 32-bit (unsigned) FNV-1a over the UTF-16 units of the text. */
export function fnv1a(text: string): number {
  return fnv1aOfUnits(text.length, (i) => text.charCodeAt(i));
}

export function layerSeed(elementId: string, layerName: string, themeSeed?: number): number {
  const key = `${elementId}\u0000${layerName}`;
  return fnv1a(themeSeed === undefined ? key : `${themeSeed}\u0000${key}`);
}

/** mulberry32 PRNG: returns numbers in [0, 1). */
export function createPrng(seed: number): () => number {
  let s = seed >>> 0;
  return () => {
    s = (s + 0x6d2b79f5) >>> 0;
    let t = s;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** First draw of the Layer as a rotation in degrees, in [-maximum, maximum] with two decimals. */
export function layerSpin(seed: number, maximum: number): number {
  const degrees = Math.round((createPrng(seed)() * 2 - 1) * maximum * 100) / 100;
  return degrees === 0 ? 0 : degrees;
}
