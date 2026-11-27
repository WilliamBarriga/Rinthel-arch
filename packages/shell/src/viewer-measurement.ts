/**
 * Text measuring in the viewer with the real font: before measuring each text it waits for `document.fonts.load(font, text)`
 * (`ready` and `check` are not enough). The `@font-face` must already be in the page (`InteractiveView` declares it from `fontFiles`).
 */
import { CODES } from 'canonical';
import { textKey, fontStack, resolveFonts } from 'theme';
import type { TextMeasures, TextToMeasure } from 'theme';

import type { ViewerIssue } from './notices';

/**
 * Font hash of each family the Theme declares in `fonts` (the `hashes` input of `measureInViewer`):
 * those of its files, in order, from the hash of each Workspace file (`files`: path -> hash).
 * A family without a file does not appear.
 */
export function familyHashes(fonts: Readonly<Record<string, string>>, files: Readonly<Record<string, string>>): Record<string, string> {
  const byFamily = new Map<string, string[]>();
  for (const face of resolveFonts(fonts, Object.keys(files)).caras) byFamily.set(face.familia, [...(byFamily.get(face.familia) ?? []), files[face.ruta]!]);
  return Object.fromEntries([...byFamily].map(([family, hashes]) => [family, hashes.join('+')]));
}

/**
 * Notice (`theme-font-not-served`) of the non-generic families the Theme declares and the viewer cannot request
 * for lack of `fontUrl`; empty if all are generic. It is a viewer issue: its `file` is the Theme, without a link to the editor.
 */
export function unservedFontsNotice(fonts: Readonly<Record<string, string>>): ViewerIssue[] {
  const families = resolveFonts(fonts, []).faltantes.map((f) => f.familia);
  if (families.length === 0) return [];
  return [
    {
      code: CODES.W_THEME_FONT_NOT_SERVED,
      severity: 'warning',
      file: '(visor)',
      line: 1,
      column: 1,
      message: `The viewer received no fontUrl: ${families.join(', ')} is measured and painted with the fallback; provide fontUrl and fontFiles to use the declared font`,
      href: '#',
    },
  ];
}

export interface MeasurementOptions {
  /** Hash of the font file of each family the Theme declares. */
  hashes?: Record<string, string>;
  /** Waits until the CSS font (`"14px Inter"`) is ready for `text`. Defaults to `document.fonts.load`. */
  load?: (source: string, text: string) => Promise<unknown>;
  /** Width in px of `text` with the CSS font. Defaults to `CanvasRenderingContext2D.measureText`. */
  width?: (source: string, text: string) => number;
}

function widthWithCanvas(): (source: string, text: string) => number {
  const context = document.createElement('canvas').getContext('2d');
  if (context === null) throw new Error('The browser offers no 2D canvas to measure text');
  return (source, text) => {
    context.font = source;
    return context.measureText(text).width;
  };
}

/** Measures `texts` with the browser canvas, after loading the font of each one. */
export async function measureInViewer(texts: readonly TextToMeasure[], options: MeasurementOptions = {}): Promise<TextMeasures> {
  const load = options.load ?? ((source, text) => document.fonts.load(source, text));
  const width = options.width ?? widthWithCanvas();
  const widths: Record<string, number> = {};
  for (const { familia: family, tamano: fontSizeValue, texto: text, peso: weight } of texts) {
    const source = `${weight === undefined ? '' : `${weight} `}${fontSizeValue}px ${fontStack(family)}`;
    await load(source, text);
    widths[textKey(family, fontSizeValue, text, weight)] = width(source, text);
  }
  return { nivel: 'medido', fuentes: { ...options.hashes }, anchos: widths };
}
