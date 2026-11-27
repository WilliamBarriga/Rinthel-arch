/**
 * Geometry of the active View with a cache per structure: the adapter is only called for uncached states and the
 * seed (geometry from the build) costs no relayout. The cache stores the geometry without Pins; Pins are applied afterwards
 * synchronously, so moving a Pin does not call the adapter.
 */
import { useEffect, useRef, useState } from 'react';

import type { Geometry, Theme, ResolvedView } from 'canonical';
import { applyPinsToGeometry, structureKey, layoutKey } from 'layout';
import { metricsTable, textsToMeasure } from 'theme';
import type { TextMeasures } from 'theme';

import type { LayoutAdapter, TextMeasurer } from './interactive-view';

export interface Computation {
  view: ResolvedView;
  geometry: Geometry;
  /** Real text measures the Geometry was computed with; drawing places the Slots with them. */
  measures?: TextMeasures;
}

export interface GeometryInput {
  view: ResolvedView;
  theme: Theme;
  layout: LayoutAdapter;
  /** Real text measuring; if present, the layout waits for the measures and the key includes level and font hash. */
  measure?: TextMeasurer | undefined;
  /** Identity of the fonts the measurer uses (hash of their files): if it changes, text is measured again even if the texts are the same. */
  fontsKey?: string | undefined;
  /** Geometry of the View's default state (cached in the build), with the resolved View it belongs to. */
  seed?: Computation | undefined;
  onError?: ((error: Error) => void) | undefined;
  /** A new geometry arrives; `previous` is the one being shown. Called before showing it. */
  onArrive?: ((previous: Computation | undefined, latest: Computation) => void) | undefined;
}

const MAX_CACHE = 32;

/** Returns the latest current `Computation`. An adapter failure goes to `onError` or is thrown on render. */
export function useGeometry(input: GeometryInput): Computation | undefined {
  const { view, theme, layout, seed } = input;
  const [computation, setComputation] = useState<Computation>();
  const [failure, setFailure] = useState<Error>();
  const lastOne = useRef(input);
  lastOne.current = input;
  // Real measures: requested when the texts or the fonts change, and the layout waits for them.
  const texts = input.measure === undefined ? undefined : textsToMeasure(view, metricsTable(theme, view.type));
  const textsKey = texts === undefined ? undefined : JSON.stringify([input.fontsKey, texts]);
  const [measured, setMeasured] = useState<{ key: string; measures: TextMeasures }>();
  useEffect(() => {
    if (textsKey === undefined) return;
    let current = true;
    lastOne.current.measure!(texts!).then(
      (measures) => current && setMeasured({ key: textsKey, measures }),
      (error: unknown) => {
        if (!current) return;
        const e = error instanceof Error ? error : new Error(String(error));
        if (lastOne.current.onError === undefined) setFailure(e);
        else lastOne.current.onError(e);
      },
    );
    return () => {
      current = false;
    };
  }, [textsKey]);
  const measures = textsKey !== undefined && measured?.key === textsKey ? measured.measures : undefined;
  const waiting = textsKey !== undefined && measures === undefined;
  // Only what moves the layout (structure, texts, fonts, origin of the measures) repeats it; the palette does not.
  const table = metricsTable(theme, view.type, measures);
  const themeKey = layoutKey(view, theme, table);
  const baseKey = structureKey(view, theme, table);
  const shown = useRef<Computation | undefined>(undefined);
  const cache = useRef<{ lock: LayoutAdapter; map: Map<string, Geometry> } | undefined>(undefined);

  useEffect(() => {
    if (waiting) return;
    if (cache.current === undefined || cache.current.lock !== layout) cache.current = { lock: layout, map: new Map() };
    const map = cache.current.map;
    const key = baseKey;
    const show = (geometry: Geometry): void => {
      const computed = { view, geometry, ...(measures !== undefined && { measures }) };
      lastOne.current.onArrive?.(shown.current, computed);
      shown.current = computed;
      setComputation(computed);
    };

    const currentTheme = lastOne.current.theme;
    const receive = (base: Geometry): void => {
      map.delete(key);
      map.set(key, base);
      if (map.size > MAX_CACHE) map.delete(map.keys().next().value!);
      show(applyPinsToGeometry(view, base, currentTheme, table));
    };

    let current = true;
    const base = map.get(key);
    if (base !== undefined) {
      receive(base);
    } else if (seed !== undefined && measures === undefined && layoutKey(seed.view, theme) === themeKey) {
      show(seed.geometry);
    } else {
      layout(withoutPins(view), currentTheme, measures).then(
        (geometry) => {
          if (current) receive(geometry);
        },
        (error: unknown) => {
          if (!current) return;
          const e = error instanceof Error ? error : new Error(String(error));
          if (lastOne.current.onError === undefined) setFailure(e);
          else lastOne.current.onError(e);
        },
      );
    }
    return () => {
      current = false;
    };
  }, [view, themeKey, layout, seed, waiting]);

  if (failure !== undefined) throw failure;
  return computation;
}

/** The View without Pins: what the adapter is asked for, which only computes the ELK part. */
function withoutPins(view: ResolvedView): ResolvedView {
  switch (view.type) {
    case 'sequence':
      return view;
    case 'architecture':
    case 'flow':
    case 'er':
      if (view.overrides.every((o) => o.pin === undefined)) return view;
      return { ...view, overrides: view.overrides.map(({ pin: _pin, ...rest }) => rest) };
  }
}
