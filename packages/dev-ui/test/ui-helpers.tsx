/** Mounting of the `dev` app over `inMemoryDev` (real Session, fake transport) and pointer helpers for jsdom. */
import { configure, fireEvent, render, screen, waitFor } from '@testing-library/react';

import { layoutView } from 'layout';
import { browserHash } from 'shell';
import type { LayoutAdapter } from 'shell';

import { canvasHelpers } from '../../../tests/helpers/canvas';
import { inMemoryDev } from '../src/contract';
import { captureExport } from '../src/export';
import type { ExportData } from '../src/export';
import { exportProps } from '../browser/export/props';
import type { TestCode, InMemoryDev } from '../src/contract';
import { DevUi } from '../browser/dev-ui';
import type { Platform } from '../browser/commands/keys';

// jsdom does not measure text ranges: CodeMirror asks for them when drawing the cursor and the selection. No geometry
// (empty boxes); marker position and scroll are tested in Chromium.
if (typeof Range !== 'undefined' && !('getClientRects' in Range.prototype)) {
  const empty = { x: 0, y: 0, width: 0, height: 0, top: 0, left: 0, right: 0, bottom: 0, toJSON: () => ({}) };
  Object.assign(Range.prototype, { getClientRects: () => Object.assign([], { item: () => null }), getBoundingClientRect: () => empty });
}

// The first Geometry goes through a cold ELK (more than 1 s on a loaded machine).
configure({ asyncUtilTimeout: 15_000 });

/** The real layout (the Worker's in the browser), for the Views whose Geometry has not arrived from the server yet. */
export const realLayout: LayoutAdapter = (view, theme, measures) => layoutView(view, theme, { ...(measures !== undefined && { measures }) });

export interface MountOptions {
  hash?: string;
  platform?: Platform;
  /** Files of `--theme-path` (read only). */
  themes?: Record<string, string>;
  /** Initial text of `.diagrams/activity.jsonl`. */
  activity?: string;
  /** Themes with code already compiled (Components and `/components.js` bundle). */
  code?: TestCode;
  /** Answer to the confirmation to load code; rejects it by default. */
  confirm?: (message: string) => boolean;
  /** Wraps the fake's `fetch` (to annotate requests or inject network failures). */
  wrapFetch?: (fakeFetch: typeof fetch) => typeof fetch;
  /** Wraps the fake's SSE factory (to retain events). */
  wrapEvents?: (fakeEvents: InMemoryDev['events']) => InMemoryDev['events'];
}

export async function mountDevUi(own: Record<string, string>, { hash = '', platform: platform = 'otras', themes, activity, code, confirm: confirm = () => false, wrapFetch: wrapFetch = (f) => f, wrapEvents: wrapEvents = (e) => e }: MountOptions = {}): Promise<{ dev: InMemoryDev; container: HTMLElement }> {
  window.history.replaceState(null, '', `/${hash}`);
  const dev = await inMemoryDev({ own, ...(themes !== undefined && { themes }), ...(activity !== undefined && { activity }), ...(code !== undefined && { code }) });
  const { container } = render(<DevUi fetch={wrapFetch(dev.fetch)} events={wrapEvents(dev.events)} hash={browserHash(window)} layout={realLayout} confirm={confirm} platform={platform} />);
  return { dev, container };
}

/**
 * The Dev UI in export mode: the data is captured from the in-memory `dev` (as `diagrams export` does from the real
 * one) and served by the read-only client.
 */
export async function mountExport(own: Record<string, string>, { hash = '', themes }: Pick<MountOptions, 'hash' | 'themes'> = {}): Promise<{ data: ExportData; container: HTMLElement }> {
  window.history.replaceState(null, '', `/${hash}`);
  const dev = await inMemoryDev({ own, ...(themes !== undefined && { themes }) });
  const data = await captureExport({ fetch: dev.fetch, readSource: () => undefined });
  await dev.close();
  const { container } = render(<DevUi {...exportProps(data)} hash={browserHash(window)} layout={realLayout} platform="otras" />);
  return { data, container };
}

/** Minimal Workspace of the app tests: two Nodes, one Edge and the View `mapa`. */
export const BASIC_DSL = `specification {
  node servicio
}

model {
  servicio api "API"
  servicio db "Base de datos"
  api -> db "lee"
}

view mapa {
  type architecture
  include **
}
`;

export interface AnnotatedRequest {
  route: string;
  body: unknown;
}

/**
 * Annotates each POST the page sends to `dev` (only those to `route`, if given). `before(n)` runs with the number of
 * the annotated request before forwarding it to the fake, to provoke races.
 */
export function annotateRequests({ route, before }: { route?: string; before?: (n: number) => void } = {}): {
  posts: AnnotatedRequest[];
  /** Only the bodies, in the same order. */
  bodies: unknown[];
  wrapFetch: NonNullable<MountOptions['wrapFetch']>;
} {
  const posts: AnnotatedRequest[] = [];
  const bodies: unknown[] = [];
  return {
    posts,
    bodies: bodies,
    wrapFetch: (f) => (async (entry: string | URL | Request, init?: RequestInit) => {
      if (init?.method === 'POST' && (route === undefined || String(entry) === route)) {
        const body: unknown = JSON.parse(String(init.body));
        posts.push({ route: String(entry), body });
        bodies.push(body);
        before?.(posts.length);
      }
      return f(entry, init);
    }) as typeof fetch,
  };
}

/** The frame mounts again when the first Source arrives: waits for a canvas and chooses the tab `name`. */
export async function openTab(name: string): Promise<void> {
  await waitFor(() => {
    if (document.querySelector('.rd-vista[data-vista]') === null) throw new Error('No canvas');
  });
  fireEvent.click(await screen.findByRole('tab', { name }));
}

/** Waits until the canvas of `view` has its layout. */
export const canvasReady = (container: HTMLElement, view: string): Promise<HTMLElement> =>
  waitFor(() => {
    const canvas = container.querySelector<HTMLElement>(`.rd-vista[data-vista="${view}"][data-layout="listo"]`);
    if (canvas === null) throw new Error(`The canvas of '${view}' is not ready`);
    return canvas;
  });

/** Click and double click at the center of a drawn Node; the only copy lives in `tests/helpers/canvas.ts`. */
export const { doubleClickNode: doubleClickOnNode, positionOf, pressNode } = canvasHelpers(fireEvent);
