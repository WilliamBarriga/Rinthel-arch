/** Shell state in the URL hash. No DOM except in `browserHash`. */
import { parseSequenceElementId } from 'canonical';
import type { CollapseState, CanonicalForm, Node } from 'canonical';
import type { Camera } from 'render';

/** Reader state that lives in the hash. `path` ends at the active View. */
export interface ShellState {
  path: string[];
  state: CollapseState;
  selected: string | null;
  step: number;
  camera?: Camera;
}

export interface HashAdapter {
  /** Current hash, with or without `#`. */
  read: () => string;
  /** Sets the hash (without `#`); `replace` adds no history entry. */
  write: (hash: string, options: { replace: boolean }) => void;
  /** Reports external changes (back/forward, manual edit); returns the unsubscribe. */
  subscribe: (notice: () => void) => () => void;
}

export function browserHash(win: Window): HashAdapter {
  return {
    read: () => win.location.hash,
    write: (hash, { replace }) => {
      const target = hash === '' ? win.location.pathname + win.location.search : `#${hash}`;
      if (replace) {
        try {
          win.history.replaceState(null, '', target);
        } catch {
          // Local files (file://): some browsers reject replaceState; a hash change replaces the entry anyway.
          win.location.replace(`#${hash}`);
        }
      }
      else if (hash === '') {
        try {
          win.history.pushState(null, '', target);
        } catch {
          win.location.hash = '';
        }
      }
      else win.location.hash = hash;
    },
    subscribe: (notice) => {
      win.addEventListener('hashchange', notice);
      win.addEventListener('popstate', notice);
      return () => {
        win.removeEventListener('hashchange', notice);
        win.removeEventListener('popstate', notice);
      };
    },
  };
}

const modelIds = (nodes: readonly Node[], accumulated = new Set<string>()): Set<string> => {
  for (const n of nodes) {
    accumulated.add(n.id);
    modelIds(n.children, accumulated);
  }
  return accumulated;
};

/** `interaction:path` (sequence Message, Fragment or Note) of an Interaction that exists in the source. */
function isInteractionElement(id: string, source: CanonicalForm): boolean {
  const parsed = parseSequenceElementId(id);
  return parsed !== undefined && parsed.operand === undefined && (source.model.interactions ?? []).some((i) => i.id === parsed.interaction);
}

/** The first View of the source; `undefined` if there are no Views. */
export const firstView = (source: CanonicalForm): string | undefined => source.views[0]?.id;

/** Entry Step: 1 in sequence and er with Steps (0 would leave them empty); 0 (before the first) in the rest. */
export const initialStepOfType = (kind: string, total: number): number => ((kind === 'sequence' || kind === 'er') && total > 0 ? 1 : 0);

export const initialStepOfView = (source: CanonicalForm, view: string | undefined): number => {
  const v = source.views.find((candidate) => candidate.id === view);
  return v === undefined ? 0 : initialStepOfType(v.type, v.steps?.length ?? 0);
};

/**
 * State -> hash (without `#`): `p` path (repeated), `e`/`c` open/closed Groups, `s` Selection, `t` Step,
 * `cam=x,y,w,h`. Omits what equals its default (the path `[initialView]`, the entry Step), so the initial state gives an empty hash.
 */
export function serializeState(state: ShellState, initialView?: string, source?: CanonicalForm): string {
  const p = new URLSearchParams();
  if (!(state.path.length === 1 && state.path[0] === initialView)) for (const v of state.path) p.append('p', v);
  for (const id of state.state.expanded ?? []) p.append('e', id);
  for (const id of state.state.collapsed ?? []) p.append('c', id);
  if (state.selected !== null) p.set('s', state.selected);
  const defaultStepValue = source === undefined ? 0 : initialStepOfView(source, state.path[state.path.length - 1]);
  if (state.step !== defaultStepValue) p.set('t', String(state.step));
  if (state.camera !== undefined) {
    const { x, y, width, height } = state.camera;
    p.set('cam', [x, y, width, height].join(','));
  }
  return p.toString();
}

function readCamera(text: string | null): Camera | undefined {
  if (text === null) return undefined;
  const parts = text.split(',');
  if (parts.length !== 4 || parts.some((s) => s.trim() === '')) return undefined;
  const [x, y, width, height] = parts.map(Number) as [number, number, number, number];
  if (![x, y, width, height].every(Number.isFinite) || width <= 0 || height <= 0) return undefined;
  return { x, y, width, height };
}

/**
 * Hash -> state validated against the source. Never throws: what is not understood or does not exist falls back to that
 * field's default. Collapse brings `expanded` and `collapsed` together, or is `{}`.
 */
export function deserializeState(hash: string, source: CanonicalForm, initialView: string | undefined = firstView(source)): ShellState {
  const p = new URLSearchParams(hash.startsWith('#') ? hash.slice(1) : hash);
  const viewList = new Set(source.views.map((v) => v.id));
  const nodes = modelIds(source.model.nodes);

  let path = p.getAll('p').filter((v) => viewList.has(v));
  if (path.length === 0) path = initialView === undefined ? [] : [initialView];
  const active = source.views.find((v) => v.id === path[path.length - 1]);

  const known = (key: string): string[] => p.getAll(key).filter((id) => nodes.has(id));
  const expanded = known('e');
  const collapsed = known('c');
  const state: CollapseState = expanded.length === 0 && collapsed.length === 0 ? {} : { expanded, collapsed };

  const s = p.get('s');
  const selected = s !== null && (nodes.has(s) || isInteractionElement(s, source)) ? s : null;

  const t = p.get('t');
  const initial = initialStepOfView(source, active?.id);
  const n = t !== null && /^\d+$/.test(t) ? Number(t) : initial;
  const step = n <= (active?.steps?.length ?? 0) ? n : initial;

  const camera = readCamera(p.get('cam'));
  return { path, state, selected, step, ...(camera !== undefined && { camera }) };
}
