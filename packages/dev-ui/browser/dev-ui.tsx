/**
 * `<DevUi>`: the `dev` app. It only assembles: the client (with `fetch` and `events` injected; in tests, those of
 * `inMemoryDev`), the state over SSE, the Geometries and the Theme Components, and on top the Dev UI providers
 * (`frame/providers.tsx`), which wrap the frame and the canvas. The View lives in the hash (`#view=<id>`). Without a
 * Source (the Workspace never compiled) the canvas stays empty and the panels say so.
 */
import { useCallback, useEffect, useMemo, useState, useSyncExternalStore } from 'react';
import type { ReactElement } from 'react';

import { fontUrl as devFontUrl } from 'canonical';
import { deserializeState, useHashState } from 'shell';
import type { HashAdapter, LayoutAdapter, Navigation, HashStateProps } from 'shell';

import { createDevClient } from './client';
import type { DevClient, ClientDependencies } from './client';
import { platformOf } from './commands/keys';
import type { Platform } from './commands/keys';
import { clientHistory } from './history/visible-history';
import { createDevGeometries } from './canvas/geometries';
import type { Drawable, DevGeometries } from './canvas/geometries';
import { devUiHash } from './canvas/dev-ui-hash';
import { useDevUiCanvas } from './canvas/canvas';
import { Frame } from './frame/frame';
import type { DevUiMode } from './frame/mode';
import { DevUiProviders } from './frame/providers';
import { useDevState } from './frame/use-dev-state';
import { useComponents } from './themes/use-components';

/** The `dev` transport (`fetch` and SSE), or an already built client (the read-only one of an export). */
type DevUiTransport =
  | {
      fetch: typeof fetch;
      /** Factory of the SSE connection (`EventSource` in the browser, `inMemoryDev` in tests). */
      events: ClientDependencies['events'];
      client?: undefined;
    }
  | { client: DevClient; fetch?: undefined; events?: undefined };

export type DevUiProps = DevUiTransport & CommonProps;

interface CommonProps {
  /** The browser hash as is (`hashDelNavegador(window)`); the Dev UI translates it to `#view=<id>`. */
  hash: HashAdapter;
  /** Layout when the server Geometry does not arrive (the Worker in the browser). */
  layout: LayoutAdapter;
  /** Confirmation before loading Theme Components with code. */
  confirm: (message: string) => boolean;
  /** How keys are written (`Cmd` or `Ctrl`); by default, that of `navigator`. */
  platform?: Platform;
  /** `export`: read-only (`frame/mode.ts`). Defaults to `dev`. */
  mode?: DevUiMode;
  /** URL of a font file of `estado.fuentes`; by default the `/fonts/` route of `dev`. */
  fontUrlOf?: (route: string) => string;
}

export function DevUi(props: DevUiProps): ReactElement {
  const { fetch: fetchFn, events, layout, confirm, mode: mode = 'dev', fontUrlOf: fontUrlOf = devFontUrl } = props;
  const hash = useMemo(() => devUiHash(props.hash), [props.hash]);
  const own = props.client;
  const client = useMemo(() => own ?? createDevClient({ fetch: fetchFn as typeof fetch, events: events as ClientDependencies['events'] }), [own, fetchFn, events]);
  // The History panel can mount after connecting: the store listens from the start.
  useEffect(() => void clientHistory(client), [client]);
  const geometries = useMemo(
    () =>
      createDevGeometries({
        request: (view) => client.geometry(view),
        initialView: (source) => {
          const { path } = deserializeState(hash.read(), source);
          return path[path.length - 1];
        },
      }),
    [client, hash],
  );
  // What fails outside the providers (malformed state, Components load) is notified inside them.
  const [failure, setFailure] = useState<{ message: string }>();
  const report = useCallback((message: string) => setFailure({ message }), []);
  const { state, current, receive } = useDevState(client, geometries, report);
  const drawable = useSyncExternalStore(geometries.subscribe, geometries.drawable);
  const components = useComponents(client, state?.version, confirm, report);
  const platform = props.platform ?? platformOf(typeof navigator === 'undefined' ? undefined : navigator);
  const base = { state, current, receive, client, platform, failure, mode };

  if (drawable === undefined)
    return (
      <DevUiProviders {...base}>
        <Frame navigation={undefined} canvas={null} />
      </DevUiProviders>
    );
  return (
    <HashView drawable={drawable} hash={hash} geometries={geometries}>
      {(hashProps) => (
        <DevUiProviders {...base} source={drawable.state.fuente} hashProps={hashProps}>
          <FrameWithCanvas drawable={drawable} hashProps={hashProps} layout={layout} components={components} fontUrlOf={fontUrlOf} />
        </DevUiProviders>
      )}
    </HashView>
  );
}

interface HashViewProps {
  drawable: Drawable;
  hash: HashAdapter;
  geometries: DevGeometries;
  children(hashProps: HashStateProps): ReactElement;
}

/** The active View, the Selection and the path live in the hash; the providers give them to the canvas and the panels. */
function HashView({ drawable, hash, geometries, children }: HashViewProps): ReactElement {
  const hashProps = useHashState({ source: drawable.state.fuente, hash, defaultView: drawable.state.vistas[0] ?? '', camera: true });
  useEffect(() => geometries.activate(hashProps.view), [geometries, hashProps.view]);
  return children(hashProps);
}

function FrameWithCanvas(options: Parameters<typeof useDevUiCanvas>[0]): ReactElement {
  const { canvas, legend } = useDevUiCanvas(options);
  return <Frame navigation={navigationFrom(options.hashProps)} canvas={canvas} legend={legend} />;
}

/** Breadcrumbs mounted outside the canvas over the path controlled by the hash. */
function navigationFrom(props: HashStateProps): Navigation {
  const route = props.path.length > 0 ? props.path : [props.view];
  return {
    view: props.view,
    path: route,
    go: (target) => props.onPathChange([...route, target]),
    back: () => {
      if (route.length > 1) props.onPathChange(route.slice(0, -1));
    },
    goTo: (index) => {
      if (index >= 0 && index < route.length - 1) props.onPathChange(route.slice(0, index + 1));
    },
  };
}
