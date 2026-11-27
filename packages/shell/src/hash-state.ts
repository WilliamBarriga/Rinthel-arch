/**
 * Controlled props of `InteractiveView` stored in the URL hash; they are spread as is. Changing View
 * resets collapse, Selection, Step and camera and pushes a history entry; an external hash change replaces the state.
 */
import { useEffect, useRef, useState } from 'react';

import type { CollapseState, CanonicalForm } from 'canonical';
import type { Camera } from 'render';

import { deserializeState, initialStepOfView, serializeState, firstView } from './hash';
import type { HashAdapter, ShellState } from './hash';

export interface HashStateOptions {
  source: CanonicalForm;
  hash: HashAdapter;
  /** Initial View when the hash says nothing else; by default the first of the source. */
  defaultView?: string;
  /** Also stores the camera in the hash. Defaults to `false`. */
  camera?: boolean;
}

/** Props of `InteractiveView` governed by the hash. */
export interface HashStateProps {
  view: string;
  path: string[];
  state: CollapseState;
  selected: string | null;
  step: number;
  camera?: Camera;
  onPathChange: (path: string[]) => void;
  onStateChange: (state: CollapseState) => void;
  onSelect: (id: string) => void;
  onStepChange: (step: number) => void;
  onCameraChange: (camera: Camera) => void;
}

export function useHashState(options: HashStateOptions): HashStateProps {
  const { source, hash, camera: withCamera = false } = options;
  const initial = options.defaultView ?? firstView(source);
  const read = (): ShellState => {
    const e = deserializeState(hash.read(), source, initial);
    if (!withCamera) delete e.camera;
    return e;
  };
  const [state, setStateValue] = useState<ShellState>(read);
  const current = useRef(state);
  const lastOne = useRef({ hash, initial, withCamera, read, source });
  lastOne.current = { hash, initial, withCamera, read, source };

  useEffect(
    () =>
      hash.subscribe(() => {
        const latest = lastOne.current.read();
        const { initial: startValue } = lastOne.current;
        if (serializeState(latest, startValue, lastOne.current.source) === serializeState(current.current, startValue, lastOne.current.source)) return;
        current.current = latest;
        setStateValue(latest);
      }),
    [hash],
  );

  const apply = (next: ShellState, replace: boolean): void => {
    const { hash: h, initial: startValue, source } = lastOne.current;
    const text = serializeState(next, startValue, source);
    const previous = serializeState(current.current, startValue, source);
    current.current = next;
    setStateValue(next);
    if (text !== previous) h.write(text, { replace });
  };

  const view = state.path[state.path.length - 1] ?? '';
  const props: HashStateProps = {
    view,
    path: state.path,
    state: state.state,
    selected: state.selected,
    step: state.step,
    onPathChange: (path) => {
      const e = current.current;
      const viewChange = path[path.length - 1] !== e.path[e.path.length - 1];
      apply(viewChange ? { path, state: {}, selected: null, step: initialStepOfView(lastOne.current.source, path[path.length - 1]) } : { ...e, path }, !viewChange && path.length <= e.path.length);
    },
    onStateChange: (state) => apply({ ...current.current, state }, true),
    onSelect: (selected) => apply({ ...current.current, selected }, true),
    onStepChange: (step) => apply({ ...current.current, step }, true),
    onCameraChange: (camera) => {
      if (lastOne.current.withCamera) apply({ ...current.current, camera }, true);
    },
  };
  if (state.camera !== undefined) props.camera = state.camera;
  return props;
}
