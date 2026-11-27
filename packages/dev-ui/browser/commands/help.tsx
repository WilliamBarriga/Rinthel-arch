/** Shortcuts dialog (`?` or Mod+/): the registry commands with keys, grouped by scope and with the platform's keys. */
import { Dialog } from '@base-ui/react/dialog';
import type { ReactElement } from 'react';

import { useDevUi } from '../frame/context';
import { commandsOf } from './registry';
import { keyLabels } from './keys';
import type { Scope } from './keys';

const GROUPS: readonly { scope: Scope; name: string }[] = [
  { scope: 'global', name: 'Global' },
  { scope: 'lienzo', name: 'Canvas' },
  { scope: 'editor', name: 'Editor' },
  { scope: 'texto', name: 'Text field' },
];

/** Keys of `VistaInteractiva` itself with the focus on the canvas: they are not registry commands, but they are documented. */
const CANVAS_KEYS: readonly { name: string; keys: string[] }[] = [
  { name: 'Cycle through elements', keys: ['Tab', 'Shift+Tab'] },
  { name: 'Move between elements', keys: ['Arrows'] },
  { name: 'Select or enter', keys: ['Enter', 'Space'] },
];

export function Help({ opened, onChange }: { opened: boolean; onChange: (opened: boolean) => void }): ReactElement {
  const { platform, portals, mode, openDialog } = useDevUi();
  const groups = GROUPS.map(({ scope, name }) => ({
    name: name,
    rows: [
      ...commandsOf(mode).filter((c) => c.scope === scope)
        .map((c) => ({ name: c.name, keys: keyLabels(c, platform) }))
        .filter((f) => f.keys.length > 0),
      ...(scope === 'lienzo' ? CANVAS_KEYS : []),
    ],
  })).filter((g) => g.rows.length > 0);
  return (
    <Dialog.Root open={opened} onOpenChange={onChange}>
      <Dialog.Portal container={portals}>
        <Dialog.Backdrop className="ui-fondo-dialogo" />
        <Dialog.Popup className="ui-dialogo ui-ayuda">
          <Dialog.Title className="ui-dialogo-titulo">Keyboard shortcuts</Dialog.Title>
          {groups.map((g) => (
            <section key={g.name} aria-label={g.name}>
              <h3 className="ui-subtitulo">{g.name}</h3>
              <dl className="ui-atajos">
                {g.rows.map((f) => (
                  <div key={f.name} className="ui-atajo">
                    <dt>{f.name}</dt>
                    <dd>
                      {f.keys.map((t) => (
                        <kbd key={t} className="ui-tecla">
                          {t}
                        </kbd>
                      ))}
                    </dd>
                  </div>
                ))}
              </dl>
            </section>
          ))}
          <div className="ui-tour-fila">
            <Dialog.Close className="ui-boton">Close</Dialog.Close>
            <button type="button" className="ui-boton" onClick={() => openDialog('tour')}>
              View tour
            </button>
          </div>
        </Dialog.Popup>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
