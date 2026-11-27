/** Drill-down through `link`: active View and path (breadcrumbs), controllable or internal. The path allows repeats (cycles). */
import type { ReactElement } from 'react';

import { useControlled } from './controlled';

export interface NavigationProps {
  /** Controlled active View; without it the last element of the path rules. */
  view?: string | undefined;
  /** Initial View when neither `view` nor `path` are given. */
  defaultView?: string | undefined;
  /** Controlled path of visited Views; the last one is the active one. */
  path?: readonly string[] | undefined;
  /** The user navigates: the View that becomes active. */
  onViewChange?: ((view: string) => void) | undefined;
  /** The user navigates: the resulting path. */
  onPathChange?: ((path: string[]) => void) | undefined;
}

export interface Navigation {
  view: string;
  /** Current path, never empty and ending at `view`. */
  path: readonly string[];
  /** A `link` leads to `target`: it is appended to the path. */
  go: (target: string) => void;
  /** Goes back to the previous View of the path (does nothing if there is only one). */
  back: () => void;
  /** Goes back to position `index` of the path, discarding what follows. */
  goTo: (index: number) => void;
}

/** Reconciles the path with the active View: if they differ, truncates up to it or appends it. */
function reconcile(path: readonly string[], view: string): readonly string[] {
  if (path[path.length - 1] === view) return path;
  const index = path.lastIndexOf(view);
  return index >= 0 ? path.slice(0, index + 1) : [...path, view];
}

export function useNavigation(props: NavigationProps): Navigation {
  const initial = props.view ?? props.path?.[props.path.length - 1] ?? props.defaultView;
  if (initial === undefined) throw new Error('InteractiveView needs `view`, `path` or `defaultView`');
  const controlledPath = props.path !== undefined && props.path.length > 0 ? props.path : undefined;
  const [base, set] = useControlled<readonly string[]>(controlledPath, [initial], (nextPath) => {
    props.onPathChange?.([...nextPath]);
    props.onViewChange?.(nextPath[nextPath.length - 1]!);
  });
  const view = props.view ?? base[base.length - 1]!;
  const path = reconcile(base, view);

  return {
    view: view,
    path: path,
    go: (target) => set([...path, target]),
    back: () => {
      if (path.length > 1) set(path.slice(0, -1));
    },
    goTo: (index) => {
      if (index >= 0 && index < path.length - 1) set(path.slice(0, index + 1));
    },
  };
}

/** Back button and breadcrumbs (the active View is the last one, without a button). */
export function Breadcrumbs({ navigation }: { navigation: Navigation }): ReactElement {
  const { path, back, goTo } = navigation;
  return (
    <nav
      className="rd-chrome rd-migas"
      data-breadcrumbs
      aria-label="Breadcrumbs"
    >
      <button type="button" aria-label="Back" disabled={path.length <= 1} onClick={back}>
        &lt;
      </button>
      {path.map((id, i) =>
        i === path.length - 1 ? (
          <span key={i} data-crumb={id} aria-current="page">
            {id}
          </span>
        ) : (
          <span key={i} className="rd-contenido">
            <button type="button" data-crumb={id} onClick={() => goTo(i)}>
              {id}
            </button>
            <span aria-hidden>/</span>
          </span>
        ),
      )}
    </nav>
  );
}
