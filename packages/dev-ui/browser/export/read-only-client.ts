/**
 * Read-only client: replaces the `dev` transport in an exported Dev UI. Serves the captured state, the `inspect tema`
 * output of each Theme and the Theme components bundle; every write is refused, there are no SSE events, and the
 * Geometry never arrives (the page lays out with its own ELK, measuring with the embedded fonts).
 * Invariants: never throws; `subscribe` delivers the state once, asynchronously, like the connection snapshot of `dev`.
 */
import type { ExportData } from '../../src/export';
import type { DevClient, SendResult } from '../client';

const READ_ONLY = 'This is a read-only export';

export function createReadOnlyClient(data: ExportData): DevClient {
  const rejection = async (): Promise<SendResult> => ({ ok: false, stale: false, message: READ_ONLY });
  const { estado: state, temas: themes, componentes: components } = data;
  return {
    state: async () => state,
    subscribe(onState) {
      let active = true;
      queueMicrotask(() => {
        if (active) onState(state);
      });
      return () => {
        active = false;
      };
    },
    listen: () => () => undefined,
    async inspect(command, argument) {
      const output = command === 'theme' ? themes[argument] : undefined;
      return output === undefined ? { ok: false, message: `${READ_ONLY}: inspect ${command} is not available`, suggestions: [] } : { ok: true, output };
    },
    edit: rejection,
    editText: rejection,
    files: async () => ({ ok: false, message: READ_ONLY }),
    file: async () => undefined,
    undo: rejection,
    redo: rejection,
    jump: rejection,
    code: async () => ({ ok: true, value: { temaConCodigo: components !== undefined, componentes: components?.nombres ?? [], confiado: true } }),
    trust: async () => ({ ok: true }),
    componentsBundle: async () => (components === undefined ? { ok: false, message: 'The Themes of this export load no code' } : { ok: true, value: components.bundle }),
    geometry: async () => ({ ok: false }),
  };
}
