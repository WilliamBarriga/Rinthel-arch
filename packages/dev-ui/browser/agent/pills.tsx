/**
 * Agent pills in the top bar: the last line (with a counter of what is unseen when the agent is not followed; a click
 * opens the Agent tab) and the "follow the agent" toggle. With the toggle on, each live batch takes the canvas to the
 * target of its last goal (`targetOfGoal`): it changes the View and the Selection, never the islands. If what it names
 * is not in the Source yet (the state arrives after the Event), it waits for the next state.
 */
import { Switch } from '@base-ui/react/switch';
import { useEffect, useState } from 'react';
import type { ReactElement } from 'react';

import type { ActivityTarget } from 'canonical';

import { useDevUi } from '../frame/context';
import { targetOfGoal, eventSummary, useAgentActivity } from './activity';

export function AgentLastLine(): ReactElement {
  const { client, openTab } = useDevUi();
  const { store, snapshot } = useAgentActivity(client);
  const last = snapshot.events[snapshot.events.length - 1];
  const line = last === undefined ? 'no activity' : eventSummary(last);
  const unseen = snapshot.following ? 0 : snapshot.unseen;
  return (
    <button
      type="button"
      className="ui-ultima-linea"
      aria-label={`Agent last line: ${line}${unseen > 0 ? `, ${unseen} unseen` : ''}`}
      title={line}
      onClick={() => {
        openTab('derecha', 'agente');
        store.markSeen();
      }}
    >
      <span className="ui-mono ui-ultima-linea-texto">{line}</span>
      {unseen > 0 && (
        <span className="ui-contador" aria-hidden>
          {unseen}
        </span>
      )}
    </button>
  );
}

export function FollowAgent(): ReactElement {
  const { client, source, view, goToView, select } = useDevUi();
  const { store, snapshot } = useAgentActivity(client);
  const [pending, setPending] = useState<{ goal: ActivityTarget }>();

  useEffect(
    () =>
      store.onLive((events) => {
        if (!store.snapshot().following) return;
        const last = [...events].reverse().find(({ target: goal }) => goal?.view !== undefined || goal?.node !== undefined);
        if (last?.target !== undefined) setPending({ goal: last.target });
      }),
    [store],
  );

  useEffect(() => {
    if (pending === undefined) return;
    // Turning it off (from the toggle or the Finder) discards what was waiting.
    if (!snapshot.following) {
      setPending(undefined);
      return;
    }
    if (source === undefined) return;
    const target = targetOfGoal(pending.goal, source, view);
    if (target === undefined) return;
    setPending(undefined);
    if (target.view !== view) goToView(target.view);
    if (target.selection !== undefined) select(target.selection);
    // Only when a new goal or a new Source arrives, or when turned off; the active View is read from this render.
  }, [pending, source, snapshot.following]);

  return (
    <label className="ui-seguir">
      <Switch.Root
        className="ui-interruptor"
        aria-label="Follow the agent"
        checked={snapshot.following}
        onCheckedChange={(following) => store.follow(following)}
      >
        <Switch.Thumb className="ui-interruptor-pulgar" />
      </Switch.Root>
      <span aria-hidden>follow</span>
    </label>
  );
}
