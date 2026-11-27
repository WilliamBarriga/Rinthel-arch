/**
 * Theme preview of the gallery: the canvas draws the active View with `previousTheme` without writing. The state lives
 * in the Dev UI providers (`usePreviewState`); the gallery changes it (`useThemePreview`) and the canvas applies it to
 * the drawn Source (`usePreviewedSource`).
 */
import { createContext, useContext, useEffect, useMemo, useState } from 'react';

import type { CanonicalForm, CachedGeometry } from 'canonical';

import type { DevClient } from '../client';
import type { Drawable } from '../canvas/geometries';
import { useReadByVersion } from '../frame/use-read-by-version';

export interface ThemePreview {
  /** `undefined` if there is no preview. */
  previousTheme: string | undefined;
  /** Previews the active View with another Theme, or goes back to its own with `undefined`. Changing the View discards it. */
  previewTheme(theme: string | undefined): void;
}

export const PreviewContext = createContext<ThemePreview | undefined>(undefined);

export function useThemePreview(): ThemePreview {
  const context = useContext(PreviewContext);
  if (context === undefined) throw new Error('usePrevisualizacionDeTema fuera de <Estudio>');
  return context;
}

/** The context value: the preview is discarded when the active View changes. */
export function usePreviewState(view: string | undefined): ThemePreview {
  const [previousTheme, previewTheme] = useState<string>();
  useEffect(() => previewTheme(undefined), [view]);
  return useMemo(() => ({ previousTheme, previewTheme }), [previousTheme]);
}

interface Drawn {
  source: CanonicalForm;
  geometries: Drawable['geometries'];
}

/**
 * With `theme`, the active View is drawn with that Theme: its `theme` is replaced in the Source and its Geometry is
 * requested with `?theme=` (until it arrives, the Worker computes it). Without `theme`, everything passes as is.
 */
export function usePreviewedSource(client: DevClient, version: number, { source, geometries }: Drawn, view: string, theme: string | undefined): Drawn {
  const reading = useReadByVersion<CachedGeometry>(
    client,
    version,
    theme === undefined
      ? undefined
      : {
          key: JSON.stringify([view, theme]),
          request: async (c) => {
            const r = await c.geometry(view, { theme });
            return r.ok ? { ok: true, value: r.geometry } : { ok: false, message: r.error ?? 'The geometry did not arrive' };
          },
        },
  );
  const previous = reading.kind === 'dato' ? reading.datum : undefined;
  return useMemo(() => {
    if (theme === undefined) return { source, geometries };
    const withTheme = { ...source, views: source.views.map((v) => (v.id === view ? { ...v, theme } : v)) };
    const { [view]: _fromOwnTheme, ...rest } = geometries;
    return { source: withTheme, geometries: previous === undefined ? rest : { ...rest, [view]: previous } };
  }, [source, geometries, view, theme, previous]);
}
