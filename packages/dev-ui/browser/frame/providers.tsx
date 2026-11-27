/**
 * Dev UI providers: they build `useDevUi()`, the editor channel and the Theme preview, and wrap everything that is
 * drawn (frame, panels and canvas), so the canvas reaches the context like any panel. They own the chrome state
 * (islands, tabs, dialogs, notice), which the frame reads with `useChrome()` (only inside `frame/`).
 */
import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';
import type { ReactElement, ReactNode } from 'react';

import type { CanonicalForm } from 'canonical';
import type { HashStateProps } from 'shell';

import type { DevState } from '../../src/protocol';
import type { DevClient } from '../client';
import { commandsOf } from '../commands/registry';
import type { Platform } from '../commands/keys';
import { useShortcuts } from '../commands/use-shortcuts';
import { createWriting } from '../writing/writing';
import { siteText } from '../site';
import type { CodeSite } from '../site';
import { PreviewContext, usePreviewState } from '../themes/preview';
import { DevUiContextValue, EditorContext } from './context';
import type { EditorChannel, DevUiContext, DevUiDialog } from './context';
import type { IslandSide } from './limits';
import { availableIn, canWriteIn } from './mode';
import type { DevUiMode } from './mode';
import { RIGHT_TABS, LEFT_TABS } from './tabs';
import type { PanelTab } from './tabs';
import { useExpiry } from './use-expiry';
import { useIsland } from './use-island';
import type { Island } from './use-island';
import { useSize } from './use-size';

const NOTICE_DURATION_MS = 6000;

/** `dev` state arriving over SSE (`use-dev-state.ts`) and what does not depend on the View. */
interface DevUiBase {
  state: DevState | undefined;
  /** The last state received (the one writing uses), even if the render has not seen it yet. */
  current: () => DevState | undefined;
  receive: (state: DevState) => void;
  client: DevClient;
  platform: Platform;
  /** Last failure of what arrives outside the providers (malformed `estado` event, Components load): notified once per object. */
  failure?: DevUiFailure | undefined;
  /** `export`: read-only (`mode.ts`). */
  mode: DevUiMode;
}

/** One object per occurrence: the same message twice is notified twice. */
interface DevUiFailure {
  message: string;
}

/** Chrome state the frame draws. */
interface FrameChrome {
  islands: Record<IslandSide, Island>;
  /** The tabs of each island in this mode. */
  available: Record<IslandSide, readonly PanelTab[]>;
  tabs: Record<IslandSide, string>;
  chooseTab(side: IslandSide, tab: string): void;
  dialog: DevUiDialog | undefined;
  /** Dialogs opened at least once: they stay mounted (Base UI closes them and returns the focus). */
  loaded: ReadonlySet<DevUiDialog>;
  closeDialog(opened: boolean): void;
  notice: string | undefined;
  /** `ref` of the portals element inside `.ui-chrome`. */
  onPortalsMount(node: HTMLElement | null): void;
}

interface ProvidersProps extends DevUiBase {
  /** Without a Source (the Workspace never compiled) there is no View nor Selection. */
  source?: CanonicalForm;
  /** The active View, the Selection and the path, which live in the hash. */
  hashProps?: HashStateProps;
  /** The frame (with the canvas, if there is a Source). */
  children: ReactNode;
}

const ChromeContext = createContext<FrameChrome | undefined>(undefined);

/** The chrome state the frame draws. */
export function useChrome(): FrameChrome {
  const chrome = useContext(ChromeContext);
  if (chrome === undefined) throw new Error('useChrome fuera de <ProveedoresDelEstudio>');
  return chrome;
}

/** The visible reason why there are no Gestures (the first error of the state), or `undefined`. */
function reasonWithoutGestures(state: DevState | undefined): string | undefined {
  const error = state?.issues.find((i) => i.severity === 'error');
  return error === undefined ? undefined : `Gestures disabled: the text does not compile (${siteText(error)} ${error.message})`;
}

/** The tabs of each island available in `mode`. */
function tabsOf(mode: DevUiMode): Record<IslandSide, readonly PanelTab[]> {
  return { izquierda: availableIn(LEFT_TABS, mode), derecha: availableIn(RIGHT_TABS, mode) };
}

export function DevUiProviders({ state, current, receive, client, platform, failure, mode, source, hashProps, children }: ProvidersProps): ReactElement {
  const size = useSize();
  const measures = { width: size.width, height: size.height };
  const left = useIsland({ side: 'izquierda', id: 'ui-isla-izquierda', name: 'left panel', canvas: measures, initialWidth: 280 });
  const right = useIsland({ side: 'derecha', id: 'ui-isla-derecha', name: 'right panel', canvas: measures, initialWidth: 400 });
  const islands: Record<IslandSide, Island> = { izquierda: left, derecha: right };
  const available = useMemo(() => tabsOf(mode), [mode]);
  const [tabs, setTabs] = useState<Record<IslandSide, string>>(() => ({ izquierda: available.izquierda[0]?.id ?? '', derecha: available.derecha[0]?.id ?? '' }));
  const [portals, setPortals] = useState<HTMLElement | null>(null);
  const [dialog, setDialog] = useState<DevUiDialog>();
  // A dialog loads (separate chunk) the first time it opens and stays mounted from then on.
  const [loaded, setLoaded] = useState<ReadonlySet<DevUiDialog>>(() => new Set());
  if (dialog !== undefined && !loaded.has(dialog)) setLoaded(new Set([...loaded, dialog]));
  const [codeSite, setCodeSite] = useState<CodeSite>();
  const [notice, notify] = useState<string>();
  useExpiry(notice === undefined ? undefined : NOTICE_DURATION_MS, () => notify(undefined), notice);
  useEffect(() => {
    if (failure !== undefined) notify(failure.message);
  }, [failure]);
  const saved = useRef(new Set<() => Promise<void>>());

  const chooseTab = (side: IslandSide, tab: string): void => setTabs((p) => ({ ...p, [side]: tab }));
  /** A tab that does not exist in this mode (Details in an export) is ignored. */
  const openTab = (side: IslandSide, tab: string): void => {
    if (!available[side].some(({ id }) => id === tab)) return;
    islands[side].show();
    chooseTab(side, tab);
  };
  const flushSave = useCallback(async (): Promise<void> => {
    await Promise.all([...saved.current].map((save) => save()));
  }, []);
  const write = useMemo(() => createWriting({ client, current, receive, notify, flushSave }), [client, current, receive, flushSave]);
  const withoutGestures = useMemo(() => reasonWithoutGestures(state), [state]);

  const context: DevUiContext = {
    state: state,
    source: source,
    client: client,
    view: hashProps?.view,
    selection: hashProps?.selected ?? null,
    goToView: (view) => hashProps?.onPathChange([view]),
    goToStep: (step) => hashProps?.onStepChange(step),
    select: (id) => hashProps?.onSelect(id),
    openTab: openTab,
    toggleIsland: (side) => islands[side].toggle(),
    reasonWithoutGestures: withoutGestures,
    notify: notify,
    write: write,
    openDialog: setDialog,
    openCode: (site) => {
      openTab('izquierda', 'codigo');
      openTab('derecha', 'issues');
      if (site !== undefined) setCodeSite(site);
    },
    flushSave: flushSave,
    platform: platform,
    portals: portals,
    mode: mode,
    canWrite: canWriteIn(mode),
  };
  const editorChannel = useMemo<EditorChannel>(
    () => ({
      site: codeSite,
      registerSave(save) {
        saved.current.add(save);
        return () => saved.current.delete(save);
      },
    }),
    [codeSite],
  );
  const preview = usePreviewState(hashProps?.view);
  useShortcuts(useMemo(() => commandsOf(mode), [mode]), context);

  const chrome: FrameChrome = {
    islands: islands,
    available: available,
    tabs: tabs,
    chooseTab: chooseTab,
    dialog: dialog,
    loaded: loaded,
    closeDialog: (opened) => {
      if (!opened) setDialog(undefined);
    },
    notice: notice,
    onPortalsMount: setPortals,
  };
  return (
    <DevUiContextValue.Provider value={context}>
      <EditorContext.Provider value={editorChannel}>
        <PreviewContext.Provider value={preview}>
          <ChromeContext.Provider value={chrome}>{children}</ChromeContext.Provider>
        </PreviewContext.Provider>
      </EditorContext.Provider>
    </DevUiContextValue.Provider>
  );
}
