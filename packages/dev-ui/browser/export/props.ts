/** Props of `<DevUi>` in export mode from the embedded data (the page of the exported HTML and the jsdom tests). */
import type { ExportData } from '../../src/export';
import type { DevClient } from '../client';
import type { DevUiMode } from '../frame/mode';
import { createReadOnlyClient } from './read-only-client';

export interface ExportProps {
  client: DevClient;
  mode: DevUiMode;
  fontUrlOf: (route: string) => string;
  confirm: (message: string) => boolean;
}

/** A `data:` URL as a `blob:` URL (created once per path; the page never revokes them). */
function blobOf(dataUrl: string): string {
  const comma = dataUrl.indexOf(',');
  const kind = /^data:([^;,]*)/.exec(dataUrl)?.[1] ?? '';
  const binary = atob(dataUrl.slice(comma + 1));
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  return URL.createObjectURL(new Blob([bytes], { type: kind }));
}

/**
 * Fonts go to the viewer as `blob:` URLs: the `@font-face` sheet of `render` percent-encodes the `;` of a
 * `data:...;base64,` URL, which the browser then cannot decode. A font that could not be embedded gives an empty URL
 * (the viewer keeps its fallback font).
 */
function fontUrls(fonts: ExportData['fuentes']): (route: string) => string {
  const created = new Map<string, string>();
  return (route) => {
    const dataUrl = fonts[route];
    if (dataUrl === undefined) return '';
    let url = created.get(route);
    if (url === undefined) created.set(route, (url = blobOf(dataUrl)));
    return url;
  };
}

export function exportProps(data: ExportData): ExportProps {
  return {
    client: createReadOnlyClient(data),
    mode: 'export',
    fontUrlOf: fontUrls(data.fuentes),
    // The code of the Themes was trusted by whoever exported.
    confirm: () => true,
  };
}
