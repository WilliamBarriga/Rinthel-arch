/**
 * Pure shortcut resolution: `(key, focus scope, platform) -> command | nothing`, without React or DOM.
 * Keys are declared as `Mod+Shift+Z`, `E` or `?` (`Mod` is Cmd on mac and Ctrl elsewhere); a key of a single
 * platform goes as `{ combo, onlyIn }` (Ctrl+Y redoes only outside mac).
 * Scopes, from highest to lowest priority: editor, text, canvas, global. Rules:
 * - The command of the focus scope wins; then the global one.
 * - A global with a modifier acts from any scope, except those marked `inText: false` (undo and redo: in the editor
 *   and in a text field their own history rules).
 * - Keys without a modifier act only with the focus outside text (canvas or global).
 * - With the focus on the canvas, Tab, arrows, Enter and Space belong to `InteractiveView`: they never resolve.
 * - Autorepeat triggers nothing.
 */

export type Scope = 'editor' | 'texto' | 'lienzo' | 'global';
export type Platform = 'mac' | 'otras';
export type Key = string | { combo: string; onlyIn: Platform };

export interface KeysDeclaration {
  id: string;
  keys: readonly Key[];
  scope: Scope;
  /** Only for globals with a modifier: `false` if it yields the key to the editor and text fields. */
  inText?: boolean;
}

export interface PressedKey {
  key: string;
  ctrlKey: boolean;
  metaKey: boolean;
  shiftKey: boolean;
  altKey: boolean;
  repeat: boolean;
}

interface KeyCombo {
  mod: boolean;
  ctrl: boolean;
  shift: boolean;
  alt: boolean;
  /** Lowercase; `space` for Space. */
  key: string;
}

const isLetter = (key: string): boolean => /^[a-z]$/.test(key);
/** Symbols (`?`, `/`): the key already reflects Shift, so it is not compared. */
const isSymbol = (key: string): boolean => key.length === 1 && !isLetter(key) && !/^[0-9]$/.test(key);
const CANVAS_KEYS = new Set(['tab', 'arrowup', 'arrowdown', 'arrowleft', 'arrowright', 'enter', 'space']);

function read(combo: string): KeyCombo {
  const parts = combo.split('+');
  // `Mod++` is not used; the last piece is the key.
  const key = (parts.pop() ?? '').toLowerCase();
  const mods = new Set(parts.map((p) => p.toLowerCase()));
  return { mod: mods.has('mod'), ctrl: mods.has('ctrl'), shift: mods.has('shift'), alt: mods.has('alt'), key };
}

/** Translates what was pressed to a KeyCombo in terms of `Mod`; `undefined` if it uses a foreign modifier (Meta outside mac). */
function pressed(t: PressedKey, platform: Platform): KeyCombo | undefined {
  const key = t.key === ' ' ? 'space' : t.key.toLowerCase();
  if (platform === 'mac') return { mod: t.metaKey, ctrl: t.ctrlKey, shift: t.shiftKey, alt: t.altKey, key };
  if (t.metaKey) return undefined;
  return { mod: t.ctrlKey, ctrl: false, shift: t.shiftKey, alt: t.altKey, key };
}

/** Outside mac, `Ctrl` and `Mod` are the same key. */
function normalize(c: KeyCombo, platform: Platform): KeyCombo {
  return platform === 'mac' || !c.ctrl ? c : { ...c, mod: true, ctrl: false };
}

function matches(declared: KeyCombo, real: KeyCombo): boolean {
  return declared.key === real.key && declared.mod === real.mod && declared.ctrl === real.ctrl && declared.alt === real.alt && (isSymbol(real.key) || declared.shift === real.shift);
}

function combos(d: KeysDeclaration, platform: Platform): string[] {
  return d.keys.flatMap((t) => (typeof t === 'string' ? [t] : t.onlyIn === platform ? [t.combo] : []));
}

const withModifier = (c: KeyCombo): boolean => c.mod || c.ctrl || c.alt;

export function resolveKey<C extends KeysDeclaration>(commands: readonly C[], key: PressedKey, scope: Scope, platform: Platform): C | undefined {
  if (key.repeat) return undefined;
  const real = pressed(key, platform);
  if (real === undefined) return undefined;
  const inText = scope === 'editor' || scope === 'texto';
  if (inText && !withModifier(real)) return undefined;
  if (scope === 'lienzo' && !withModifier(real) && CANVAS_KEYS.has(real.key)) return undefined;
  const responds = (c: C): boolean => combos(c, platform).some((t) => matches(normalize(read(t), platform), real));
  const own = commands.find((c) => c.scope === scope && responds(c));
  if (own !== undefined || scope === 'global') return own;
  return commands.find((c) => c.scope === 'global' && responds(c) && !(inText && c.inText === false));
}

/** Keys of a command as written on the platform (`Ctrl+Shift+Z`, `Cmd+/`, `?`). */
export function keyLabels(d: KeysDeclaration, platform: Platform): string[] {
  const mod = platform === 'mac' ? 'Cmd' : 'Ctrl';
  return combos(d, platform).map((t) =>
    t
      .split('+')
      .map((p) => (p === 'Mod' ? mod : p))
      .join('+'),
  );
}

/** `mac` if the browser runs on macOS or iOS. */
export function platformOf(nav: { platform?: string; userAgent?: string } | undefined): Platform {
  const text = `${nav?.platform ?? ''} ${nav?.userAgent ?? ''}`;
  return /Mac|iPhone|iPad|iPod/.test(text) ? 'mac' : 'otras';
}

/** Value of `aria-keyshortcuts` (`Control+Shift+Z Control+Y`); empty if the command has no keys on the platform. */
export function ariaShortcut(d: KeysDeclaration, platform: Platform): string {
  const name: Record<string, string> = { mod: platform === 'mac' ? 'Meta' : 'Control', ctrl: 'Control', shift: 'Shift', alt: 'Alt' };
  return combos(d, platform)
    .map((t) =>
      t
        .split('+')
        .map((p) => name[p.toLowerCase()] ?? p.toUpperCase())
        .join('+'),
    )
    .join(' ');
}
