/**
 * Agent panel: the Activity log feed (one line per Event, newest at the top) with time, agent or pid, command,
 * clickable target and mark; the `args` when expanded. While it is seen, the top bar counter stays at zero.
 * Above, what the last external Diff removed (until the next one).
 */
import { useEffect, useState } from 'react';
import type { ReactElement } from 'react';

import { elementLabel } from 'canonical';
import type { ActivityEvent } from 'canonical';

import { useDiffs } from '../diff/diffs';
import { useDevUi } from '../frame/context';
import { targetOfGoal, eventMark, eventAuthor, useAgentActivity } from './activity';

const two = (n: number): string => String(n).padStart(2, '0');
/** Local time `HH:MM:SS`. */
const time = (ts: string): string => {
  const date = new Date(ts);
  return Number.isNaN(date.getTime()) ? ts : `${two(date.getHours())}:${two(date.getMinutes())}:${two(date.getSeconds())}`;
};

export function AgentPanel(): ReactElement {
  const { client } = useDevUi();
  const { store, snapshot } = useAgentActivity(client);
  const { events, unseen } = snapshot;
  const { removed } = useDiffs(client).snapshot.highlight;
  useEffect(() => {
    if (unseen > 0) store.markSeen();
  }, [store, unseen]);

  return (
    <section aria-label="Agent" className="ui-agente">
      {removed.length > 0 && (
        <div className="ui-quitados">
          <p className="ui-tenue">Removed externally</p>
          <ul aria-label="Removed externally" className="ui-lista">
            {removed.map((element) => {
              const { kind, id } = elementLabel(element);
              return (
                <li key={`${kind}:${id}`}>
                  <span className="ui-tenue">{kind}</span> <span className="ui-mono">{id}</span>
                </li>
              );
            })}
          </ul>
        </div>
      )}
      {events.length === 0 ? (
        <p className="ui-tenue">No agent activity. The validate, build, inspect and edit commands will appear here.</p>
      ) : (
        <ol className="ui-feed" aria-label="Agent activity">
          {events
            .map((event, i) => <FeedLine key={`${i}:${event.ts}:${event.pid}`} event={event} />)
            .reverse()}
        </ol>
      )}
    </section>
  );
}

function FeedLine({ event }: { event: ActivityEvent }): ReactElement {
  const { source, view, goToView, select } = useDevUi();
  const [open, setOpen] = useState(false);
  const mark = eventMark(event);
  const { target: goal } = event;
  const ir = (target: Parameters<typeof targetOfGoal>[0]): void => {
    if (source === undefined) return;
    const d = targetOfGoal(target, source, view);
    if (d === undefined) return;
    if (d.view !== view) goToView(d.view);
    if (d.selection !== undefined) select(d.selection);
  };
  return (
    <li className="ui-feed-linea" data-marca={mark.kind}>
      <div className="ui-feed-cabecera">
        <time className="ui-mono ui-tenue" dateTime={event.ts}>
          {time(event.ts)}
        </time>
        <span className="ui-feed-quien">{eventAuthor(event)}</span>
        <span className="ui-mono">{event.command}</span>
        {goal?.view !== undefined && (
          <button type="button" className="ui-enlace ui-mono" onClick={() => ir({ view: goal.view })}>
            {goal.view}
          </button>
        )}
        {goal?.node !== undefined && (
          <button type="button" className="ui-enlace ui-mono" onClick={() => ir({ node: goal.node })}>
            {goal.node}
          </button>
        )}
        {goal?.theme !== undefined && <span className="ui-mono">{goal.theme}</span>}
        {goal?.files !== undefined && <span className="ui-mono ui-tenue">{goal.files.join(', ')}</span>}
        <span className="ui-feed-marca" data-marca={mark.kind}>
          {mark.text}
        </span>
        <button type="button" className="ui-boton-icono" aria-label="Show args" aria-expanded={open} onClick={() => setOpen((a) => !a)}>
          {open ? '▾' : '▸'}
        </button>
      </div>
      {open && <code className="ui-feed-args ui-mono">{['diagrams', event.command, ...event.args].join(' ')}</code>}
    </li>
  );
}
