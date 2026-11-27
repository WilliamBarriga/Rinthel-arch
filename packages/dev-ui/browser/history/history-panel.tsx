/**
 * History panel: the entries of the `dev` File history, most recent at the top (the dimmed future, then the current
 * position and the past) and Start at the end. A click jumps to the entry; unreachable ones are disabled with their
 * reason. Jumping goes through the writing path (`write`), which first flushes the editor's pending save.
 */
import { useEffect, useId, useState } from 'react';
import type { ReactElement } from 'react';

import type { DevHistoryEntry } from '../../src/protocol';
import { useDevUi } from '../frame/context';
import { relativeTime, useVisibleHistory } from './visible-history';

/** How often the relative time is recomputed. */
const REFRESH_MS = 15_000;

interface Row {
  /** 0: Start. */
  id: number;
  entry?: DevHistoryEntry;
  reachable: boolean;
  reason?: string;
  future: boolean;
  current: boolean;
}

const rowOf = (entry: DevHistoryEntry, future: boolean, current: boolean): Row => ({
  id: entry.id,
  entry: entry,
  reachable: entry.alcanzable,
  ...(entry.reason !== undefined && { reason: entry.reason }),
  future: future,
  current: current,
});

export function HistoryPanel(): ReactElement {
  const devUi = useDevUi();
  const history = useVisibleHistory(devUi.client);
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), REFRESH_MS);
    return () => clearInterval(t);
  }, []);
  useEffect(() => setNow(Date.now()), [history]);

  if (history === undefined) return <p className="ui-tenue">Waiting for the dev Undo history.</p>;
  const { pasado: past, futuro: future, inicio: start } = history;
  const last = past[past.length - 1];
  const rows: Row[] = [
    ...[...future].reverse().map((e) => rowOf(e, true, false)),
    ...[...past].reverse().map((e) => rowOf(e, false, e === last)),
    { id: 0, reachable: start.alcanzable, ...(start.reason !== undefined && { reason: start.reason }), future: false, current: last === undefined },
  ];
  const jump = (row: Row): void => {
    if (!row.current) void devUi.write({ history: { jump: row.id } });
  };

  return (
    <section aria-label="Undo history" className="ui-historial">
      {past.length === 0 && future.length === 0 && <p className="ui-tenue">No changes yet. Every Gesture, save or fix will be an entry.</p>}
      <ol className="ui-historial-lista" aria-label="Change history">
        {rows.map((row) => (
          <HistoryRow key={row.id} row={row} now={now} onJump={jump} />
        ))}
      </ol>
    </section>
  );
}

function HistoryRow({ row, now, onJump }: { row: Row; now: number; onJump: (row: Row) => void }): ReactElement {
  const reasonId = useId();
  const { entry } = row;
  return (
    <li className="ui-historial-fila" data-futuro={row.future ? 'true' : undefined} data-actual={row.current ? 'true' : undefined}>
      <button
        type="button"
        className="ui-historial-boton"
        disabled={!row.reachable}
        aria-current={row.current ? 'step' : undefined}
        aria-describedby={row.reason === undefined ? undefined : reasonId}
        onClick={() => onJump(row)}
      >
        <span className="ui-historial-marca" aria-hidden="true">
          {row.current ? '●' : '○'}
        </span>
        {entry === undefined ? (
          <span className="ui-historial-descripcion">Start</span>
        ) : (
          <>
            <span className="ui-historial-descripcion">{entry.descripcion}</span>
            <span className="ui-mono ui-tenue">{entry.archivos.join(', ')}</span>
            <time className="ui-tenue" dateTime={new Date(entry.cuando).toISOString()}>
              {relativeTime(entry.cuando, now)}
            </time>
          </>
        )}
        {row.current && <span className="ui-historial-actual">actual</span>}
      </button>
      {row.reason !== undefined && (
        <p id={reasonId} className="ui-historial-motivo">
          {row.reason}
        </p>
      )}
    </li>
  );
}
