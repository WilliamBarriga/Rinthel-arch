/** `IconProvider` port (opaque key -> inline SVG, ADR 0002). An external brand set is another `IconProvider`. */
import type { NodeKind } from './schema';

/** Resolves an icon key to inline SVG; `undefined` if it does not know it. */
export interface IconProvider {
  resolve(key: string): string | undefined;
  keys(): string[];
}

const svg = (body: string): string =>
  `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">${body}</svg>`;

const GENERIC: Readonly<Record<string, string>> = {
  box: svg('<rect x="4" y="4" width="16" height="16" rx="2"/>'),
  server: svg('<rect x="3" y="4" width="18" height="6" rx="1"/><rect x="3" y="14" width="18" height="6" rx="1"/><path d="M7 7h.01M7 17h.01"/>'),
  database: svg('<ellipse cx="12" cy="5" rx="8" ry="3"/><path d="M4 5v14c0 1.7 3.6 3 8 3s8-1.3 8-3V5"/><path d="M4 12c0 1.7 3.6 3 8 3s8-1.3 8-3"/>'),
  user: svg('<circle cx="12" cy="8" r="4"/><path d="M4 21c0-4 3.6-7 8-7s8 3 8 7"/>'),
  queue: svg('<rect x="2" y="8" width="5" height="8"/><rect x="9.5" y="8" width="5" height="8"/><rect x="17" y="8" width="5" height="8"/>'),
  cloud: svg('<path d="M7 18a4 4 0 0 1-.5-8A6 6 0 0 1 18 9a4.5 4.5 0 0 1-.5 9z"/>'),
};

export function genericIcons(): IconProvider {
  return {
    resolve: (key) => GENERIC[key],
    keys: () => Object.keys(GENERIC),
  };
}

/** Key: name of the `.svg` without folder or extension (`icons/my-logo.svg` -> `my-logo`); with duplicates the first path in order wins. */
export function workspaceIcons(files: Readonly<Record<string, string>>): IconProvider {
  const byKey = new Map<string, string>();
  for (const path of Object.keys(files).sort()) {
    if (!path.endsWith('.svg')) continue;
    const key = path.slice(path.lastIndexOf('/') + 1, -'.svg'.length);
    if (!byKey.has(key)) byKey.set(key, files[path] as string);
  }
  return { resolve: (key) => byKey.get(key), keys: () => [...byKey.keys()] };
}

/** The first provider that knows the key wins; the following ones serve as fallback. */
export function combineIconProviders(...providers: IconProvider[]): IconProvider {
  return {
    resolve: (key) => providers.map((provider) => provider.resolve(key)).find((icon) => icon !== undefined),
    keys: () => [...new Set(providers.flatMap((provider) => provider.keys()))],
  };
}

/** Inline SVG of a Node kind's icon; `undefined` without icon or with an unknown key. */
export function resolveNodeTypeIcon(kind: NodeKind, icons: IconProvider): string | undefined {
  return kind.icon === undefined ? undefined : icons.resolve(kind.icon);
}

/** Key -> SVG map with sorted keys (deterministic), to send to the browser. */
export function serializeIcons(provider: IconProvider): Record<string, string> {
  return Object.fromEntries(
    provider.keys().sort().flatMap((key) => {
      const svg = provider.resolve(key);
      return svg === undefined ? [] : [[key, svg] as const];
    }),
  );
}

/** Inverse of `serializeIcons`: an `IconProvider` over the map. */
export function hydrateIcons(icons: Readonly<Record<string, string>>): IconProvider {
  return { resolve: (key) => icons[key], keys: () => Object.keys(icons) };
}

const ICON_TAGS = new Set(['svg', 'g', 'path', 'circle', 'ellipse', 'rect', 'line', 'polyline', 'polygon']);
const ICON_ATTRIBUTES = new Set([
  'xmlns', 'viewBox', 'width', 'height', 'd', 'cx', 'cy', 'r', 'rx', 'ry', 'x', 'y', 'x1', 'y1', 'x2', 'y2', 'points', 'transform',
  'fill', 'stroke', 'stroke-width', 'stroke-linecap', 'stroke-linejoin', 'stroke-dasharray', 'fill-rule', 'clip-rule', 'opacity',
  'fill-opacity', 'stroke-opacity',
]);
const SVG_TAG = /<(\/?)([a-zA-Z][\w-]*)((?:\s+[\w:-]+\s*=\s*"[^"<>]*")*)\s*(\/?)>/g;
const SVG_ATTRIBUTE = /\s+([\w:-]+)\s*=\s*"([^"]*)"/g;

/**
 * Allowlist of shape tags and double-quoted drawing attributes, with no `url(`, loose text,
 * `id` or references; strips the XML prolog and comments. `undefined` if anything falls outside: the exported SVG
 * must be self-contained.
 */
export function sanitizeIcon(svg: string): string | undefined {
  const clean = svg.replace(/^\s*<\?xml[^>]*\?>/, '').replace(/<!--[\s\S]*?-->/g, '').trim();
  if (clean.replace(SVG_TAG, '').trim() !== '') return undefined;
  for (const [, , name = '', attributes = ''] of clean.matchAll(SVG_TAG)) {
    if (!ICON_TAGS.has(name)) return undefined;
    for (const [, attribute = '', value = ''] of attributes.matchAll(SVG_ATTRIBUTE)) {
      if (!ICON_ATTRIBUTES.has(attribute) || /url\(|javascript:|&/i.test(value)) return undefined;
    }
  }
  return /^<svg[\s>]/.test(clean) ? clean : undefined;
}
