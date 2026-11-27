/**
 * View index: `listbox` (`frame/use-listbox.ts`) grouped by Diagram type; the selected option is the active View.
 * Click or arrows (Home, End) change the View; each change is an entry in the browser history.
 */
import { useMemo } from 'react';
import type { ReactElement } from 'react';

import { ExternalMark, useExternalMarks } from '../diff/highlight';
import { useDevUi } from '../frame/context';
import { useListbox } from '../frame/use-listbox';
import { viewIndex, indexOrder } from './view-index';
import type { IndexEntry } from './view-index';

const description = ({ links, incoming }: IndexEntry): string =>
  [links.length > 0 ? `links to ${links.join(', ')}` : '', incoming.length > 0 ? `linked from ${incoming.join(', ')}` : ''].filter((t) => t !== '').join('; ');

export function ViewsPanel(): ReactElement {
  const { source, view: active, goToView, client } = useDevUi();
  const marks = useExternalMarks(client);
  const groups = useMemo(() => (source === undefined ? [] : viewIndex(source)), [source]);
  const order = useMemo(() => indexOrder(groups), [groups]);
  const list = useListbox({ name: 'Views', prefix: 'ui-vista', order, chosen: active, choose: (view) => {
      if (view !== active) goToView(view);
    },
    choosesOnMove: true });
  if (source === undefined) return <p className="ui-tenue">The Workspace does not compile yet: no Views to show.</p>;

  return (
    <div {...list.listbox} className="ui-indice">
      {groups.map((group) => (
        <div key={group.kind} role="group" aria-label={group.kind} className="ui-indice-grupo">
          <div aria-hidden className="ui-indice-titulo">
            <span>{group.kind}</span>
            <span className="ui-conteo">{group.views.length}</span>
          </div>
          {group.views.map((entry) => {
            const text = description(entry);
            const option = list.option(entry.id);
            const descriptionId = `${option.id}-enlaces`;
            return (
              <div key={entry.id} {...option} {...(text !== '' && { 'aria-describedby': descriptionId })} className="ui-indice-vista">
                <span className="ui-mono">{entry.id}</span>
                {marks.views.has(entry.id) && <ExternalMark />}
                {text !== '' && (
                  <span id={descriptionId} className="ui-enlaces">
                    {text}
                  </span>
                )}
              </div>
            );
          })}
        </div>
      ))}
    </div>
  );
}
