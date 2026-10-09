/**
 * `VistaInteractiva`: la Vista de `render` con pan/zoom (d3-zoom), seleccion de
 * Nodo y filtrado por viewport. El estado de camara y seleccion es controlable
 * por props; sin ellas el componente guarda el suyo.
 */
import { useEffect, useMemo, useReducer, useRef, useState } from 'react';
import type { ReactElement } from 'react';
import { select } from 'd3-selection';
import { zoom, zoomIdentity, zoomTransform } from 'd3-zoom';
import type { D3ZoomEvent, ZoomTransform } from 'd3-zoom';

import { resolveView } from 'canonico';
import type { EstadoDeColapso, FuenteCanonica, Tema, Visibilidad, VistaResuelta } from 'canonico';
import { claveDeLayout } from 'layout';
import type { Geometria } from 'layout';
import { Diagram } from 'render';
import type { Camara } from 'render';

import { usePasos } from './pasos';
import type { PropsDePasos } from './pasos';
import { useTemaVigente } from './tema-vigente';
import type { SuscripcionDeTema } from './tema-vigente';
import { cajasAbsolutas, recortarAlViewport } from './viewport';

/** Adaptador de layout inyectado: ELK en Worker en el navegador, un fake en pruebas. */
export type AdaptadorDeLayout = (vista: VistaResuelta, tema: Tema) => Promise<Geometria>;

export interface VistaInteractivaProps extends PropsDePasos {
  source: FuenteCanonica;
  /** Id de la Vista a mostrar. */
  view: string;
  theme: Tema;
  /** Puerto de recarga de Tema al guardar: recolorea sin relayout salvo que cambien las fuentes. */
  themeUpdates?: SuscripcionDeTema;
  layout: AdaptadorDeLayout;
  /** Tamano del lienzo en px. */
  width: number;
  height: number;
  /** Estado de colapso que pasa a `resolveView`. */
  state?: EstadoDeColapso;
  /** Camara controlada, en unidades de la geometria; sin ella el componente guarda la suya. */
  camera?: Camara;
  /** Pan o zoom del usuario: la camara que resulta. */
  onCameraChange?: (camara: Camara) => void;
  /** Nodo seleccionado controlado; sin ella el componente guarda el suyo. */
  selected?: string | null;
  onSelect?: (id: string) => void;
  /** Visibilidad 0..1 de Nodos y Aristas; si se da, manda sobre la derivada de los Pasos. */
  visibility?: Visibilidad;
  /** Fallo del adaptador de layout; sin ella el fallo se lanza al renderizar. */
  onError?: (error: Error) => void;
}

const ESCALA_MIN = 0.05;
const ESCALA_MAX = 16;

function aCamara(t: ZoomTransform, ancho: number, alto: number): Camara {
  // `+ 0` normaliza -0 a 0.
  return { x: -t.x / t.k + 0, y: -t.y / t.k + 0, width: ancho / t.k, height: alto / t.k };
}

function aTransform(c: Camara, ancho: number): ZoomTransform {
  const k = ancho / c.width;
  return zoomIdentity.translate(-c.x * k, -c.y * k).scale(k);
}

const igual = (a: ZoomTransform, b: ZoomTransform): boolean => a.k === b.k && a.x === b.x && a.y === b.y;

export function VistaInteractiva(props: VistaInteractivaProps): ReactElement {
  const { source, view, layout, width, height, state, onError, onSelect } = props;
  const theme = useTemaVigente(props.theme, props.themeUpdates);
  const vista = useMemo(() => {
    const resuelta = resolveView(source, view, state);
    if (resuelta === undefined) throw new Error(`La Vista '${view}' no existe en la Fuente canonica`);
    return resuelta;
  }, [source, view, state]);

  const [calculo, setCalculo] = useState<{ vista: VistaResuelta; geometria: Geometria }>();
  const [fallo, setFallo] = useState<Error>();
  // El layout solo se repite si cambia lo que lo mueve (fuentes, textos, estructura), no la paleta.
  const claveTema = claveDeLayout(vista, theme);
  const temaActual = useRef(theme);
  temaActual.current = theme;
  const alFallar = useRef(onError);
  alFallar.current = onError;
  useEffect(() => {
    let vigente = true;
    layout(vista, temaActual.current).then(
      (geometria) => {
        if (vigente) setCalculo({ vista, geometria });
      },
      (error: unknown) => {
        if (!vigente) return;
        const e = error instanceof Error ? error : new Error(String(error));
        if (alFallar.current === undefined) setFallo(e);
        else alFallar.current(e);
      },
    );
    return () => {
      vigente = false;
    };
  }, [vista, claveTema, layout]);
  if (fallo !== undefined) throw fallo;

  const [propia, setPropia] = useState<Camara>({ x: 0, y: 0, width, height });
  const camara = props.camera ?? propia;
  const [seleccionPropia, setSeleccionPropia] = useState<string | null>(null);
  const seleccionado = props.selected !== undefined ? props.selected : seleccionPropia;

  const pasos = usePasos(vista, props);
  const visibility = pasos.visibility;

  const zona = useRef<HTMLDivElement>(null);
  const comportamiento = useRef(zoom<HTMLDivElement, unknown>());
  const silencio = useRef(false);
  const ultimo = useRef(props);
  ultimo.current = props;
  const [, reajustar] = useReducer((n: number) => n + 1, 0);

  useEffect(() => {
    const nodo = zona.current!;
    const comp = comportamiento.current;
    comp
      .extent([
        [0, 0],
        [width, height],
      ])
      .scaleExtent([ESCALA_MIN, ESCALA_MAX])
      .on('zoom', (evento: D3ZoomEvent<HTMLDivElement, unknown>) => {
        if (silencio.current) return;
        const nueva = aCamara(evento.transform, width, height);
        const actual = ultimo.current;
        if (actual.camera === undefined) setPropia(nueva);
        else reajustar();
        actual.onCameraChange?.(nueva);
      });
    select(nodo).call(comp);
    return () => {
      select(nodo).on('.zoom', null);
    };
  }, [width, height]);

  // Lleva d3-zoom a la camara vigente cuando difieren (camara controlada que el padre cambio o ignoro).
  useEffect(() => {
    const nodo = zona.current!;
    const deseada = aTransform(camara, width);
    if (igual(zoomTransform(nodo), deseada)) return;
    silencio.current = true;
    try {
      comportamiento.current.transform(select(nodo), deseada);
    } finally {
      silencio.current = false;
    }
  });

  const { x, y, width: ancho, height: alto } = camara;
  const recortada = useMemo(
    () => (calculo === undefined ? undefined : recortarAlViewport(calculo.vista, calculo.geometria, { x, y, width: ancho, height: alto })),
    [calculo, x, y, ancho, alto],
  );

  const marca = useMemo(() => {
    if (calculo === undefined || seleccionado === null) return undefined;
    return cajasAbsolutas(calculo.vista, calculo.geometria).get(seleccionado);
  }, [calculo, seleccionado]);

  const alSeleccionar = (id: string): void => {
    if (props.selected === undefined) setSeleccionPropia(id);
    onSelect?.(id);
  };

  return (
    <div ref={zona} style={{ position: 'relative', width, height, overflow: 'hidden', touchAction: 'none' }}>
      {calculo !== undefined && recortada !== undefined && (
        <Diagram
          view={recortada}
          geometry={calculo.geometria}
          theme={theme}
          width={width}
          height={height}
          camera={camara}
          onSelect={alSeleccionar}
          {...(visibility !== undefined && { visibility })}
        />
      )}
      {pasos.controles}
      {marca !== undefined && seleccionado !== null && (
        <svg
          width={width}
          height={height}
          viewBox={`${x} ${y} ${ancho} ${alto}`}
          style={{ position: 'absolute', left: 0, top: 0, pointerEvents: 'none' }}
        >
          <rect
            data-selected={seleccionado}
            x={marca.x}
            y={marca.y}
            width={marca.width}
            height={marca.height}
            rx={6}
            fill="none"
            stroke={theme.palette['blue'] ?? theme.tokens['foreground'] ?? 'currentColor'}
            strokeWidth={3}
          />
        </svg>
      )}
    </div>
  );
}
