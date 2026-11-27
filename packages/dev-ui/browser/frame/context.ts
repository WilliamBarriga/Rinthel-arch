/**
 * Contexts the island panels receive (`tabs.tsx`): `useDevUi()` gives the `dev` state, the client and the frame
 * actions (what the commands receive too); `useEditorChannel()` (Code only) and `useThemePreview()`
 * (`themes/preview.ts`, gallery only) go apart. `DevUiProviders` (`providers.tsx`) builds them and also wraps the
 * canvas. A new panel receives no props.
 */
import { createContext, useContext } from 'react';

import type { CanonicalForm } from 'canonical';

import type { DevState } from '../../src/protocol';
import type { DevClient } from '../client';
import type { Write } from '../writing/writing';
import type { Platform } from '../commands/keys';
import type { CodeSite } from '../site';
import type { IslandSide } from './limits';
import type { DevUiMode } from './mode';

export interface DevUiContext {
  /** `undefined` until the first state arrives. */
  state: DevState | undefined;
  /** Source of the last good Session being drawn; `undefined` if the Workspace never compiled. */
  source: CanonicalForm | undefined;
  client: DevClient;
  /** Active View (the hash's); `undefined` without a Source. */
  view: string | undefined;
  /** Element selected on the canvas (Node id or sequence element id). */
  selection: string | null;
  /** Changes the active View: a new entry in the browser history (`#view=<id>`). */
  goToView(view: string): void;
  /** Shows Step `step` of the active View (after `goToView`, of the new one). */
  goToStep(step: number): void;
  /** Selects an element of the active View (without opening panels). */
  select(id: string): void;
  /** Shows the island and activates one of its tabs (by registry `id`). */
  openTab(side: IslandSide, tab: string): void;
  /** Hides or brings back an island (Mod+B and Mod+J in `commands/registry.ts`). */
  toggleIsland(side: IslandSide): void;
  /**
   * With errors (e.g. an editor save that does not compile) the canvas keeps the last good Source and the Gestures are
   * disabled: they would write over a text that is not the drawn one. The visible reason, or `undefined` if there are Gestures.
   */
  reasonWithoutGestures: string | undefined;
  /** Ephemeral toast of the frame. */
  notify(text: string): void;
  /** The single path of the actions that write in `dev` (current version, 409 and notice): `writing/writing.ts`. */
  write: Write;
  /** Opens the Finder, the shortcuts help or the tour (frame dialogs). */
  openDialog(dialog: DevUiDialog): void;
  /** Opens the Code tab (and Issues); with `site`, the editor jumps to `file:line` (published by `useEditorChannel`). */
  openCode(site?: CodeSite): void;
  /**
   * Sends the pending editor save now and waits for it. Call it before undo, redo or a jump in the `dev` Undo history
   * (and on Mod+S), so as not to operate on a stale state.
   */
  flushSave(): Promise<void>;
  /** Browser platform: decides how keys are written (`Cmd` or `Ctrl`). */
  platform: Platform;
  /** Element inside `.ui-chrome` for the Base UI portals (`container`), with the chrome tokens. */
  portals: HTMLElement | null;
  /** `export`: read-only Dev UI written by `diagrams export` (`mode.ts`); `dev` otherwise. */
  mode: DevUiMode;
  /** Derived once from `mode` (`canWriteIn`): Gestures, Pin, opening Code. `false` in the export. */
  canWrite: boolean;
}

/** The Finder, the shortcuts help and the "Start here" tour (`tour/`). */
export type DevUiDialog = 'buscador' | 'ayuda' | 'tour';

export const DevUiContextValue = createContext<DevUiContext | undefined>(undefined);

const read = <T,>(context: T | undefined, name: string): T => {
  if (context === undefined) throw new Error(`${name} outside <DevUi>`);
  return context;
};

export const useDevUi = (): DevUiContext => read(useContext(DevUiContextValue), 'useDevUi');

/** Channel between the frame and the editor: only the Code tab reads it. */
export interface EditorChannel {
  /** Last `file:line` requested with `openCode`. */
  site: CodeSite | undefined;
  /** The editor publishes its `save` here (called by `flushSave`); returns the unsubscribe. */
  registerSave(save: () => Promise<void>): () => void;
}

export const EditorContext = createContext<EditorChannel | undefined>(undefined);
export const useEditorChannel = (): EditorChannel => read(useContext(EditorContext), 'useEditorChannel');
