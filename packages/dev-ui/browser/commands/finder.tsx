/**
 * Finder (Mod+K): Base UI dialog with Autocomplete. It finds registry commands (with their shortcut), Views (from the
 * Source), Nodes (`inspect search`, with their `file:line`) and a `file:line` typed as is, which opens Code.
 * Filtering is our own (`filter={null}`): Nodes come from the server and stale responses are discarded.
 */
import { Autocomplete } from '@base-ui/react/autocomplete';
import { Dialog } from '@base-ui/react/dialog';
import { useMemo, useState } from 'react';
import type { ReactElement } from 'react';

import { useDevUi } from '../frame/context';
import type { DevUiContext } from '../frame/context';
import { useInspectByVersion } from '../frame/use-read-by-version';
import { writtenSite, siteText } from '../site';
import { nodeTarget } from '../views/target';
import { viewIndex } from '../views/view-index';
import { commandsOf } from './registry';
import { keyLabels } from './keys';

interface Entry {
  value: string;
  label: string;
  detail?: string;
  keys?: string[];
  run(e: DevUiContext): void | Promise<void>;
}

interface Group {
  value: string;
  items: Entry[];
}


const contains = (text: string, query: string): boolean => text.toLowerCase().includes(query.toLowerCase());

/** A chosen Node: it is selected and its Details open. If the active View does not show it, it first goes to the first View that does. */
function goToNode(e: DevUiContext, id: string): void {
  const target = e.source === undefined ? undefined : nodeTarget(e.source, id, e.view);
  if (target !== undefined && target.view !== e.view) e.goToView(target.view);
  e.select(id);
  e.openTab('derecha', 'detalle');
}

/** The Nodes of `inspect search`; none while those of the current query have not arrived (or if it fails). */
function useNodes(query: string): Entry[] {
  const { client, state } = useDevUi();
  const clean = query.trim();
  const reading = useInspectByVersion(client, state?.version, 'search', clean === '' || writtenSite(clean) !== undefined ? undefined : clean);
  return useMemo(
    () =>
      reading.kind !== 'dato'
        ? []
        : reading.datum.results
            .filter((n) => n.kind === 'node')
            .map((n) => ({ value: `nodo:${n.id}`, label: n.title, detail: `${n.id} · ${siteText(n)}`, run: (e: DevUiContext) => goToNode(e, n.id) })),
    [reading],
  );
}

function Content({ onChoose }: { onChoose: () => void }): ReactElement {
  const devUi = useDevUi();
  const { source, platform, mode, canWrite } = devUi;
  const [query, setQuery] = useState('');
  const views = useMemo(() => (source === undefined ? [] : viewIndex(source).flatMap((g) => g.views)), [source]);
  const nodes = useNodes(query);

  const site = writtenSite(query);
  const all: Group[] = [
    { value: 'File', items: site === undefined || !canWrite ? [] : [{ value: `sitio:${siteText(site)}`, label: `Open ${siteText(site)}`, run: (e) => e.openCode(site) }] },
    {
      value: 'Commands',
      items: commandsOf(mode).filter((c) => c.inFinder !== false && contains(c.name, query.trim())).map((c) => ({ value: `comando:${c.id}`, label: c.name, keys: keyLabels(c, platform), run: c.run })),
    },
    {
      value: 'Views',
      items: views.filter((v) => contains(v.id, query.trim())).map((v) => ({ value: `vista:${v.id}`, label: v.id, detail: v.kind, run: (e) => e.goToView(v.id) })),
    },
    { value: 'Nodes', items: nodes },
  ];
  const groups = all.filter((g) => g.items.length > 0);

  const choose = (entry: Entry): void => {
    onChoose();
    void entry.run(devUi);
  };

  return (
    <Autocomplete.Root open inline items={groups} filter={null} value={query} onValueChange={setQuery} autoHighlight="always" keepHighlight>
      <Autocomplete.Input className="ui-buscador-campo" aria-label="Search" placeholder="Views, Nodes, file:line or commands" />
      <Autocomplete.Empty>
        <p className="ui-tenue">No results.</p>
      </Autocomplete.Empty>
      <Autocomplete.List className="ui-buscador-lista">
        {(group: Group) => (
          <Autocomplete.Group key={group.value} items={group.items} className="ui-buscador-grupo">
            <Autocomplete.GroupLabel className="ui-indice-titulo">{group.value}</Autocomplete.GroupLabel>
            <Autocomplete.Collection>
              {(entry: Entry) => (
                <Autocomplete.Item key={entry.value} value={entry} className="ui-buscador-item" onClick={() => choose(entry)}>
                  <span>{entry.label}</span>
                  {entry.detail !== undefined && <span className="ui-mono ui-tenue">{` ${entry.detail}`}</span>}
                  {entry.keys?.map((t) => (
                    <kbd key={t} className="ui-tecla">
                      {t}
                    </kbd>
                  ))}
                </Autocomplete.Item>
              )}
            </Autocomplete.Collection>
          </Autocomplete.Group>
        )}
      </Autocomplete.List>
    </Autocomplete.Root>
  );
}

export function Finder({ opened, onChange }: { opened: boolean; onChange: (opened: boolean) => void }): ReactElement {
  const { portals } = useDevUi();
  return (
    <Dialog.Root open={opened} onOpenChange={onChange}>
      <Dialog.Portal container={portals}>
        <Dialog.Backdrop className="ui-fondo-dialogo" />
        <Dialog.Popup className="ui-dialogo ui-buscador" aria-label="Finder">
          <Content onChoose={() => onChange(false)} />
        </Dialog.Popup>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
