/**
 * The fixed script of the "Start here" tour. Each stop uses the open Workspace's data (read once, when the tour
 * opens, so moving between Views during the tour does not rewrite the next stops) and falls back to generic text.
 * Stops: canvas, Views, Drill-down (skipped without a `link`), Steps, Themes, then Code and Agent in `dev` (`soloEnDev`) or
 * "In your repo" in the export (`soloEnExport`), filtered with `disponiblesEn`.
 */
import type { ReactElement, ReactNode } from 'react';

import type { CanonicalForm, Node, View } from 'canonical';

import { abrirCodigoEnBloque } from '../comandos/registro';
import type { ContextoDelEstudio } from '../marco/contexto';
import { disponiblesEn, puedeEscribirEn } from '../marco/modo';
import type { ConModo, ModoDelEstudio } from '../marco/modo';

export interface ParadaDelTour extends ConModo {
  titulo: string;
  texto: ReactNode;
  /** Selector of the real area the stop highlights; without it the card goes to the center. */
  zona?: string;
  /** Moves the UI to what the stop talks about (a View, a tab, a Step). */
  preparar?(estudio: ContextoDelEstudio): void;
}

const ZONA_DEL_LIENZO = '.ui-lienzo';
const ISLA_IZQUIERDA = '#ui-isla-izquierda';
const ISLA_DERECHA = '#ui-isla-derecha';

const Dato = ({ children }: { children: ReactNode }): ReactElement => <code className="ui-tour-dato">{children}</code>;

function tituloDeNodo(nodos: readonly Node[], id: string): string | undefined {
  for (const n of nodos) {
    if (n.id === id) return n.title;
    const hijo = tituloDeNodo(n.children, id);
    if (hijo !== undefined) return hijo;
  }
  return undefined;
}

/** "2 architecture and 1 flow", in declaration order of the Diagram types. */
function vistasPorTipo(vistas: readonly View[]): string {
  const cuenta = new Map<string, number>();
  for (const v of vistas) cuenta.set(v.type, (cuenta.get(v.type) ?? 0) + 1);
  const partes = [...cuenta].map(([tipo, n]) => `${n} ${tipo}`);
  return partes.length < 2 ? (partes[0] ?? '') : `${partes.slice(0, -1).join(', ')} and ${partes[partes.length - 1]!}`;
}

const preferida = (vistas: readonly View[], tipo: string): View | undefined => vistas.find((v) => v.type === tipo) ?? vistas[0];

/** The script for the Workspace `fuente` (`undefined` if it never compiled), its active View and the mode. */
export function paradasDelTour(fuente: CanonicalForm | undefined, vistaActiva: string | undefined, modo: ModoDelEstudio): readonly ParadaDelTour[] {
  const vistas = fuente?.views ?? [];
  const activa = vistas.find((v) => v.id === vistaActiva);
  const conLink = preferida(vistas.filter((v) => v.links.length > 0), 'architecture');
  const link = conLink?.links[0];
  const conPasos = preferida(vistas.filter((v) => v.steps.length > 0), 'flow');
  const puedeEscribir = puedeEscribirEn(modo);
  const paradas: ParadaDelTour[] = [];

  paradas.push({
    titulo: 'Your repo as a diagram',
    texto: (
      <>
        {activa !== undefined && (
          <>
            You are on the View <Dato>{activa.id}</Dato> ({activa.type}).{' '}
          </>
        )}
        Each box is a part of the system; drag the background to move around and use the wheel to zoom.
      </>
    ),
    zona: ZONA_DEL_LIENZO,
  });

  paradas.push({
    titulo: 'Views',
    texto: (
      <>
        One Model, many cuts.{' '}
        {vistas.length > 0 ? <>This Workspace has {vistasPorTipo(vistas)} Views.</> : 'Architecture, flows, sequences and tables.'} Pick one here; the breadcrumbs
        at the top take you back.
      </>
    ),
    zona: ISLA_IZQUIERDA,
    preparar: (e) => e.abrirPestana('izquierda', 'vistas'),
  });

  if (fuente !== undefined && conLink !== undefined && link !== undefined) {
    const nodo = tituloDeNodo(fuente.model.nodes, link.node) ?? link.node;
    paradas.push({
      titulo: 'Drill-down',
      texto: (
        <>
          <Dato>{nodo}</Dato> has its own View: click it to open <Dato>{link.view}</Dato>.
          {puedeEscribir && ' The Details on the right tell where it lives in the code.'}
        </>
      ),
      // The canvas, where the Node to click is; the Details island floats over it, so it stays live too.
      zona: ZONA_DEL_LIENZO,
      preparar: (e) => {
        e.irAVista(conLink.id);
        e.seleccionar(link.node);
        e.abrirPestana('derecha', 'detalle');
      },
    });
  }

  paradas.push({
    titulo: 'Steps',
    texto:
      conPasos !== undefined ? (
        <>
          <Dato>{conPasos.id}</Dato> is told in {conPasos.steps.length} Steps, starting with "{conPasos.steps[0]!.title}". Go forward with &gt; to reveal one at a
          time; it works as is for a talk.
        </>
      ) : (
        'Some Views are told in Steps: go forward with > to reveal one at a time. It works as is for a talk.'
      ),
    ...(conPasos !== undefined && {
      zona: '.rd-pasos',
      preparar: (e: ContextoDelEstudio) => {
        e.irAVista(conPasos.id);
        e.irAPaso(1);
      },
    }),
  });

  paradas.push({
    titulo: 'Themes',
    texto: (
      <>
        {activa?.theme !== undefined && (
          <>
            <Dato>{activa.id}</Dato> is drawn with <Dato>{activa.theme}</Dato>.{' '}
          </>
        )}
        {puedeEscribir ? 'Preview another look without writing anything; Pin saves it in the View.' : 'Try another look: the preview changes nothing.'}
      </>
    ),
    zona: ISLA_DERECHA,
    preparar: (e) => e.abrirPestana('derecha', 'temas'),
  });

  paradas.push({
    titulo: 'In your repo',
    texto: (
      <>
        Here you can only look. In your repo, your coding agent scans the code, writes the <Dato>.dg</Dato> and you watch it change live: run{' '}
        <Dato>npx rinthel-arch scan</Dato> and then <Dato>npx rinthel-arch dev --workspace .</Dato>.
      </>
    ),
    soloEnExport: true,
  });

  paradas.push({
    titulo: 'Code',
    texto: (
      <>
        The diagram is text.{' '}
        {activa !== undefined ? (
          <>
            This is the block of <Dato>{activa.id}</Dato>: change it and the canvas redraws itself.
          </>
        ) : (
          'Change the .dg and the canvas redraws itself.'
        )}{' '}
        The E key opens it wherever you are.
      </>
    ),
    zona: ISLA_IZQUIERDA,
    preparar: (e) => {
      if (activa === undefined) e.abrirCodigo();
      else {
        e.irAVista(activa.id);
        void abrirCodigoEnBloque(e, 'view', activa.id);
      }
    },
    soloEnDev: true,
  });

  paradas.push({
    titulo: 'Your agent, live',
    texto: 'When your coding agent runs validate or edit, it shows up here and what changes is highlighted on the canvas. Follow jumps to what it touches.',
    zona: ISLA_DERECHA,
    preparar: (e) => e.abrirPestana('derecha', 'agente'),
    soloEnDev: true,
  });
  return disponiblesEn(paradas, modo);
}
