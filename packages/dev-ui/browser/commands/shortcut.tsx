/**
 * Button with the shortcut of a registry command: it declares it in `aria-keyshortcuts` and shows it in a Base UI
 * tooltip (portal in the frame's `portals` node). Without keys on the platform, the tooltip shows only the name.
 */
import { Tooltip } from '@base-ui/react/tooltip';
import type { ComponentProps, ReactElement } from 'react';

import { useDevUi } from '../frame/context';
import { commandById } from './registry';
import { ariaShortcut, keyLabels } from './keys';

export interface ButtonWithShortcutProps extends Omit<ComponentProps<'button'>, 'ref'> {
  /** Id of the registry command whose shortcut is announced. */
  command: string;
  /** Tooltip text; by default, the `aria-label`. */
  text?: string;
}

export function ButtonWithShortcut({ command, text, ...props }: ButtonWithShortcutProps): ReactElement {
  const { platform, portals } = useDevUi();
  const declared = commandById(command);
  const aria = declared === undefined ? '' : ariaShortcut(declared, platform);
  const keys = declared === undefined ? [] : keyLabels(declared, platform);
  const title = text ?? props['aria-label'] ?? declared?.name ?? '';
  return (
    <Tooltip.Root>
      <Tooltip.Trigger type="button" {...props} {...(aria !== '' && { 'aria-keyshortcuts': aria })} />
      <Tooltip.Portal container={portals}>
        <Tooltip.Positioner sideOffset={6}>
          <Tooltip.Popup className="ui-tooltip">
            {title}
            {keys.map((t) => (
              <kbd key={t} className="ui-tecla">
                {t}
              </kbd>
            ))}
          </Tooltip.Popup>
        </Tooltip.Positioner>
      </Tooltip.Portal>
    </Tooltip.Root>
  );
}
