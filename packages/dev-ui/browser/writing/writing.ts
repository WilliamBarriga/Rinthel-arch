/**
 * Writing: the single UI path that writes to `dev` for an action (move, order, undo, redo, jump in the File history,
 * set Theme and apply `fix`). It is the single owner of the current version, of the version rejection (409) and of the
 * notice: it sends with the `version` of the last received state (not the render's); on a 409 it reloads the state and
 * warns; it only retries (once, over the reloaded state) if the request asks for it with `retry`. Another rejection
 * warns `failure: message` (text edits also name reason and file). Before moving the File history it flushes the
 * editor's pending save, so as not to operate on a stale state. It never throws: the result is data.
 * The editor save does not go through here: it reconciles with the disk in its own way (`editor/save.ts`).
 */
import type { Intent } from 'canonical';

import type { DevState, EditsRequest } from '../../src/protocol';
import type { DevClient, SendResult } from '../client';

/** A step of the File history: undo, redo or jump to the entry `id` (0: Start). */
export type HistoryMove = 'deshacer' | 'rehacer' | { jump: number };

/** Which edits to send over a state (the current one or the one reloaded after a 409); `undefined` if none is left. */
export type EditsChoice = (state: DevState) => Omit<EditsRequest, 'version'> | undefined;

export type WriteRequest =
  /** `failure` heads the notice of a rejection that is not 409 (e.g. `Could not move the Pin`). */
  | { intent: Intent; failure: string }
  | { edits: EditsChoice; failure: string; retry?: boolean }
  | { history: HistoryMove };

export type Write = (request: WriteRequest) => Promise<SendResult>;

export interface WritingDependencies {
  client: Pick<DevClient, 'state' | 'edit' | 'editText' | 'undo' | 'redo' | 'jump'>;
  /** The last received state (through SSE or a reload). */
  current: () => DevState | undefined;
  /** Makes a reloaded state current. */
  receive: (state: DevState) => void;
  notify: (text: string) => void;
  flushSave: () => Promise<void>;
}

const rejection = (message: string): Extract<SendResult, { ok: false }> => ({ ok: false, stale: false, message });

type Client = WritingDependencies['client'];

/** What each kind of request decides; the only place that tells Intent, edits and File history apart. */
interface Plan {
  /** Moving the File history first flushes the editor's pending save. */
  flushSave: boolean;
  retry: boolean;
  /** A request over `state` (the current or the reloaded one). */
  send(state: DevState | undefined): Promise<SendResult>;
  notice(r: Extract<SendResult, { ok: false }>): string;
}

const NO_STATE = rejection('no Workspace state yet');

function planOf(request: WriteRequest, client: Client): Plan {
  if ('history' in request) {
    const { history } = request;
    return {
      flushSave: true,
      retry: false,
      send: () => (history === 'deshacer' ? client.undo() : history === 'rehacer' ? client.redo() : client.jump(history.jump)),
      notice: (r) => `Could not ${typeof history === 'object' ? 'jump' : history === 'deshacer' ? 'undo' : 'redo'}: ${r.message}`,
    };
  }
  if ('intent' in request) {
    return {
      flushSave: false,
      retry: false,
      send: async (state) => (state === undefined ? NO_STATE : client.edit(request.intent, state.version)),
      notice: (r) => `${request.failure}: ${r.message}`,
    };
  }
  return {
    flushSave: false,
    retry: request.retry === true,
    async send(state) {
      if (state === undefined) return NO_STATE;
      const editsRequest = request.edits(state);
      return editsRequest === undefined ? rejection('nothing left to apply') : client.editText({ ...editsRequest, version: state.version });
    },
    notice(r) {
      const reason = [r.reason, r.file === undefined ? undefined : `in ${r.file}`].filter((x) => x !== undefined).join(' ');
      return `${request.failure}${reason === '' ? '' : ` (${reason})`}: ${r.message}`;
    },
  };
}

export function createWriting({ client, current, receive, notify, flushSave }: WritingDependencies): Write {
  const reload = async (): Promise<DevState | undefined> => {
    const fresh = await client.state();
    if (fresh !== undefined) receive(fresh);
    return fresh;
  };

  return async (request) => {
    const plan = planOf(request, client);
    if (plan.flushSave) await flushSave();
    let r = await plan.send(current());
    if (!r.ok && r.stale && plan.retry) r = await plan.send(await reload());
    if (r.ok) return r;
    if (r.stale) {
      notify(`The file changed on disk; the View was reloaded (${r.message})`);
      await reload();
    } else notify(plan.notice(r));
    return r;
  };
}
