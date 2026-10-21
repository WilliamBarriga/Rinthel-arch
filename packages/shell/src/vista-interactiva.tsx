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
import type { EstadoDeColapso, IconProvider, FuenteCanonica, Tema, Visibilidad, VistaResuelta } from 'canonico';
import { claveDeLayout } from 'layout';
import type { Geometria } from 'layout';
import { Diagram } from 'render';
import type { Camara } from 'render';

import { MAX_NODOS_VISIBLES, alternarGrupo, compensarCamara, contarNodosVisibles, interpolarGeometria, visibilidadDeMorph } from './colapso';
import { Migas, useNavegacion } from './navegacion';
import type { PropsDeNavegacion } from './navegacion';
import { useGeometria } from './geometria';
import type { Calculo } from './geometria';
import { useMorph } from './morph';
import { usePasos } from './pasos';
import type { PropsDePasos } from './pasos';
import { useTemaVigente } from './tema-vigente';
import type { SuscripcionDeTema } from './tema-vigente';
import { cajasAbsolutas, recortarAlViewport } from './viewport';
import { nivelDeDetalle } from './zoom-semantico';
import type { UmbralesDeDetalle } from './zoom-semantico';

/** Adaptador de layout inyectado: ELK en Worker en el navegador, un fake en pruebas. */
export type AdaptadorDeLayout = (vista: VistaResuelta, tema: Tema) => Promise<Geometria>;

export interface VistaInteractivaProps extends PropsDePasos, PropsDeNavegacion {
  source: FuenteCanonica;
  theme: Tema;
  /** Puerto de recarga de Tema al guardar: recolorea sin relayout salvo que cambien las fuentes. */
  themeUpdates?: SuscripcionDeTema;
  layout: AdaptadorDeLayout;
  /** Tamano del lienzo en px. */
  width: number;
  height: number;
  /** Estado de colapso controlado (`resolveView`); sin el, el componente guarda el suyo. */
  state?: EstadoDeColapso;
  /** Aviso del estado de colapso que resulta de alternar un Grupo. */
  onStateChange?: (state: EstadoDeColapso) => void;
  /** Geometria cacheada del estado por defecto de la Vista (sin `state`): se usa sin relayout. */
  cachedGeometry?: Geometria;
  /** Geometria cacheada por id de Vista; manda sobre `cachedGeometry` para esa Vista (util al navegar). */
  cachedGeometries?: Readonly<Record<string, Geometria>>;
  /** Duracion del morph al alternar un Grupo, en ms; 0 lo desactiva. Por defecto 300. */
  morphMs?: number;
  /** Tope de Nodos visibles; una expansion que lo supera se rechaza. Por defecto 1000. */
  maxNodes?: number;
  /** Una expansion se rechazo por superar `maxNodes`. */
  onLimit?: (id: string) => void;
  /** Camara controlada, en unidades de la geometria; sin ella el componente guarda la suya. */
  camera?: Camara;
  /** Pan o zoom del usuario: la camara que resulta. */
  onCameraChange?: (camara: Camara) => void;
  /** Nodo seleccionado controlado; sin ella el componente guarda el suyo. */
  selected?: string | null;
  onSelect?: (id: string) => void;
  /**
   * Habilita arrastrar Nodos (solo bajo `dev`; sin ella, arrastrar un Nodo mueve la camara). Al soltar avisa
   * la posicion nueva del Nodo, relativa a su Grupo padre y en unidades de la geometria, como un Pin. El Nodo
   * se queda en la posicion soltada hasta que llega otra geometria; si el aviso devuelve una promesa que resuelve
   * `false` (o rechaza), vuelve a su sitio. Un arrastre no selecciona ni navega.
   */
  onMoveNode?: (movimiento: { id: string; x: number; y: number }) => void | boolean | Promise<boolean | void>;
  /** Visibilidad 0..1 de Nodos y Aristas; si se da, manda sobre la derivada de los Pasos. */
  visibility?: Visibilidad;
  /** Escalas desde las que el zoom semantico muestra titulo y titulo + Atributos (ver `nivelDeDetalle`). */
  detailThresholds?: UmbralesDeDetalle;
  /** Proveedor de iconos de los Nodos (claves de `icon` -> SVG inline); sin el, no se dibujan iconos. */
  icons?: IconProvider;
  /** Fallo del adaptador de layout; sin ella el fallo se lanza al renderizar. */
  onError?: (error: Error) => void;
}

const UMBRAL_DE_ARRASTRE = 3;
const ESCALA_MIN = 0.05;
const ESCALA_MAX = 16;

/** Camara que muestra toda la geometria, centrada y con margen; no amplia por encima de 1:1. */
function encuadrar(geometria: Geometria, ancho: number, alto: number): Camara {
  const margen = 24;
  const escala = Math.min(1, ancho / (geometria.width + 2 * margen), alto / (geometria.height + 2 * margen));
  const [w, h] = [ancho / escala, alto / escala];
  return { x: (geometria.width - w) / 2, y: (geometria.height - h) / 2, width: w, height: h };
}

function aCamara(t: ZoomTransform, ancho: number, alto: number): Camara {
  // `+ 0` normaliza -0 a 0.
  return { x: -t.x / t.k + 0, y: -t.y / t.k + 0, width: ancho / t.k, height: alto / t.k };
}

function aTransform(c: Camara, ancho: number): ZoomTransform {
  const k = ancho / c.width;
  return zoomIdentity.translate(-c.x * k, -c.y * k).scale(k);
}

/** Id del Nodo dibujado (`g[data-id]` mas interno) bajo un evento, si lo hay. */
function idDeNodoBajo(destino: EventTarget | null): string | undefined {
  return (destino as Element | null)?.closest?.('[data-id]')?.getAttribute('data-id') ?? undefined;
}

const igual = (a: ZoomTransform, b: ZoomTransform): boolean => a.k === b.k && a.x === b.x && a.y === b.y;

/**
 * Vista con drill-down: navega por los `link` de la Vista activa. Cada cambio de
 * Vista remonta la Vista activa, asi que el estado no controlado (colapso, camara,
 * seleccion, Paso) vuelve a su valor inicial; el controlado lo gobierna el padre.
 */
export function VistaInteractiva(props: VistaInteractivaProps): ReactElement {
  const navegacion = useNavegacion(props);
  const { vista, ir } = navegacion;
  const declarada = props.view ?? props.defaultView;
  const geometria = props.cachedGeometries?.[vista] ?? (vista === declarada ? props.cachedGeometry : undefined);
  return <VistaActiva key={vista} {...props} view={vista} cachedGeometry={geometria} alEnlazar={ir} migas={<Migas navegacion={navegacion} />} />;
}

interface PropsDeVistaActiva extends Omit<VistaInteractivaProps, 'view' | 'cachedGeometry'> {
  view: string;
  cachedGeometry: Geometria | undefined;
  /** Se pulso un Nodo con `link`: la Vista destino. */
  alEnlazar: (destino: string) => void;
  /** Breadcrumbs y boton atras, dibujados dentro del lienzo. */
  migas: ReactElement;
}

function VistaActiva(props: PropsDeVistaActiva): ReactElement {
  const { source, view, layout, width, height, onError, onSelect, cachedGeometry, morphMs = 300, maxNodes = MAX_NODOS_VISIBLES } = props;
  const theme = useTemaVigente(props.theme, props.themeUpdates);
  const [estadoPropio, setEstadoPropio] = useState<EstadoDeColapso>({});
  const state = props.state ?? estadoPropio;
  const vista = useMemo(() => {
    const resuelta = resolveView(source, view, state);
    if (resuelta === undefined) throw new Error(`La Vista '${view}' no existe en la Fuente canonica`);
    return resuelta;
  }, [source, view, state]);

  const semilla = useMemo(() => {
    if (cachedGeometry === undefined) return undefined;
    const porDefecto = resolveView(source, view);
    return porDefecto === undefined ? undefined : { vista: porDefecto, geometria: cachedGeometry };
  }, [source, view, cachedGeometry]);
  const pendiente = useRef<string | undefined>(undefined);
  const alLlegar = (previo: Calculo | undefined, nuevo: Calculo): void => {
    const ancla = pendiente.current;
    pendiente.current = undefined;
    if (previo === undefined || ancla === undefined) return;
    const antes = cajasAbsolutas(previo.vista, previo.geometria).get(ancla);
    const despues = cajasAbsolutas(nuevo.vista, nuevo.geometria).get(ancla);
    if (antes === undefined || despues === undefined) return;
    const actual = ultimo.current;
    const compensada = compensarCamara(actual.camera ?? camaraPropia.current, antes, despues);
    if (actual.camera === undefined) setPropia(compensada);
    actual.onCameraChange?.(compensada);
    morphador.iniciar({ desde: previo.geometria, hasta: nuevo.geometria, ancla });
  };
  const morphador = useMorph(morphMs);
  const calculo = useGeometria({ vista, theme, layout, semilla, invalidar: source, onError, alLlegar });

  // Camara propia: hasta que el usuario (o un colapso) la mueva, encuadra toda la Vista segun la primera geometria.
  const [movida, setPropia] = useState<Camara | undefined>(undefined);
  const encuadre = useRef<Camara | undefined>(undefined);
  if (encuadre.current === undefined && calculo !== undefined) encuadre.current = encuadrar(calculo.geometria, width, height);
  const propia = movida ?? encuadre.current ?? { x: 0, y: 0, width, height };
  const camaraPropia = useRef(propia);
  camaraPropia.current = propia;
  const camara = props.camera ?? propia;
  const [seleccionPropia, setSeleccionPropia] = useState<string | null>(null);
  const seleccionado = props.selected !== undefined ? props.selected : seleccionPropia;

  const pasos = usePasos(vista, props);
  const visibility = pasos.visibility;

  const zona = useRef<HTMLDivElement>(null);
  /** Posicion (relativa al padre) de un Nodo arrastrado o recien soltado, hasta que llegue otra geometria. */
  const [desplazado, setDesplazado] = useState<{ id: string; x: number; y: number } | undefined>(undefined);
  const arrastrando = useRef(false);
  const comportamiento = useRef(zoom<HTMLDivElement, unknown>());
  const silencio = useRef(false);
  const ultimo = useRef(props);
  ultimo.current = props;
  const [, reajustar] = useReducer((n: number) => n + 1, 0);

  useEffect(() => {
    setDesplazado(undefined);
  }, [calculo]);

  const arrastrable = props.onMoveNode !== undefined;
  useEffect(() => {
    if (!arrastrable) return;
    const nodo = zona.current!;
    const alPulsar = (evento: MouseEvent): void => {
      if (evento.button !== 0 || evento.ctrlKey) return;
      const id = idDeNodoBajo(evento.target);
      const actual = calculoActual.current;
      const caja = id === undefined ? undefined : actual?.geometria.nodes[id];
      if (id === undefined || caja === undefined) return;
      const [x0, y0] = [evento.clientX, evento.clientY];
      let movido = false;
      const alMover = (m: MouseEvent): void => {
        const [px, py] = [m.clientX - x0, m.clientY - y0];
        if (!movido && Math.hypot(px, py) < UMBRAL_DE_ARRASTRE) return;
        movido = true;
        m.preventDefault();
        const k = ultimo.current.width / camaraVigente.current.width;
        setDesplazado({ id, x: Math.round(caja.x + px / k), y: Math.round(caja.y + py / k) });
      };
      const alSoltar = (m: MouseEvent): void => {
        window.removeEventListener('mousemove', alMover);
        window.removeEventListener('mouseup', alSoltar);
        if (!movido) return;
        const k = ultimo.current.width / camaraVigente.current.width;
        const destino = { id, x: Math.round(caja.x + (m.clientX - x0) / k), y: Math.round(caja.y + (m.clientY - y0) / k) };
        // El clic que sigue al soltar no debe seleccionar ni navegar.
        arrastrando.current = true;
        setTimeout(() => {
          arrastrando.current = false;
        }, 0);
        setDesplazado(destino);
        const devolver = (): void => setDesplazado((d) => (d?.id === id ? undefined : d));
        try {
          const resultado = ultimo.current.onMoveNode?.(destino);
          if (typeof resultado === 'object') resultado.then((ok) => ok === false && devolver(), devolver);
          else if (resultado === false) devolver();
        } catch {
          devolver();
        }
      };
      window.addEventListener('mousemove', alMover);
      window.addEventListener('mouseup', alSoltar);
    };
    nodo.addEventListener('mousedown', alPulsar);
    return () => nodo.removeEventListener('mousedown', alPulsar);
  }, [arrastrable]);

  useEffect(() => {
    const nodo = zona.current!;
    const comp = comportamiento.current;
    comp
      .filter((evento: Event) => {
        if (ultimo.current.onMoveNode !== undefined && evento.type === 'mousedown' && idDeNodoBajo(evento.target) !== undefined) return false;
        return (!(evento as MouseEvent).ctrlKey || evento.type === 'wheel') && !(evento as MouseEvent).button;
      })
      .extent([
        [0, 0],
        [width, height],
      ])
      .scaleExtent([ESCALA_MIN, ESCALA_MAX])
      .on('zoom', (evento: D3ZoomEvent<HTMLDivElement, unknown>) => {
        if (silencio.current) return;
        morphador.cancelar();
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

  // Durante el morph se dibuja la geometria interpolada y la camara sigue al Grupo tocado.
  const { morph } = morphador;
  const mostrado = useMemo<Calculo | undefined>(() => {
    const base =
      calculo === undefined || morph === undefined
        ? calculo
        : { vista: calculo.vista, geometria: interpolarGeometria(morph.desde, morph.hasta, morph.t) };
    const caja = desplazado === undefined ? undefined : base?.geometria.nodes[desplazado.id];
    if (base === undefined || desplazado === undefined || caja === undefined) return base;
    return { vista: base.vista, geometria: { ...base.geometria, nodes: { ...base.geometria.nodes, [desplazado.id]: { ...caja, x: desplazado.x, y: desplazado.y } } } };
  }, [calculo, morph, desplazado]);
  const calculoActual = useRef(calculo);
  calculoActual.current = calculo;
  const camaraVista = useMemo<Camara>(() => {
    if (calculo === undefined || mostrado === undefined || morph === undefined) return camara;
    const final = cajasAbsolutas(calculo.vista, morph.hasta).get(morph.ancla);
    const ahora = cajasAbsolutas(mostrado.vista, mostrado.geometria).get(morph.ancla);
    return final === undefined || ahora === undefined ? camara : { ...camara, x: camara.x - final.x + ahora.x, y: camara.y - final.y + ahora.y };
  }, [calculo, mostrado, morph, camara]);
  const visibilidadMostrada = useMemo(
    () => (morph === undefined ? visibility : visibilidadDeMorph(morph.desde, morph.hasta, morph.t, visibility)),
    [morph, visibility],
  );

  const camaraVigente = useRef(camaraVista);
  camaraVigente.current = camaraVista;
  const { x, y, width: ancho, height: alto } = camaraVista;
  const recortada = useMemo(
    () => (mostrado === undefined ? undefined : recortarAlViewport(mostrado.vista, mostrado.geometria, { x, y, width: ancho, height: alto })),
    [mostrado, x, y, ancho, alto],
  );

  const marca = useMemo(() => {
    if (mostrado === undefined || seleccionado === null) return undefined;
    return cajasAbsolutas(mostrado.vista, mostrado.geometria).get(seleccionado);
  }, [mostrado, seleccionado]);

  const alternar = (id: string): void => {
    if (arrastrando.current) return;
    const siguiente = alternarGrupo(state, vista, id);
    if (siguiente === undefined) return;
    const nueva = resolveView(source, view, siguiente);
    if (nueva === undefined) return;
    if (contarNodosVisibles(nueva) > maxNodes && contarNodosVisibles(nueva) > contarNodosVisibles(vista)) {
      props.onLimit?.(id);
      return;
    }
    pendiente.current = id;
    if (props.state === undefined) setEstadoPropio(siguiente);
    props.onStateChange?.(siguiente);
  };

  const alSeleccionar = (id: string): void => {
    if (arrastrando.current) return;
    if (props.selected === undefined) setSeleccionPropia(id);
    onSelect?.(id);
    const destino = vista.nodes.find((n) => n.id === id)?.link;
    if (destino !== undefined && source.views.some((v) => v.id === destino)) props.alEnlazar(destino);
  };

  return (
    <div ref={zona} style={{ position: 'relative', width, height, overflow: 'hidden', touchAction: 'none' }}>
      {mostrado !== undefined && recortada !== undefined && (
        <Diagram
          view={recortada}
          geometry={mostrado.geometria}
          theme={theme}
          {...(props.icons !== undefined && { icons: props.icons })}
          width={width}
          height={height}
          camera={camaraVista}
          detail={nivelDeDetalle(width / ancho, props.detailThresholds)}
          onSelect={alSeleccionar}
          onToggle={alternar}
          {...(visibilidadMostrada !== undefined && { visibility: visibilidadMostrada })}
        />
      )}
      {pasos.controles}
      {props.migas}
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
