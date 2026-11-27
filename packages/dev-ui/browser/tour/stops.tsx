/**
 * The fixed script of the "Start here" tour. Each stop uses the open Workspace's data (read once, when the tour
 * opens, so moving between Views during the tour does not rewrite the next stops) and falls back to generic text.
 * Stops: canvas, Views, Drill-down (skipped without a `link`), Steps, Themes, then Code and Agent in `dev` (`devOnly`) or
 * "In your repo" in the export (`exportOnly`), filtered with `availableIn`.
 */
import type { ReactElement, ReactNode } from 'react';

import type { CanonicalForm, Node, View } from 'canonical';

import { openCodeInBlock } from '../commands/registry';
import type { DevUiContext } from '../frame/context';
import { availableIn, canWriteIn } from '../frame/mode';
import type { WithMode, DevUiMode } from '../frame/mode';

export interface TourStop extends WithMode {
  title: string;
  text: ReactNode;
  /** Selector of the real area the stop highlights; without it the card goes to the center. */
  zone?: string;
  /** Moves the UI to what the stop talks about (a View, a tab, a Step). */
  prepare?(devUi: DevUiContext): void;
}

const CANVAS_ZONE = '.ui-lienzo';
const LEFT_ISLAND = '#ui-isla-izquierda';
const RIGHT_ISLAND = '#ui-isla-derecha';

const Datum = ({ children }: { children: ReactNode }): ReactElement => <code className="ui-tour-dato">{children}</code>;

function nodeTitle(nodes: readonly Node[], id: string): string | undefined {
  for (const n of nodes) {
    if (n.id === id) return n.title;
    const child = nodeTitle(n.children, id);
    if (child !== undefined) return child;
  }
  return undefined;
}

/** "2 architecture and 1 flow", in declaration order of the Diagram types. */
function viewsByKind(views: readonly View[]): string {
  const count = new Map<string, number>();
  for (const v of views) count.set(v.type, (count.get(v.type) ?? 0) + 1);
  const parts = [...count].map(([kind, n]) => `${n} ${kind}`);
  return parts.length < 2 ? (parts[0] ?? '') : `${parts.slice(0, -1).join(', ')} and ${parts[parts.length - 1]!}`;
}

const preferred = (views: readonly View[], kind: string): View | undefined => views.find((v) => v.type === kind) ?? views[0];

/** The script for the Workspace `fuente` (`undefined` if it never compiled), its active View and the mode. */
export function tourStops(source: CanonicalForm | undefined, activeView: string | undefined, mode: DevUiMode): readonly TourStop[] {
  const views = source?.views ?? [];
  const active = views.find((v) => v.id === activeView);
  const withLink = preferred(views.filter((v) => v.links.length > 0), 'architecture');
  const link = withLink?.links[0];
  const withSteps = preferred(views.filter((v) => v.steps.length > 0), 'flow');
  const canWrite = canWriteIn(mode);
  const stops: TourStop[] = [];

  stops.push({
    title: 'Your repo as a diagram',
    text: (
      <>
        {active !== undefined && (
          <>
            You are on the View <Datum>{active.id}</Datum> ({active.type}).{' '}
          </>
        )}
        Each box is a part of the system; drag the background to move around and use the wheel to zoom.
      </>
    ),
    zone: CANVAS_ZONE,
  });

  stops.push({
    title: 'Views',
    text: (
      <>
        One Model, many cuts.{' '}
        {views.length > 0 ? <>This Workspace has {viewsByKind(views)} Views.</> : 'Architecture, flows, sequences and tables.'} Pick one here; the breadcrumbs
        at the top take you back.
      </>
    ),
    zone: LEFT_ISLAND,
    prepare: (e) => e.openTab('izquierda', 'vistas'),
  });

  if (source !== undefined && withLink !== undefined && link !== undefined) {
    const node = nodeTitle(source.model.nodes, link.node) ?? link.node;
    stops.push({
      title: 'Drill-down',
      text: (
        <>
          <Datum>{node}</Datum> has its own View: click it to open <Datum>{link.view}</Datum>.
          {canWrite && ' The Details on the right tell where it lives in the code.'}
        </>
      ),
      // The canvas, where the Node to click is; the Details island floats over it, so it stays live too.
      zone: CANVAS_ZONE,
      prepare: (e) => {
        e.goToView(withLink.id);
        e.select(link.node);
        e.openTab('derecha', 'detalle');
      },
    });
  }

  stops.push({
    title: 'Steps',
    text:
      withSteps !== undefined ? (
        <>
          <Datum>{withSteps.id}</Datum> is told in {withSteps.steps.length} Steps, starting with "{withSteps.steps[0]!.title}". Go forward with &gt; to reveal one at a
          time; it works as is for a talk.
        </>
      ) : (
        'Some Views are told in Steps: go forward with > to reveal one at a time. It works as is for a talk.'
      ),
    ...(withSteps !== undefined && {
      zone: '.rd-pasos',
      prepare: (e: DevUiContext) => {
        e.goToView(withSteps.id);
        e.goToStep(1);
      },
    }),
  });

  stops.push({
    title: 'Themes',
    text: (
      <>
        {active?.theme !== undefined && (
          <>
            <Datum>{active.id}</Datum> is drawn with <Datum>{active.theme}</Datum>.{' '}
          </>
        )}
        {canWrite ? 'Preview another look without writing anything; Pin saves it in the View.' : 'Try another look: the preview changes nothing.'}
      </>
    ),
    zone: RIGHT_ISLAND,
    prepare: (e) => e.openTab('derecha', 'temas'),
  });

  stops.push({
    title: 'In your repo',
    text: (
      <>
        Here you can only look. In your repo, your coding agent scans the code, writes the <Datum>.dg</Datum> and you watch it change live: run{' '}
        <Datum>npx rinthel-arch scan</Datum> and then <Datum>npx rinthel-arch dev --workspace .</Datum>.
      </>
    ),
    exportOnly: true,
  });

  stops.push({
    title: 'Code',
    text: (
      <>
        The diagram is text.{' '}
        {active !== undefined ? (
          <>
            This is the block of <Datum>{active.id}</Datum>: change it and the canvas redraws itself.
          </>
        ) : (
          'Change the .dg and the canvas redraws itself.'
        )}{' '}
        The E key opens it wherever you are.
      </>
    ),
    zone: LEFT_ISLAND,
    prepare: (e) => {
      if (active === undefined) e.openCode();
      else {
        e.goToView(active.id);
        void openCodeInBlock(e, 'view', active.id);
      }
    },
    devOnly: true,
  });

  stops.push({
    title: 'Your agent, live',
    text: 'When your coding agent runs validate or edit, it shows up here and what changes is highlighted on the canvas. Follow jumps to what it touches.',
    zone: RIGHT_ISLAND,
    prepare: (e) => e.openTab('derecha', 'agente'),
    devOnly: true,
  });
  return availableIn(stops, mode);
}
