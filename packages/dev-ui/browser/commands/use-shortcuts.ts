/**
 * The single keyboard listener of the Dev UI: translates each window `keydown` into a registry command with
 * `resolveKey` and the scope of the focused element. It listens in the capture phase so global shortcuts with a
 * modifier also win inside the editor (Mod+/ before CodeMirror); what it does not resolve goes on as usual
 * (CodeMirror, the browser, `VistaInteractiva`).
 */
import { useEffect, useLayoutEffect, useRef } from 'react';

import type { DevUiContext } from '../frame/context';
import type { Command } from './registry';
import { resolveKey } from './keys';
import type { Scope } from './keys';

/** Focus scope by element: the CodeMirror editor, a text field, the canvas or the rest. */
export function focusScope(element: EventTarget | null): Scope {
  if (!(element instanceof Element)) return 'global';
  if (element.closest('.cm-editor') !== null) return 'editor';
  if (element instanceof HTMLElement && (element.isContentEditable || ['INPUT', 'TEXTAREA', 'SELECT'].includes(element.tagName))) return 'texto';
  if (element.closest('.ui-lienzo') !== null) return 'lienzo';
  return 'global';
}

export function useShortcuts(commands: readonly Command[], context: DevUiContext): void {
  // The listener reads the context of the last committed render.
  const live = useRef(context);
  useLayoutEffect(() => {
    live.current = context;
  });
  useEffect(() => {
    const onType = (e: KeyboardEvent): void => {
      const command = resolveKey(commands, e, focusScope(e.target), live.current.platform);
      if (command === undefined) return;
      e.preventDefault();
      void command.run(live.current);
    };
    window.addEventListener('keydown', onType, { capture: true });
    return () => window.removeEventListener('keydown', onType, { capture: true });
  }, [commands]);
}
