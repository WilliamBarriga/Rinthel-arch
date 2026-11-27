/** Glass side island: registry tabs, hide button, resize handles and an edge tab when hidden. */
import { Tabs } from '@base-ui/react/tabs';
import { Suspense, useEffect, useRef, useState } from 'react';
import type { ReactElement } from 'react';

import { ButtonWithShortcut } from '../commands/shortcut';
import type { Island } from './use-island';
import type { PanelTab } from './tabs';
import type { IslandSide } from './limits';

export interface IslandProps {
  side: IslandSide;
  id: string;
  /** "left panel" / "right panel": accessible name of the tab list and of the buttons. */
  name: string;
  island: Island;
  tabs: readonly PanelTab[];
  active: string;
  onTabChange(tab: string): void;
}

const uppercase = (text: string): string => text.charAt(0).toUpperCase() + text.slice(1);

export function SideIsland({ side, id, name, island, tabs, active, onTabChange }: IslandProps): ReactElement {
  // A `keep` tab mounts the first time it opens and stays mounted from then on even when not active.
  const [visited, setVisited] = useState<ReadonlySet<string>>(() => new Set([active]));
  if (!visited.has(active)) setVisited(new Set([...visited, active]));
  const minimumWidth = tabs.find((p) => p.id === active)?.minimumWidth;
  // Only when the tab changes (the island reference changes on every render): afterwards it can be narrowed by hand.
  const widen = useRef(island.widen);
  widen.current = island.widen;
  useEffect(() => {
    if (minimumWidth !== undefined) widen.current(minimumWidth);
  }, [active, minimumWidth]);
  if (island.hidden) {
    return (
      <ButtonWithShortcut command={`isla-${side}`} className="ui-pestana-borde" data-lado={side} aria-label={`Show ${name}`} aria-controls={id} aria-expanded={false} onClick={island.show}>
        {tabs.find((p) => p.id === active)?.name ?? uppercase(name)}
      </ButtonWithShortcut>
    );
  }
  const { width, height } = island.size;
  return (
    <aside id={id} ref={island.ref} className="ui-isla" data-lado={side} data-alto={height === null ? 'contenido' : 'fijo'} aria-label={uppercase(name)} style={{ width, ...(height !== null && { height }) }}>
      <Tabs.Root className="ui-isla-pestanas" value={active} onValueChange={(value) => onTabChange(String(value))}>
        <div className="ui-isla-cabecera">
          <Tabs.List className="ui-pestanas" aria-label={uppercase(name)}>
            {tabs.map((p) => (
              <Tabs.Tab key={p.id} value={p.id} className="ui-pestana">
                {p.name}
              </Tabs.Tab>
            ))}
            <Tabs.Indicator className="ui-pestanas-indicador" />
          </Tabs.List>
          <ButtonWithShortcut command={`isla-${side}`} className="ui-boton-icono" aria-label={`Hide ${name}`} aria-controls={id} aria-expanded onClick={island.hide}>
            {side === 'izquierda' ? '‹' : '›'}
          </ButtonWithShortcut>
        </div>
        {tabs.map(({ id: tab, Content, keep: keep = false }) => (
          <Tabs.Panel key={tab} value={tab} className="ui-isla-cuerpo" keepMounted={keep && visited.has(tab)}>
            <Suspense fallback={<p className="ui-tenue">Loading...</p>}>
              <Content />
            </Suspense>
          </Tabs.Panel>
        ))}
      </Tabs.Root>
      <div className="ui-asa ui-asa-h" {...island.handle('horizontal')} />
      <div className="ui-asa ui-asa-v" {...island.handle('vertical')} />
      <div className="ui-asa ui-asa-d" {...island.handle('diagonal')} />
    </aside>
  );
}
