import { useEffect, useMemo, useRef, useState } from 'react';
import type { FocusEvent as ReactFocusEvent, KeyboardEvent as ReactKeyboardEvent, MouseEvent as ReactMouseEvent, ReactElement } from 'react';
import { select } from 'd3-selection';
import { zoom, zoomTransform } from 'd3-zoom';
import type { D3ZoomEvent } from 'd3-zoom';

import { sequenceElementId, resolveView } from 'canonical';
import type { CollapseState, CanonicalForm, Geometry, IconProvider, Theme, Visibility, ResolvedView } from 'canonical';
import { Diagram, fontSheet, resolveStyle } from 'render';
import type { Camera, ThemeComponents } from 'render';
import { resolveTheme } from 'theme';
import type { TextMeasures, TextToMeasure } from 'theme';

import { toCamera, toTransform, anchorBox, compensateCamera, fitTo, sameTransform } from './camera';
import { Legend, useHighContrast } from './accessibility';
import type { LegendMode, HighContrastProps } from './accessibility';
import { IssuesPanel, Toasts } from './notices';
import type { ViewerIssue } from './notices';
import { ChromeStyle, chromeVariables } from './chrome';
import { MAX_VISIBLE_NODES, toggleGroup, countVisibleNodes } from './collapse';
import { DEFAULT_SETTINGS } from './configuration';
import type { InteractionSettings } from './configuration';
import { nodeIdAt, useDrag } from './drag';
import type { OnReorderLifelines } from './drag';
import { unitAt } from './order-lifelines';
import { useControlled } from './controlled';
import { withTransientStates, useSelection } from './selection';
import { refNavigationTarget, elementAt } from './interaction';
import type { SelectableElement } from './interaction';
import { pathStates, moveFocus, moveFocusInSequence, shortestPath, mergeStates } from './path-and-focus';
import { Breadcrumbs, useNavigation } from './navigation';
import type { NavigationProps } from './navigation';
import { useGeometry } from './geometry';
import { unservedFontsNotice, familyHashes, measureInViewer } from './viewer-measurement';
import type { Computation } from './geometry';
import { interpolateGeometry, useMorph, morphVisibility } from './morph';
import type { FrameClock } from './morph';
import { useSteps } from './steps';
import type { StepsProps } from './steps';
import { clipToViewport } from './viewport';
import { detailLevel } from './semantic-zoom';
import type { DetailThresholds } from './semantic-zoom';

export type LayoutAdapter = (view: ResolvedView, theme: Theme, measures?: TextMeasures) => Promise<Geometry>;

/** Measures texts with the real font (`measureInViewer`); without a measurer the layout estimates per character. */
export type TextMeasurer = (texts: TextToMeasure[]) => Promise<TextMeasures>;

export interface InteractiveViewProps extends StepsProps, NavigationProps, HighContrastProps {
  /** Node kind legend derived from the Theme: `auto` (default) only if two Node kinds differ only by color. */
  legend?: LegendMode;
  /** Theme components (`code` Layer) by name; the adapter registers them (`dev`), the shell only passes them to `Diagram`. */
  components?: ThemeComponents;
  source: CanonicalForm;
  theme: Theme;
  layout: LayoutAdapter;
  /** Real text measuring; with it the layout waits for the measures and the layout key includes the font hash and the `medido` level. */
  measure?: TextMeasurer;
  /**
   * Workspace font files (path -> content hash). With them and `fontUrl` the viewer declares the
   * `@font-face` of each Theme font and, if there is no `measure`, measures with the real font (`measureInViewer`).
   */
  fontFiles?: Readonly<Record<string, string>>;
  /** URL the browser uses to request a Workspace font file (in `dev`, its fonts route). */
  fontUrl?: (path: string) => string;
  /** Canvas size in px. */
  width: number;
  height: number;
  /** Controlled collapse state (`resolveView`); without it the component keeps its own. */
  state?: CollapseState;
  /** Reports the collapse state that results from toggling a Group. */
  onStateChange?: (state: CollapseState) => void;
  /** Cached geometry of the View's default state (without `state`): used without relayout. */
  cachedGeometry?: Geometry;
  /** Cached geometry per View id; it rules over `cachedGeometry` for that View (useful when navigating). */
  cachedGeometries?: Readonly<Record<string, Geometry>>;
  /** Morph duration when toggling a Group, in ms; 0 disables it. Defaults to 300. */
  morphMs?: number;
  /** Cap on visible Nodes; an expansion that exceeds it is rejected. Defaults to 1000. */
  maxNodes?: number;
  /** An expansion was rejected for exceeding `maxNodes`. */
  onLimit?: (id: string) => void;
  /** Controlled camera, in geometry units; without it the component keeps its own. */
  camera?: Camera;
  /** User pan or zoom: the resulting camera. */
  onCameraChange?: (camera: Camera) => void;
  /** Controlled selected element (Node id, Edge id or `node#attribute`); without it the component keeps its Selection. */
  selected?: string | null;
  /** An element was selected: its id (Node, Edge or label by `edgeId`, Attribute as `node#attribute`). */
  onSelect?: (id: string) => void;
  /** Double click on an element (Node, Edge, Attribute, Message...): its kind and id, as in `onSelect`; that double click does not zoom. */
  onOpen?: (element: SelectableElement) => void;
  /** Controlled multiple Selection (ids as in `selected`); it rules over `selected` and the internal one. */
  selection?: readonly string[];
  /** The Selection changed (on press, accumulate or remove): all its ids in selection order; `[]` if it ends up empty. */
  onSelectionChange?: (ids: string[]) => void;
  /**
   * Enables dragging Nodes (only under `dev`; without it, dragging a Node moves the camera). On release it reports
   * the new center of the Node (Pin coordinate), relative to its parent Group and in geometry units, like a Pin. The Node
   * stays at the dropped position until another geometry arrives; if the callback returns a promise that resolves
   * `false` (or rejects), it goes back to its place. A drag neither selects nor navigates.
   */
  onMoveNode?: (motion: { id: string; x: number; y: number }) => void | boolean | Promise<boolean | void>;
  /**
   * Enables reordering Lifelines by drag in a sequence View (only under `dev`): dragging the header of
   * a Lifeline, or the title of a `box`, reports the full visible order (`order`, ids from left to right); a
   * child does not leave the `box` of its Group and the title moves the block. Same return contract as `onMoveNode`.
   */
  onReorderLifelines?: OnReorderLifelines;
  /**
   * Highlighted path: Node ids in order. Its Nodes and the Edges between consecutive ones become `on-path` and everything
   * else `dimmed`. Without it, with exactly two Nodes selected the shortest path between them is highlighted.
   */
  route?: readonly string[];
  /** Visibility 0..1 of Nodes and Edges; if given, it rules over the one derived from the Steps. */
  visibility?: Visibility;
  /** Scales from which semantic zoom shows the title and title + Attributes (see `detailLevel`). */
  detailThresholds?: DetailThresholds;
  /** Icon provider for the Nodes (`icon` keys -> inline SVG); without it, no icons are drawn. */
  icons?: IconProvider;
  /** Interaction thresholds and margins (drag, Edge hit, scale, framing); see `InteractionSettings`. */
  tuning?: Partial<InteractionSettings>;
  /** Canvas chrome (issues panel, toasts, legend, breadcrumbs). Defaults to `true`; `false` omits it to mount it outside. */
  chrome?: boolean;
  /** Issues of the source; drawn as a clickable panel inside the canvas, with the Theme. */
  issues?: readonly ViewerIssue[];
  /** Ephemeral notices (the parent decides when to remove them); drawn inside the canvas, with the Theme. */
  toasts?: readonly string[];
  /** Morph clock; defaults to `requestAnimationFrame`. */
  clock?: FrameClock;
  /** Layout adapter failure; without it the failure is thrown on render. */
  onError?: (error: Error) => void;
}

/** Navigates through the `link`s of the active View; each View change remounts it and resets its uncontrolled state. */
export function InteractiveView(props: InteractiveViewProps): ReactElement {
  const navigation = useNavigation(props);
  const { view, go } = navigation;
  const declared = props.view ?? props.defaultView;
  const geometry = props.cachedGeometries?.[view] ?? (view === declared ? props.cachedGeometry : undefined);
  return <ActiveView key={view} {...props} view={view} cachedGeometry={geometry} onLink={go} breadcrumbs={<Breadcrumbs navigation={navigation} />} />;
}

interface ActiveViewProps extends Omit<InteractiveViewProps, 'view' | 'cachedGeometry'> {
  view: string;
  cachedGeometry: Geometry | undefined;
  /** A Node with `link` was pressed: the target View. */
  onLink: (target: string) => void;
  /** Breadcrumbs and back button, drawn inside the canvas. */
  breadcrumbs: ReactElement;
}

function ActiveView(props: ActiveViewProps): ReactElement {
  const { source, view, layout, width, height, onError, onSelect, cachedGeometry, morphMs = 300, maxNodes = MAX_VISIBLE_NODES } = props;
  const withChrome = props.chrome !== false;
  const { theme, toggleSwitch, reducedMotion } = useHighContrast(props.theme, props);
  const [state, setCollapseState] = useControlled<CollapseState>(props.state, {}, props.onStateChange);
  const settings = { ...DEFAULT_SETTINGS, ...props.tuning };
  const currentSettings = useRef(settings);
  currentSettings.current = settings;
  const resolvedView = useMemo(() => {
    const resolved = resolveView(source, view, state);
    if (resolved === undefined) throw new Error(`View '${view}' does not exist in the Canonical form`);
    return resolved;
  }, [source, view, state]);

  const seed = useMemo(() => {
    if (cachedGeometry === undefined) return undefined;
    const byDefault = resolveView(source, view);
    return byDefault === undefined ? undefined : { view: byDefault, geometry: cachedGeometry };
  }, [source, view, cachedGeometry]);
  const pending = useRef<string | undefined>(undefined);
  const onArrive = (previous: Computation | undefined, latest: Computation): void => {
    const anchor = pending.current;
    pending.current = undefined;
    if (previous === undefined || anchor === undefined) return;
    const before = anchorBox(previous.view, previous.geometry, anchor);
    const after = anchorBox(latest.view, latest.geometry, anchor);
    if (before === undefined || after === undefined) return;
    setCamera(compensateCamera(baseCamera.current, before, after));
    morpher.start({ from: previous.geometry, to: latest.geometry, anchor });
  };
  const morpher = useMorph(morphMs, props.clock);
  const { fontFiles, fontUrl } = props;
  const fontHashes = useMemo(() => (fontFiles === undefined ? undefined : familyHashes(resolveTheme(theme).fonts, fontFiles)), [fontFiles, theme]);
  const measureWithFonts = useMemo<TextMeasurer | undefined>(
    () => (props.measure !== undefined || fontHashes === undefined || fontUrl === undefined ? props.measure : (texts) => measureInViewer(texts, { hashes: fontHashes })),
    [props.measure, fontHashes, fontUrl],
  );
  // Without `fontUrl` the viewer cannot request the Theme fonts: it says so, instead of measuring and painting silently with the fallback.
  const fontNotices = useMemo(() => (fontUrl === undefined ? unservedFontsNotice(resolveTheme(theme).fonts) : []), [fontUrl, theme]);
  const computation = useGeometry({ view: resolvedView, theme, layout, measure: measureWithFonts, fontsKey: JSON.stringify(fontHashes), seed, onError, onArrive });

  // Until the user or a collapse moves it, the camera frames the whole View from the first geometry.
  const [moved, setCamera] = useControlled<Camera | undefined>(props.camera, undefined, (newOne) => newOne && lastOne.current.onCameraChange?.(newOne));
  const framing = useRef<Camera | undefined>(undefined);
  if (framing.current === undefined && computation !== undefined) framing.current = fitTo(computation.geometry, width, height, settings.fitMargin);
  const camera = moved ?? framing.current ?? { x: 0, y: 0, width, height };
  const baseCamera = useRef(camera);
  baseCamera.current = camera;

  const steps = useSteps(resolvedView, props);
  const visibility = steps.visibility;

  const zone = useRef<HTMLDivElement>(null);
  const behavior = useRef(zoom<HTMLDivElement, unknown>());
  const silence = useRef(false);
  const lastOne = useRef(props);
  lastOne.current = props;
  const currentCamera = useRef(camera);
  const currentGeometry = useRef<Geometry | undefined>(undefined);
  currentGeometry.current = computation?.geometry;
  const currentView = useRef(resolvedView);
  currentView.current = computation?.view ?? resolvedView;
  const { shifted, dragging, inProgress } = useDrag({
    zone: zone,
    onNodeMove: props.onMoveNode,
    onReorder: props.onReorderLifelines,
    computation: computation,
    currentCamera: currentCamera,
    width: width,
    threshold: settings.dragThreshold,
  });

  /** A mousedown that grabs a header or the title of a `box` in sequence is a drag, not a pan. */
  const grabsInSequence = (event: MouseEvent): boolean => {
    const geometry = currentGeometry.current;
    if (geometry?.kind !== 'secuencia') return false;
    const box = zone.current!.getBoundingClientRect();
    const k = width / currentCamera.current.width;
    const activeView = currentView.current;
    return unitAt(geometry, activeView.type === 'sequence' ? (activeView.interaction.groups ?? []) : [], { x: currentCamera.current.x + (event.clientX - box.left) / k, y: currentCamera.current.y + (event.clientY - box.top) / k }) !== undefined;
  };

  useEffect(() => {
    const node = zone.current!;
    const comp = behavior.current;
    comp
      .filter((event: Event) => {
        if (lastOne.current.onMoveNode !== undefined && event.type === 'mousedown' && nodeIdAt(event.target) !== undefined) return false;
        if (lastOne.current.onReorderLifelines !== undefined && event.type === 'mousedown' && grabsInSequence(event as MouseEvent)) return false;
        return (!(event as MouseEvent).ctrlKey || event.type === 'wheel') && !(event as MouseEvent).button;
      })
      .extent([
        [0, 0],
        [width, height],
      ])
      .scaleExtent([settings.minScale, settings.maxScale])
      .on('zoom', (event: D3ZoomEvent<HTMLDivElement, unknown>) => {
        if (silence.current) return;
        morpher.cancel();
        setCamera(toCamera(event.transform, width, height));
      });
    select(node).call(comp);
    return () => {
      select(node).on('.zoom', null);
    };
  }, [width, height, settings.minScale, settings.maxScale]);

  // Brings d3-zoom to the current camera when they differ (controlled camera the parent changed or ignored).
  useEffect(() => {
    const node = zone.current!;
    const desired = toTransform(camera, width);
    if (sameTransform(zoomTransform(node), desired)) return;
    silence.current = true;
    try {
      behavior.current.transform(select(node), desired);
    } finally {
      silence.current = false;
    }
  });

  // During the morph the interpolated geometry is drawn and the camera follows the touched Group.
  const { morph } = morpher;
  const shown = useMemo<Computation | undefined>(() => {
    const base =
      computation === undefined || morph === undefined
        ? computation
        : { ...computation, geometry: interpolateGeometry(morph.from, morph.to, morph.t) };
    const box = shifted === undefined ? undefined : base?.geometry.nodes[shifted.id];
    if (base === undefined || shifted === undefined || box === undefined) return base;
    return { view: base.view, geometry: { ...base.geometry, nodes: { ...base.geometry.nodes, [shifted.id]: { ...box, x: shifted.x, y: shifted.y } } } };
  }, [computation, morph, shifted]);
  const viewCamera = useMemo<Camera>(() => {
    if (computation === undefined || shown === undefined || morph === undefined) return camera;
    const finalValue = anchorBox(computation.view, morph.to, morph.anchor);
    const now = anchorBox(shown.view, shown.geometry, morph.anchor);
    return finalValue === undefined || now === undefined ? camera : { ...camera, x: camera.x - finalValue.x + now.x, y: camera.y - finalValue.y + now.y };
  }, [computation, shown, morph, camera]);
  const shownVisibility = useMemo(
    () => (morph === undefined ? visibility : morphVisibility(morph.from, morph.to, morph.t, visibility)),
    [morph, visibility],
  );

  currentCamera.current = viewCamera;
  const { x, y, width: cameraWidth, height: cameraHeight } = viewCamera;
  const clipped = useMemo(
    () => (shown === undefined ? undefined : clipToViewport(shown.view, shown.geometry, { x, y, width: cameraWidth, height: cameraHeight })),
    [shown, x, y, cameraWidth, cameraHeight],
  );

  const { selection, states: selectionStates, press } = useSelection(resolvedView, props.selected, props.selection);
  const [hover, setHover] = useState<string | undefined>(undefined);
  const states = useMemo(() => withTransientStates(selectionStates, inProgress === undefined ? hover : undefined, inProgress), [selectionStates, hover, inProgress]);
  const measures = computation?.measures;
  const style = useMemo(() => resolveStyle(theme, resolvedView.type, undefined, fontFiles === undefined ? undefined : Object.keys(fontFiles), measures), [theme, fontFiles, measures, resolvedView.type]);

  const inSequence = resolvedView.type === 'sequence';
  const visible = (id: string): boolean => (visibility?.(id) ?? 1) > 0;
  const selectedNodes = selection.filter((e) => e.kind === 'nodo').map((e) => e.id);
  const path = useMemo(() => {
    if (inSequence) return [];
    if (props.route !== undefined) return props.route;
    if (selectedNodes.length !== 2) return [];
    return shortestPath(resolvedView, selectedNodes[0]!, selectedNodes[1]!) ?? [];
  }, [props.route, resolvedView, selectedNodes.join('\n')]);
  const [focus, setFocus] = useState<string | undefined>(undefined);
  const currentFocus =
    focus !== undefined && (resolvedView.nodes.some((n) => n.id === focus) || (inSequence && resolvedView.interaction.messages.some((m) => sequenceElementId(resolvedView.interaction.id, m.path) === focus))) ? focus : undefined;
  const finalStates = useMemo(
    () => mergeStates(mergeStates(states, pathStates(resolvedView, path)), currentFocus === undefined ? {} : { [currentFocus]: ['focus'] }),
    [states, resolvedView, path, currentFocus],
  );

  const toggle = (id: string): void => {
    if (dragging.current) return;
    const next = toggleGroup(state, resolvedView, id);
    if (next === undefined) return;
    const newOne = resolveView(source, view, next);
    if (newOne === undefined) return;
    if (countVisibleNodes(newOne) > maxNodes && countVisibleNodes(newOne) > countVisibleNodes(resolvedView)) {
      props.onLimit?.(id);
      return;
    }
    pending.current = id;
    setCollapseState(next);
  };

  /** Enter or Space on a Node: if it has a `link` it navigates; otherwise it collapses or opens the Group. */
  const activate = (id: string): void => {
    const target = resolvedView.nodes.find((n) => n.id === id)?.link;
    if (target !== undefined && source.views.some((v) => v.id === target)) props.onLink(target);
    else toggle(id);
  };

  const handleFocus = (event: ReactFocusEvent): void => {
    if (event.target === event.currentTarget) setFocus((current) => current ?? (inSequence ? moveFocusInSequence(resolvedView, undefined, 'siguiente', visible) : moveFocus(resolvedView, undefined, 'siguiente')));
  };
  const handleBlur = (event: ReactFocusEvent): void => {
    if (event.target === event.currentTarget) setFocus(undefined);
  };
  /** Tab walks in Model order (and releases focus when leaving at an end), arrows jump along Edges, Enter/Space collapses or opens. */
  const handleKeyDown = (event: ReactKeyboardEvent): void => {
    if (event.target !== event.currentTarget) return;
    const move = (motion: Parameters<typeof moveFocus>[2] | Parameters<typeof moveFocusInSequence>[2]): boolean => {
      const next = inSequence ? moveFocusInSequence(resolvedView, currentFocus, motion as Parameters<typeof moveFocusInSequence>[2], visible) : moveFocus(resolvedView, currentFocus, motion as Parameters<typeof moveFocus>[2]);
      if (next === undefined) return false;
      setFocus(next);
      return true;
    };
    let handled = false;
    switch (event.key) {
      case 'Tab':
        handled = move(event.shiftKey ? 'anterior' : 'siguiente');
        break;
      case 'ArrowRight':
        handled = move(inSequence ? 'derecha' : 'adelante');
        break;
      case 'ArrowDown':
        handled = move(inSequence ? 'abajo' : 'adelante');
        break;
      case 'ArrowLeft':
        handled = move(inSequence ? 'izquierda' : 'atras');
        break;
      case 'ArrowUp':
        handled = move(inSequence ? 'arriba' : 'atras');
        break;
      case 'Enter':
      case ' ':
        if (currentFocus !== undefined) activate(currentFocus);
        handled = true;
        break;
    }
    if (handled) event.preventDefault();
  };

  const detail = detailLevel(width / cameraWidth, props.detailThresholds);

  /** Element under the mouse, over the whole View (not the one clipped to the viewport). */
  const elementUnderMouse = (event: ReactMouseEvent) => {
    if (shown === undefined || (event.target as Element).closest('[data-diagram]') === null) return undefined;
    const box = zone.current!.getBoundingClientRect();
    const k = width / currentCamera.current.width;
    const point = { x: currentCamera.current.x + (event.clientX - box.left) / k, y: currentCamera.current.y + (event.clientY - box.top) / k };
    return elementAt(shown.view, shown.geometry, theme, point, { tolerance: settings.hitTolerance / k, attributes: detail === 'completo', ...(visibility !== undefined && { visibility }) });
  };

  /** In capture: on an element, the double click opens it and does not reach d3's zoom (which stops it in the drawing). */
  const handleOpen = (event: ReactMouseEvent): void => {
    if (dragging.current || props.onOpen === undefined) return;
    const element = elementUnderMouse(event);
    if (element === undefined) return;
    event.stopPropagation();
    props.onOpen({ kind: element.kind, id: element.id });
  };

  const handleMouseMove = (event: ReactMouseEvent): void => {
    if (inProgress !== undefined) return;
    setHover(elementUnderMouse(event)?.id);
  };

  const handlePress = (event: ReactMouseEvent): void => {
    if (dragging.current) return;
    const element = elementUnderMouse(event);
    if (element === undefined) return;
    const accumulates = event.shiftKey || event.ctrlKey || event.metaKey;
    const result = press(element, accumulates);
    props.onSelectionChange?.(result.selection.map((e) => e.id));
    if (!result.selectedOne) return;
    onSelect?.(element.id);
    if (accumulates) return;
    if (element.kind === 'fragmento') {
      const refTarget = refNavigationTarget(resolvedView, view, source.views, element.id);
      if (refTarget !== undefined) props.onLink(refTarget);
      return;
    }
    if (element.kind !== 'nodo') return;
    const target = resolvedView.nodes.find((n) => n.id === element.id)?.link;
    if (target !== undefined && source.views.some((v) => v.id === target)) props.onLink(target);
  };

  return (
    <div ref={zone} onClick={handlePress} onDoubleClickCapture={handleOpen} onMouseMove={handleMouseMove} onMouseLeave={() => setHover(undefined)} className="rd-vista" data-vista={view} data-layout={computation !== undefined && computation.view === resolvedView && morph === undefined ? 'listo' : 'calculando'} tabIndex={0} onKeyDown={handleKeyDown} onFocus={handleFocus} onBlur={handleBlur} style={{ ...chromeVariables(style), width, height }}>
      <ChromeStyle />
      {fontUrl !== undefined && style.faces.length > 0 && <style data-fuentes="">{fontSheet(style.faces, fontUrl)}</style>}
      {shown !== undefined && clipped !== undefined && (
        <Diagram
          view={clipped}
          geometry={shown.geometry}
          theme={theme}
          {...(props.icons !== undefined && { icons: props.icons })}
          {...(props.components !== undefined && { components: props.components })}
          width={width}
          height={height}
          camera={viewCamera}
          detail={detail}
          states={finalStates}
          style={style}
          {...(fontUrl !== undefined && { fontUrl })}
          onToggle={toggle}
          {...(reducedMotion !== undefined && { reducedMotion })}
          {...(shownVisibility !== undefined && { visibility: shownVisibility })}
        />
      )}
      {steps.controls}
      {toggleSwitch}
      {withChrome && <Legend source={source} view={resolvedView} theme={theme} mode={props.legend ?? 'auto'} />}
      {withChrome && props.breadcrumbs}
      {withChrome && <IssuesPanel issues={[...(props.issues ?? []), ...fontNotices]} />}
      {withChrome && <Toasts toasts={props.toasts ?? []} />}
    </div>
  );
}
