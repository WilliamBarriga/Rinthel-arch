/**
 * External Diffs in the page: `useExternalDiffs` (mounted by the frame with the active View) merges each one when the
 * state of its version arrives, schedules the end of the highlight, clears the index when a View is visited, and
 * notifies if the Theme of the active View changed. It does not move the View: "follow the agent" only resolves the
 * `target` of an Activity event. `CanvasHighlight` draws the halo (CSS over the canvas `data-id`/`data-edge`) and
 * announces it; `ExternalMark` is the dot of the index and the gallery.
 */
import { useEffect, useMemo, useRef } from 'react';
import type { ReactElement } from 'react';

import type { CollapseState, CanonicalForm } from 'canonical';

import type { DevClient } from '../client';
import { useExpiry } from '../frame/use-expiry';
import { useDiffs } from './diffs';
import { HIGHLIGHT_DURATION_MS, projectDiff, mergeDiff, expireHighlight, visitView } from './projection';

export interface ExternalDiffsOptions {
  client: DevClient;
  source: CanonicalForm;
  /** Version of the state being drawn. */
  version: number;
  view: string;
  state: CollapseState;
  step: number;
  notify(text: string): void;
  durationMs?: number;
}

/** Returns the canvas ids of the active View that are highlighted now. */
export function useExternalDiffs(options: ExternalDiffsOptions): string[] {
  const { client, source, version, view, state, step, durationMs: durationMs = HIGHLIGHT_DURATION_MS } = options;
  const { store, snapshot } = useDiffs(client);
  const live = useRef(options);
  live.current = options;

  const hasPending = snapshot.pending.some((d) => d.version <= version);
  useEffect(() => {
    if (!hasPending) return;
    const now = Date.now();
    for (const diff of store.takePending(version)) {
      const context = { view, state, step };
      let theme: string | undefined;
      store.update((r) => {
        const merged = mergeDiff(r, diff, { ...context, source, now, durationMs });
        theme = merged.viewTheme;
        return merged;
      });
      if (theme !== undefined) live.current.notify(`Theme ${theme} of this View changed externally`);
    }
    // Only when there are Diffs ready; the View and the Step are read from this render.
  }, [hasPending, version, store]);

  useEffect(() => store.update((r) => visitView(r, view)), [store, view]);

  const { canvas } = snapshot.highlight;
  useExpiry(canvas.length === 0 ? undefined : Math.min(...canvas.map((e) => e.to)) - Date.now(), () => store.update((r) => expireHighlight(r, Date.now())), canvas);

  return useMemo(
    () => (canvas.length === 0 ? [] : projectDiff(canvas.map((e) => e.element), source, { view, state, step }).canvas),
    [canvas, source, view, state, step],
  );
}

const asCssValue = (id: string): string => `"${id.replace(/["\\]/g, (c) => `\\${c}`).replace(/\n/g, '\\a ')}"`;

/** Halo over what is highlighted and its announcement (`status`). */
export function CanvasHighlight({ ids }: { ids: readonly string[] }): ReactElement {
  const css = ids.map((id) => `.ui-lienzo .rd-caja[data-id=${asCssValue(id)}], .ui-lienzo [data-edge=${asCssValue(id)}]`).join(',\n');
  return (
    <>
      {ids.length > 0 && <style data-resaltado-externo="">{`${css} { filter: drop-shadow(0 0 4px var(--ui-agente)) drop-shadow(0 0 10px var(--ui-agente-halo)); }`}</style>}
      <div role="status" aria-label="Canvas highlight" className="ui-solo-lector">
        <ul>
          {ids.map((id) => (
            <li key={id}>{id}</li>
          ))}
        </ul>
      </div>
    </>
  );
}

/** "External change" dot of the index and the gallery. */
export function ExternalMark(): ReactElement {
  return <span role="img" aria-label="external change" title="External change" className="ui-marca-externa" />;
}

/** Views marked in the index and Themes in the gallery (read only). */
export function useExternalMarks(client: DevClient): { views: ReadonlySet<string>; themes: ReadonlySet<string> } {
  const { highlight } = useDiffs(client).snapshot;
  return useMemo(() => ({ views: new Set(highlight.index), themes: new Set(highlight.themes) }), [highlight.index, highlight.themes]);
}
