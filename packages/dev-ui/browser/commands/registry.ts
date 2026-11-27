/**
 * Single registry of the UI commands. From it come the shortcuts (`use-shortcuts.ts`), the Finder entries and the help
 * dialog. Adding a command is a single declaration in `COMMANDS`: stable id, name (the Finder text), keys (`Mod+K`,
 * `E`, `?`; empty if it is only reached through the Finder), focus scope and `run`, which receives the Dev UI context
 * (`useDevUi()`). The rules for keys and scopes are in `keys.ts`.
 */
import { clientActivity } from '../agent/activity';
import type { DevUiContext } from '../frame/context';
import { availableIn } from '../frame/mode';
import type { WithMode, DevUiMode } from '../frame/mode';
import { RIGHT_TABS, LEFT_TABS } from '../frame/tabs';
import { exitSite } from '../site';
import type { KeysDeclaration } from './keys';

export interface Command extends KeysDeclaration, WithMode {
  /** Text of the Finder and of the help ("Open History", "Follow the agent: on"). */
  name: string;
  /** `false` if it does not show in the Finder (opening the Finder itself). */
  inFinder?: boolean;
  run(devUi: DevUiContext): void | Promise<void>;
}

const history = (action: 'deshacer' | 'rehacer') => async (e: DevUiContext): Promise<void> => void (await e.write({ history: action }));

/** Opens Code and, when `inspect` responds, jumps to the block of the Node or View `id`. */
export async function openCodeInBlock(e: DevUiContext, command: 'node' | 'view', id: string): Promise<void> {
  const query = e.client.inspect(command, id);
  e.openCode();
  const r = await query;
  const site = r.ok ? exitSite(r.output) : undefined;
  if (site !== undefined) e.openCode(site);
}

/** Code at the block of the selected Node or, without a Selection, at the active View's. */
async function openCodeHere(e: DevUiContext): Promise<void> {
  if (e.selection !== null) await openCodeInBlock(e, 'node', e.selection);
  else if (e.view !== undefined) await openCodeInBlock(e, 'view', e.view);
  else e.openCode();
}

/** Goes back to the Views tab with the focus on the canvas. */
function backToViews(e: DevUiContext): void {
  e.openTab('izquierda', 'vistas');
  document.querySelector<HTMLElement>('.ui-lienzo [tabindex]')?.focus();
}

const OWN: readonly Command[] = [
  { id: 'buscador', name: 'Search', keys: ['Mod+K'], scope: 'global', inFinder: false, run: (e) => e.openDialog('buscador') },
  { id: 'ver-tour', name: 'View tour', keys: [], scope: 'global', run: (e) => e.openDialog('tour') },
  { id: 'ayuda', name: 'Keyboard shortcuts', keys: ['?', 'Mod+/'], scope: 'global', run: (e) => e.openDialog('ayuda') },
  { id: 'isla-izquierda', name: 'Toggle the left panel', keys: ['Mod+B'], scope: 'global', run: (e) => e.toggleIsland('izquierda') },
  { id: 'isla-derecha', name: 'Toggle the right panel', keys: ['Mod+J'], scope: 'global', run: (e) => e.toggleIsland('derecha') },
  { id: 'deshacer', name: 'Undo', keys: ['Mod+Z'], scope: 'global', inText: false, run: history('deshacer'), devOnly: true },
  { id: 'rehacer', name: 'Redo', keys: ['Mod+Shift+Z', { combo: 'Ctrl+Y', onlyIn: 'otras' }], scope: 'global', inText: false, run: history('rehacer'), devOnly: true },
  { id: 'abrir-codigo', name: 'Open Code', keys: ['E'], scope: 'global', run: openCodeHere, devOnly: true },
  // Global with a modifier (spec #184): it also wins in the editor and never opens the browser's "Save page" dialog.
  { id: 'guardar', name: 'Save the text', keys: ['Mod+S'], scope: 'global', run: (e) => e.flushSave(), devOnly: true },
  // Esc of the editor: a key without modifier in the editor scope, so `resolveKey` never resolves it and yields to the
  // ephemeral CodeMirror layers (completion, search, multiple selection); the last layer of the editor keymap runs it.
  { id: 'salir-del-editor', name: 'Back to Views from the editor', keys: ['Escape'], scope: 'editor', inFinder: false, run: backToViews, devOnly: true },
  { id: 'seguir-al-agente-activar', name: 'Follow the agent: on', keys: [], scope: 'global', run: (e) => clientActivity(e.client).follow(true), devOnly: true },
  { id: 'seguir-al-agente-desactivar', name: 'Follow the agent: off', keys: [], scope: 'global', run: (e) => clientActivity(e.client).follow(false), devOnly: true },
];

/** "Open <tab>" for each island tab that does not already have its own command. */
const FROM_TABS: readonly Command[] = [
  ...LEFT_TABS.map((p) => ({ side: 'izquierda' as const, p })),
  ...RIGHT_TABS.map((p) => ({ side: 'derecha' as const, p })),
]
  .filter(({ p }) => !OWN.some((c) => c.id === `abrir-${p.id}`))
  .map(({ side, p }) => ({ id: `abrir-${p.id}`, name: `Open ${p.name}`, keys: [], scope: 'global' as const, ...(p.devOnly === true && { devOnly: true as const }), run: (e: DevUiContext) => e.openTab(side, p.id) }));

export const COMMANDS: readonly Command[] = [...OWN, ...FROM_TABS];

export const commandById = (id: string): Command | undefined => COMMANDS.find((c) => c.id === id);

/** The commands of `mode` (shortcuts, Finder and help); the export has no writing ones. */
export const commandsOf = (mode: DevUiMode): readonly Command[] => availableIn(COMMANDS, mode);
