# Design: final shape of `InteractiveView` (ticket #102, spec #91)

Complements ADR 0007. It describes how the shell looks after the cleanup; it changes neither observable behavior nor the public interface, except for two optional additions (`tuning`, `clock`) and the removal of the `IntencionDePinEnviada` alias.

## Starting point

`InteractiveView` (in `packages/shell/src/interactive-view.tsx`) is still the adapter between d3-zoom/DOM and the core (`interaction.ts`, `collapse.ts`, `geometry.ts`). The intent and history core (#100) lives in `session` (`intents.ts`), outside `InteractiveView`; the edit control was removed from `shell` in #165 (ADR 0007, Shell section). What stays inside the component: d3 camera, Node drag, selection, collapse with morph, steps and navigation through hooks.

## One mechanism for controlled props: `useControlled`

`controlled.ts` exports `useControlled<T>(controlled, initial, onChange) -> [current, set]`.

- `current` is `controlled` if the parent gives it; otherwise the own value.
- `set(next)` stores the own value only in uncontrolled mode, always calls `onChange`, and in controlled mode re-renders so d3 reconciles a change the parent ignored.
- `set` reads refs, not its closure: it is safe from effects and long-lived callbacks (d3 zoom, the arrival callback of `useGeometry`).

Uses: collapse state (`state`/`onStateChange`), camera (`camera`/`onCameraChange`, with its own `undefined` until the first move and the fit as fallback), Step (`step`/`onStepChange`) and navigation path (`path`/`onPathChange` + `onViewChange`). The selection does not use it: its prop is an id (`selected`, `string | null`, or the `selection` list in multiple selection) and its own state is a `Selection` with an element kind; they are different representations, not the same value.

## Responsibilities per file

- `collapse.ts`: Groups. `findNode`, `countVisibleNodes`, `toggleGroup`, cap `MAX_VISIBLE_NODES`. Pure, without camera or animation.
- `camera.ts`: camera. `fitTo`, the `toCamera`/`toTransform` conversions with d3-zoom, `compensateCamera`.
- `morph.ts`: animation. `interpolateGeometry`, `morphVisibility` (pure) and `useMorph`.
- `order-lifelines.ts` (ADR 0009, after this design): reorder Lifelines by dragging their header; pure, over the sequence Geometry.
- `configuration.ts`: `InteractionSettings` and `DEFAULT_SETTINGS`.
- `controlled.ts`: the hook above.

## Configuration instead of constants

Drag threshold (3 px), Edge hit tolerance (4 px), minimum (0.05) and maximum (16) scale and fit margin (24) move to `InteractionSettings`. `InteractiveView` accepts `tuning?: Partial<InteractionSettings>`; the defaults reproduce the previous values.

## Clock as a dependency of `useMorph`

`useMorph(durationMs, clock?)` takes a `FrameClock = (frame: (nowMs) => void) => () => void` (it requests a frame and returns its cancellation). The default is the `requestAnimationFrame` adapter (`browserClock`); without it, or with duration 0, there is no animation, as before. `InteractiveView` exposes it as `clock?`. Tests inject a clock they advance by hand, without global stubs.

## Removed alias

`IntencionDePinEnviada` (alias of `PinIntent`) is removed from the pin sender and from `index.ts`. Nobody in the repo uses it; `PinIntent` is still re-exported from `shell`. Later, #167 deleted the pin sender: `shell` no longer exports HTTP clients.

## Drag and selection hooks (ticket #109)

`InteractiveView` delegates two responsibilities to hooks, without changing behavior:

- `drag.ts`: `useDrag` (mouse gesture for Nodes under `dev`, provisional `shifted` position, `dragging` flag to ignore the following click) and `nodeIdAt`.
- `selection.ts`: `useSelection` (Selection controlled by id or own, `states` for the render and `press`).

## Out of scope

Trimming the `index.ts` comment that duplicated the props JSDoc is not done here (done later: the `index.ts` header only summarizes the interface, `docs/CODING.md`).
