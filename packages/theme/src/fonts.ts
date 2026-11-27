/**
 * Theme fonts: matches each `fonts` family with its Workspace files (`woff2|woff|ttf|otf`).
 * Fontsource-style names: `<kebab-family>-<subset>-<weight>-<style>.<ext>`, or `<Family>.<ext>` (400, normal).
 */

export interface FontFace {
  familia: string;
  peso: number;
  estilo: 'normal' | 'italic';
  ruta: string;
}

/** `clave` is the `fonts` entry (`body`, `mono`...). */
export interface MissingFont {
  clave: string;
  familia: string;
}

const GENERICS = new Set(['serif', 'sans-serif', 'monospace', 'cursive', 'fantasy', 'system-ui', 'ui-serif', 'ui-sans-serif', 'ui-monospace', 'ui-rounded', 'emoji', 'math', 'fangsong']);
const EXTENSION = /\.(woff2|woff|ttf|otf)$/i;
/** `fonts` entry that is not a family but the fallback stack. */
const FALLBACK = 'fallback';

const familiesOf = (value: string): string[] =>
  value
    .split(',')
    .map((f) => f.trim().replace(/["'\\]/g, ''))
    .filter((f) => f !== '');

const kebab = (family: string): string => family.toLowerCase().replace(/\s+/g, '-');
const isGeneric = (family: string): boolean => GENERICS.has(family.toLowerCase());
const escapeRegex = (text: string): string => text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

function faceOf(family: string, issuePath: string): FontFace | undefined {
  const file = issuePath.slice(issuePath.lastIndexOf('/') + 1);
  if (!EXTENSION.test(file)) return undefined;
  const name = file.replace(EXTENSION, '').toLowerCase();
  if (name === family.toLowerCase() || name === kebab(family)) return { familia: family, peso: 400, estilo: 'normal', ruta: issuePath };
  const parts = new RegExp(`^${escapeRegex(kebab(family))}-[a-z]+(?:-ext)?-(\\d{3})-(normal|italic)$`).exec(name);
  return parts === null ? undefined : { familia: family, peso: Number(parts[1]), estilo: parts[2] as 'normal' | 'italic', ruta: issuePath };
}

/** Faces sorted by family, weight and style, and the families without a file. CSS generics need no file. */
export function resolveFonts(fonts: Readonly<Record<string, string>>, files: readonly string[]): { caras: FontFace[]; faltantes: MissingFont[] } {
  const faces = new Map<string, FontFace>();
  const missing: MissingFont[] = [];
  const views = new Set<string>();
  for (const [key, value] of Object.entries(fonts)) {
    if (key === FALLBACK) continue;
    for (const family of familiesOf(value)) {
      if (isGeneric(family) || views.has(family)) continue;
      views.add(family);
      const ownOnes = files.flatMap((issuePath) => faceOf(family, issuePath) ?? []);
      if (ownOnes.length === 0) missing.push({ clave: key, familia: family });
      for (const face of ownOnes) faces.set(`${face.familia}|${face.peso}|${face.estilo}`, face);
    }
  }
  const sorted = [...faces.values()].sort((a, b) => a.familia.localeCompare(b.familia) || a.peso - b.peso || a.estilo.localeCompare(b.estilo) || a.ruta.localeCompare(b.ruta));
  return { caras: sorted, faltantes: missing };
}

/** Entries with a non-generic family and no fallback (neither `fallback` in the Theme nor a generic in its list). */
export function fontsWithoutFallback(fonts: Readonly<Record<string, string>>): string[] {
  if (FALLBACK in fonts) return [];
  return Object.entries(fonts).flatMap(([key, value]) => {
    const families = familiesOf(value);
    return families.some((f) => !isGeneric(f)) && !families.some(isGeneric) ? [key] : [];
  });
}

/** CSS `font-family` value: named families quoted, generics as is and the fallback last. */
export function fontStack(value: string, fallback?: string): string {
  const families = familiesOf(value);
  const stack = fallback === undefined || families.every(isGeneric) ? families : [...families, ...familiesOf(fallback).filter((f) => !families.includes(f))];
  return stack.map((f) => (isGeneric(f) ? f : `"${f}"`)).join(', ');
}
