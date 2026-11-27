/**
 * Agent activity in the page: pure functions over an Activity event (mark, summary and target of "follow the agent")
 * and the feed store, one per `dev` client.
 * Invariants: the store listens to `event: actividad` from the moment it is created (the startup `previos` do not count
 * as new nor move anything); only live Events raise the counter (if the agent is not followed) and reach `onLive`.
 * Seams for the Diff (#196): `onLive` (each new batch) and `following` (the toggle).
 */
import type { ActivityEvent, CanonicalForm, ActivityTarget } from 'canonical';

import { devActivitySchema } from '../../src/protocol';
import { storePerClient, createValue, listenValidated, useObservable } from '../store';
import type { ListeningClient, Observable } from '../store';
import { nodeTarget, sampleView } from '../views/target';

export type MarkKind = 'ok' | 'errores' | 'avisos' | 'fallo';

const plural = (n: number, singular: string, several: string): string => `${n} ${n === 1 ? singular : several}`;

/** `fallo` is exit 2 (usage failure); `errores`, exit 1 or a `summary` with errors; `avisos`, a `summary` with warnings only. */
export function eventMark({ exitCode, summary }: ActivityEvent): { kind: MarkKind; text: string } {
  if (exitCode === 2) return { kind: 'fallo', text: 'usage failure' };
  if (summary !== undefined && summary.errors > 0) return { kind: 'errores', text: plural(summary.errors, 'error', 'errors') };
  if (exitCode === 1) return { kind: 'errores', text: 'error' };
  if (summary !== undefined && summary.warnings > 0) return { kind: 'avisos', text: plural(summary.warnings, 'warning', 'warnings') };
  return { kind: 'ok', text: 'ok' };
}

/** Who (agent or `pid <n>`). */
export const eventAuthor = ({ agent, pid }: ActivityEvent): string => agent ?? `pid ${pid}`;

/** What the target names, in one line (empty if it names nothing). */
export function goalText(goal: ActivityTarget | undefined): string {
  if (goal === undefined) return '';
  return [goal.view, goal.node, goal.theme, goal.files?.join(', ')].filter((p) => p !== undefined && p !== '').join(' ');
}

/** "who command target": the last line of the agent in the top bar. */
export const eventSummary = (event: ActivityEvent): string => [eventAuthor(event), event.command, goalText(event.target)].filter((p) => p !== '').join(' ');

export interface AgentTarget {
  view: string;
  /** Node to select in `view`. */
  selection?: string;
}

/**
 * Where "follow the agent" leads (ADR 0005): `view` goes to that View (and selects `node` if the View contains it);
 * `node` stays on the active View if it contains it or goes to the first View, in declaration order, that contains it,
 * and selects it; `files` does not move. `undefined`: nowhere to go (or what is named does not exist in `source`).
 */
export function targetOfGoal(goal: ActivityTarget | undefined, source: CanonicalForm, activeView: string | undefined): AgentTarget | undefined {
  if (goal === undefined) return undefined;
  const { view, node } = goal;
  if (view !== undefined) {
    if (!source.views.some((v) => v.id === view)) return undefined;
    return node !== undefined && sampleView(source, view, node) ? { view, selection: node } : { view };
  }
  return node === undefined ? undefined : nodeTarget(source, node, activeView);
}

/** Events the feed keeps (the 50 previous ones plus those that arrive). */
const FEED_EVENTS = 200;

export interface AgentSnapshot {
  /** From oldest to newest. */
  events: readonly ActivityEvent[];
  /** Live Events that arrived without following the agent since the feed was last seen. */
  unseen: number;
  /** "Follow the agent" toggle. */
  following: boolean;
}

export interface AgentActivity extends Observable<AgentSnapshot> {
  /** Each live batch (not the `previos`), after updating the snapshot; returns the unsubscribe. */
  onLive(onEvents: (events: readonly ActivityEvent[]) => void): () => void;
  /** Turning it on resets the counter. */
  follow(following: boolean): void;
  /** The feed was seen: counter to zero. */
  markSeen(): void;
}

export function createAgentActivity(client: ListeningClient): AgentActivity {
  const value = createValue<AgentSnapshot>({ events: [], unseen: 0, following: false });
  const live = new Set<(events: readonly ActivityEvent[]) => void>();
  listenValidated(client, 'actividad', devActivitySchema, ({ previos: previous, eventos: events }) => {
    if (events.length === 0) return;
    const current = value.snapshot();
    // A reconnection sends the previous ones again: they replace the feed instead of duplicating it.
    const base = previous ? [] : current.events;
    value.change({
      ...current,
      events: [...base, ...events].slice(-FEED_EVENTS),
      unseen: previous || current.following ? current.unseen : current.unseen + events.length,
    });
    if (!previous) for (const listener of [...live]) listener(events);
  });
  return {
    snapshot: value.snapshot,
    subscribe: value.subscribe,
    onLive(onEvents) {
      live.add(onEvents);
      return () => live.delete(onEvents);
    },
    follow: (following) => value.change({ ...value.snapshot(), following, unseen: following ? 0 : value.snapshot().unseen }),
    markSeen() {
      if (value.snapshot().unseen !== 0) value.change({ ...value.snapshot(), unseen: 0 });
    },
  };
}

/** One store per client: the Agent panel and the top bar pills share it without going through the frame context. */
export const clientActivity = storePerClient(createAgentActivity);

/** The client's store and its current snapshot. */
export function useAgentActivity(client: ListeningClient): { store: AgentActivity; snapshot: AgentSnapshot } {
  const store = clientActivity(client);
  return { store, snapshot: useObservable(store) };
}
