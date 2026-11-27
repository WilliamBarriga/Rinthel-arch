/**
 * Read by version: the only place with the guard against stale responses. A request is repeated with every `version`
 * (and when its `key` or the client changes); the response of a replaced request is discarded. Used by Details, the
 * Theme card, the Finder, Code, the Theme preview and the Components load.
 */
import { useEffect, useState } from 'react';

import type { InspectOutput } from 'canonical';

import type { InspectCommand } from '../../src/protocol';
import type { DevClient, Read } from '../client';

/** What the UI sees of a read by version. */
export type ReadState<T> = { kind: 'cargando' } | { kind: 'dato'; datum: T } | { kind: 'fallo'; message: string };

export interface ReadRequest<T> {
  /** Identifies what is requested: when it changes, the read goes back to `cargando`. With the same key, a new version keeps the last result until the next one arrives. */
  key: string;
  /** The client's `Read`; if it rejects, it counts as `fallo` with its message. */
  request(client: DevClient): Promise<Read<T>>;
  /** A failure does not replace data already read with the same key (e.g. the Code listing on a network error). */
  keepOnFailure?: boolean;
}

const LOADING = { kind: 'cargando' } as const;

/** Without `request` (nothing to read) it stays in `cargando`. */
export function useReadByVersion<T>(client: DevClient, version: number | undefined, request: ReadRequest<T> | undefined): ReadState<T> {
  const [read, setRead] = useState<{ key: string; reading: ReadState<T> }>();
  const key = request?.key;
  useEffect(() => {
    // The request for the same key is the same: the one from the render where the key, the version or the client changed is enough.
    const current = request;
    if (current === undefined) return;
    let discarded = false;
    const save = (reading: ReadState<T>): void => {
      if (discarded) return;
      setRead((previous) => (reading.kind === 'fallo' && current.keepOnFailure === true && previous?.key === current.key && previous.reading.kind === 'dato' ? previous : { key: current.key, reading }));
    };
    current.request(client).then(
      (r) => save(r.ok ? { kind: 'dato', datum: r.value } : { kind: 'fallo', message: r.message }),
      (error: unknown) => save({ kind: 'fallo', message: error instanceof Error ? error.message : String(error) }),
    );
    return () => {
      discarded = true;
    };
  }, [client, version, key]);
  return read !== undefined && read.key === key ? read.reading : LOADING;
}

type OutputOf<C extends InspectCommand> = Extract<InspectOutput, { command: C }>;

/** `inspect <command> <argument>` by version, with the output already narrowed to that command; without `argument` it requests nothing. */
export function useInspectByVersion<C extends InspectCommand>(client: DevClient, version: number | undefined, command: C, argument: string | undefined): ReadState<OutputOf<C>> {
  return useReadByVersion(
    client,
    version,
    argument === undefined
      ? undefined
      : {
          key: argument,
          request: async (c) => {
            const r = await c.inspect(command, argument);
            if (!r.ok) return r;
            return r.output.command === command ? { ok: true, value: r.output as OutputOf<C> } : { ok: false, message: 'Unexpected response from inspect' };
          },
        },
  );
}
