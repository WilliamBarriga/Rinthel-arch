/**
 * `VistaInteractiva`: la Vista de `render` con pan/zoom (d3-zoom), seleccion de
 * Nodo y filtrado por viewport. El estado de camara y seleccion es controlable
 * por props; sin ellas el componente guarda el suyo.
 */
import { useEffect, useMemo, useRef, useState } from 'react';
import type { FocusEvent as EventoDeFoco, KeyboardEvent as EventoDeTecla, MouseEvent as EventoDeRaton, ReactElement } from 'react';
import { select } from 'd3-selection';
import { zoom, zoomTransform } from 'd3-zoom';
import type { D3ZoomEvent } from 'd3-zoom';

import { resolveView } from 'canonico';
import type { EstadoDeColapso, IconProvider, IssueDeDev, FuenteCanonica, Tema, Visibilidad, VistaResuelta } from 'canonico';
import { claveDeLayout, indiceDeGeometria } from 'layout';
import type { Geometria } from 'layout';
import { Diagram, hojaDeFuentes, resolverEstilo } from 'render';
import type { Camara, ComponentesDeTema } from 'render';
import { resolverTema } from 'tema';
import type { MedidasDeTexto, TextoAMedir } from 'tema';

import { aCamara, aTransform, compensarCamara, encuadrar, mismaTransform } from './camara';
import { Leyenda, useAltoContraste } from './accesibilidad';
import type { ModoDeLeyenda, PropsDeAltoContraste } from './accesibilidad';
import { PanelDeIssues, Toasts } from './avisos';
import { EstiloDelChrome, variablesDeChrome } from './chrome';
import { MAX_NODOS_VISIBLES, alternarGrupo, contarNodosVisibles } from './colapso';
import { AJUSTES_POR_DEFECTO } from './configuracion';
import type { AjustesDeInteraccion } from './configuracion';
import { idDeNodoBajo, useArrastre } from './arrastre';
import { useControlado } from './controlado';
import { conEstadosTransitorios, useSeleccion } from './seleccion';
import { elementoBajo } from './interaccion';
import { estadosDeRuta, moverFoco, rutaMasCorta, unirEstados } from './ruta-y-foco';
import { Migas, useNavegacion } from './navegacion';
import type { PropsDeNavegacion } from './navegacion';
import { useGeometria } from './geometria';
import { avisoDeFuentesSinServir, hashesDeFamilias, medirEnVisor } from './medicion-de-visor';
import type { Calculo } from './geometria';
import { interpolarGeometria, useMorph, visibilidadDeMorph } from './morph';
import type { RelojDeCuadros } from './morph';
import { usePasos } from './pasos';
import type { PropsDePasos } from './pasos';
import { useTemaVigente } from './tema-vigente';
import type { SuscripcionDeTema } from './tema-vigente';
import { recortarAlViewport } from './viewport';
import { nivelDeDetalle } from './zoom-semantico';
import type { UmbralesDeDetalle } from './zoom-semantico';

/** Adaptador de layout inyectado: ELK en Worker en el navegador, un fake en pruebas. */
export type AdaptadorDeLayout = (vista: VistaResuelta, tema: Tema, medidas?: MedidasDeTexto) => Promise<Geometria>;

/** Medidor de texto inyectado (ADR 0008): el visor mide con la fuente real (`medirEnVisor`); sin el se estima por caracter. */
export type MedidorDeTexto = (textos: TextoAMedir[]) => Promise<MedidasDeTexto>;

export interface VistaInteractivaProps extends PropsDePasos, PropsDeNavegacion, PropsDeAltoContraste {
  /** Leyenda de Tipos derivada del Tema: `auto` (por defecto) solo si dos Tipos difieren unicamente por color. */
  legend?: ModoDeLeyenda;
  /** Componentes de Tema (Capa `code`) por nombre; los registra el adaptador (`dev`), el shell solo los pasa a `Diagram`. */
  componentes?: ComponentesDeTema;
  source: FuenteCanonica;
  theme: Tema;
  /** Puerto de recarga de Tema al guardar: recolorea sin relayout salvo que cambien las fuentes. */
  themeUpdates?: SuscripcionDeTema;
  layout: AdaptadorDeLayout;
  /** Medicion real de texto; con ella el layout espera las medidas y la clave de layout incluye el hash de fuente y el nivel `medido`. */
  measure?: MedidorDeTexto;
  /**
   * Archivos de fuente del Workspace (ruta -> hash del contenido). Con ellos y `fontUrl` el visor declara el
   * `@font-face` de cada fuente del Tema y, si no hay `measure`, mide con la fuente real (`medirEnVisor`).
   */
  fontFiles?: Readonly<Record<string, string>>;
  /** URL con la que el navegador pide un archivo de fuente del Workspace (en `dev`, su ruta de fuentes). */
  fontUrl?: (ruta: string) => string;
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
  /** Elemento seleccionado controlado (id de Nodo, de Arista o `nodo#atributo`); sin ella el componente guarda su Seleccion. */
  selected?: string | null;
  /** Se selecciono un elemento: su id (Nodo, Arista o etiqueta por `idDeArista`, Atributo como `nodo#atributo`). */
  onSelect?: (id: string) => void;
  /** Seleccion multiple controlada (ids como en `selected`); manda sobre `selected` y la interna. */
  selection?: readonly string[];
  /** La Seleccion cambio (al pulsar, acumular o quitar): todos sus ids en orden de seleccion; `[]` si queda vacia. */
  onSelectionChange?: (ids: string[]) => void;
  /**
   * Habilita arrastrar Nodos (solo bajo `dev`; sin ella, arrastrar un Nodo mueve la camara). Al soltar avisa
   * el centro nuevo del Nodo (coordenada de Pin), relativo a su Grupo padre y en unidades de la geometria, como un Pin. El Nodo
   * se queda en la posicion soltada hasta que llega otra geometria; si el aviso devuelve una promesa que resuelve
   * `false` (o rechaza), vuelve a su sitio. Un arrastre no selecciona ni navega.
   */
  onMoveNode?: (movimiento: { id: string; x: number; y: number }) => void | boolean | Promise<boolean | void>;
  /**
   * Ruta resaltada: ids de Nodos en orden. Sus Nodos y las Aristas entre consecutivos pasan a `en-ruta` y todo lo
   * demas a `atenuado`. Sin ella, con exactamente dos Nodos seleccionados se resalta la ruta mas corta entre ellos.
   */
  route?: readonly string[];
  /** Visibilidad 0..1 de Nodos y Aristas; si se da, manda sobre la derivada de los Pasos. */
  visibility?: Visibilidad;
  /** Escalas desde las que el zoom semantico muestra titulo y titulo + Atributos (ver `nivelDeDetalle`). */
  detailThresholds?: UmbralesDeDetalle;
  /** Proveedor de iconos de los Nodos (claves de `icon` -> SVG inline); sin el, no se dibujan iconos. */
  icons?: IconProvider;
  /** Umbrales y margenes de la interaccion (arrastre, acierto de Aristas, escala, encuadre); ver `AjustesDeInteraccion`. */
  tuning?: Partial<AjustesDeInteraccion>;
  /** Issues de la Fuente; se dibujan como panel clicable dentro del lienzo, con el Tema. */
  issues?: readonly IssueDeDev[];
  /** Avisos efimeros (el padre decide cuando quitarlos); se dibujan dentro del lienzo, con el Tema. */
  toasts?: readonly string[];
  /** Reloj del morph; por defecto `requestAnimationFrame`. Util en pruebas. */
  clock?: RelojDeCuadros;
  /** Fallo del adaptador de layout; sin ella el fallo se lanza al renderizar. */
  onError?: (error: Error) => void;
}

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
  const { tema: theme, interruptor, reducedMotion } = useAltoContraste(useTemaVigente(props.theme, props.themeUpdates), props);
  const [state, fijarEstado] = useControlado<EstadoDeColapso>(props.state, {}, props.onStateChange);
  const ajustes = { ...AJUSTES_POR_DEFECTO, ...props.tuning };
  const ajustesVigentes = useRef(ajustes);
  ajustesVigentes.current = ajustes;
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
    const antes = indiceDeGeometria(previo.vista, previo.geometria).cajas.get(ancla);
    const despues = indiceDeGeometria(nuevo.vista, nuevo.geometria).cajas.get(ancla);
    if (antes === undefined || despues === undefined) return;
    fijarCamara(compensarCamara(camaraBase.current, antes, despues));
    morphador.iniciar({ desde: previo.geometria, hasta: nuevo.geometria, ancla });
  };
  const morphador = useMorph(morphMs, props.clock);
  const { fontFiles, fontUrl } = props;
  const hashesDeFuentes = useMemo(() => (fontFiles === undefined ? undefined : hashesDeFamilias(resolverTema(theme).fonts, fontFiles)), [fontFiles, theme]);
  const medirConFuentes = useMemo<MedidorDeTexto | undefined>(
    () => (props.measure !== undefined || hashesDeFuentes === undefined || fontUrl === undefined ? props.measure : (textos) => medirEnVisor(textos, { hashes: hashesDeFuentes })),
    [props.measure, hashesDeFuentes, fontUrl],
  );
  // Sin `fontUrl` el visor no puede pedir las fuentes del Tema: lo dice, en vez de medir y pintar en silencio con la reserva.
  const avisosDeFuentes = useMemo(() => (fontUrl === undefined ? avisoDeFuentesSinServir(resolverTema(theme).fonts) : []), [fontUrl, theme]);
  const calculo = useGeometria({ vista, theme, layout, medir: medirConFuentes, claveDeFuentes: JSON.stringify(hashesDeFuentes), semilla, onError, alLlegar });

  // Camara: controlada por el padre o propia; hasta que el usuario (o un colapso) la mueva, encuadra toda la Vista segun la primera geometria.
  const [movida, fijarCamara] = useControlado<Camara | undefined>(props.camera, undefined, (nueva) => nueva && ultimo.current.onCameraChange?.(nueva));
  const encuadre = useRef<Camara | undefined>(undefined);
  if (encuadre.current === undefined && calculo !== undefined) encuadre.current = encuadrar(calculo.geometria, width, height, ajustes.fitMargin);
  const camara = movida ?? encuadre.current ?? { x: 0, y: 0, width, height };
  const camaraBase = useRef(camara);
  camaraBase.current = camara;

  const pasos = usePasos(vista, props);
  const visibility = pasos.visibility;

  const zona = useRef<HTMLDivElement>(null);
  const comportamiento = useRef(zoom<HTMLDivElement, unknown>());
  const silencio = useRef(false);
  const ultimo = useRef(props);
  ultimo.current = props;
  const camaraVigente = useRef(camara);
  const { desplazado, arrastrando, enCurso } = useArrastre({
    zona,
    alMoverNodo: props.onMoveNode,
    calculo,
    camaraVigente,
    ancho: width,
    umbral: ajustes.dragThreshold,
  });

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
      .scaleExtent([ajustes.minScale, ajustes.maxScale])
      .on('zoom', (evento: D3ZoomEvent<HTMLDivElement, unknown>) => {
        if (silencio.current) return;
        morphador.cancelar();
        fijarCamara(aCamara(evento.transform, width, height));
      });
    select(nodo).call(comp);
    return () => {
      select(nodo).on('.zoom', null);
    };
  }, [width, height, ajustes.minScale, ajustes.maxScale]);

  // Lleva d3-zoom a la camara vigente cuando difieren (camara controlada que el padre cambio o ignoro).
  useEffect(() => {
    const nodo = zona.current!;
    const deseada = aTransform(camara, width);
    if (mismaTransform(zoomTransform(nodo), deseada)) return;
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
        : { ...calculo, geometria: interpolarGeometria(morph.desde, morph.hasta, morph.t) };
    const caja = desplazado === undefined ? undefined : base?.geometria.nodes[desplazado.id];
    if (base === undefined || desplazado === undefined || caja === undefined) return base;
    return { vista: base.vista, geometria: { ...base.geometria, nodes: { ...base.geometria.nodes, [desplazado.id]: { ...caja, x: desplazado.x, y: desplazado.y } } } };
  }, [calculo, morph, desplazado]);
  const camaraVista = useMemo<Camara>(() => {
    if (calculo === undefined || mostrado === undefined || morph === undefined) return camara;
    const final = indiceDeGeometria(calculo.vista, morph.hasta).cajas.get(morph.ancla);
    const ahora = indiceDeGeometria(mostrado.vista, mostrado.geometria).cajas.get(morph.ancla);
    return final === undefined || ahora === undefined ? camara : { ...camara, x: camara.x - final.x + ahora.x, y: camara.y - final.y + ahora.y };
  }, [calculo, mostrado, morph, camara]);
  const visibilidadMostrada = useMemo(
    () => (morph === undefined ? visibility : visibilidadDeMorph(morph.desde, morph.hasta, morph.t, visibility)),
    [morph, visibility],
  );

  camaraVigente.current = camaraVista;
  const { x, y, width: ancho, height: alto } = camaraVista;
  const recortada = useMemo(
    () => (mostrado === undefined ? undefined : recortarAlViewport(mostrado.vista, mostrado.geometria, { x, y, width: ancho, height: alto })),
    [mostrado, x, y, ancho, alto],
  );

  const { seleccion, estados: estadosDeSeleccion, pulsar } = useSeleccion(vista, props.selected, props.selection);
  const [hover, fijarHover] = useState<string | undefined>(undefined);
  const estados = useMemo(() => conEstadosTransitorios(estadosDeSeleccion, enCurso === undefined ? hover : undefined, enCurso), [estadosDeSeleccion, hover, enCurso]);
  const medidas = calculo?.medidas;
  const estilo = useMemo(() => resolverEstilo(theme, undefined, fontFiles === undefined ? undefined : Object.keys(fontFiles), medidas), [theme, fontFiles, medidas]);

  // Ruta (en-ruta / atenuado) y foco de teclado: los calcula el shell y render solo los pinta.
  const nodosSeleccionados = seleccion.filter((e) => e.tipo === 'nodo').map((e) => e.id);
  const ruta = useMemo(() => {
    if (props.route !== undefined) return props.route;
    if (nodosSeleccionados.length !== 2) return [];
    return rutaMasCorta(vista, nodosSeleccionados[0]!, nodosSeleccionados[1]!) ?? [];
  }, [props.route, vista, nodosSeleccionados.join('\n')]);
  const [foco, fijarFoco] = useState<string | undefined>(undefined);
  const focoVigente = foco !== undefined && vista.nodes.some((n) => n.id === foco) ? foco : undefined;
  const estadosFinales = useMemo(
    () => unirEstados(unirEstados(estados, estadosDeRuta(vista, ruta)), focoVigente === undefined ? {} : { [focoVigente]: ['foco'] }),
    [estados, vista, ruta, focoVigente],
  );

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
    fijarEstado(siguiente);
  };

  const alEnfocar = (evento: EventoDeFoco): void => {
    if (evento.target === evento.currentTarget) fijarFoco((actual) => actual ?? moverFoco(vista, undefined, 'siguiente'));
  };
  const alSoltarElFoco = (evento: EventoDeFoco): void => {
    if (evento.target === evento.currentTarget) fijarFoco(undefined);
  };
  /** Tab recorre en orden del Modelo (y suelta el foco al salirse por un extremo), flechas saltan por Aristas, Enter/Espacio colapsa o abre. */
  const alTeclear = (evento: EventoDeTecla): void => {
    if (evento.target !== evento.currentTarget) return;
    const mover = (movimiento: Parameters<typeof moverFoco>[2]): boolean => {
      const siguiente = moverFoco(vista, focoVigente, movimiento);
      if (siguiente === undefined) return false;
      fijarFoco(siguiente);
      return true;
    };
    let atendida = false;
    switch (evento.key) {
      case 'Tab':
        atendida = mover(evento.shiftKey ? 'anterior' : 'siguiente');
        break;
      case 'ArrowRight':
      case 'ArrowDown':
        atendida = mover('adelante');
        break;
      case 'ArrowLeft':
      case 'ArrowUp':
        atendida = mover('atras');
        break;
      case 'Enter':
      case ' ':
        if (focoVigente !== undefined) alternar(focoVigente);
        atendida = true;
        break;
    }
    if (atendida) evento.preventDefault();
  };

  const detalle = nivelDeDetalle(width / ancho, props.detailThresholds);

  /** Elemento bajo un evento de raton: el nucleo decide que hay bajo el punto, sobre la Vista completa (no la recortada). */
  const elementoBajoElRaton = (evento: EventoDeRaton) => {
    if (mostrado === undefined || (evento.target as Element).closest('[data-diagram]') === null) return undefined;
    const caja = zona.current!.getBoundingClientRect();
    const k = width / camaraVigente.current.width;
    const punto = { x: camaraVigente.current.x + (evento.clientX - caja.left) / k, y: camaraVigente.current.y + (evento.clientY - caja.top) / k };
    return elementoBajo(mostrado.vista, mostrado.geometria, theme, punto, { tolerancia: ajustes.hitTolerance / k, atributos: detalle === 'completo' });
  };

  const alMoverElRaton = (evento: EventoDeRaton): void => {
    if (enCurso !== undefined) return;
    fijarHover(elementoBajoElRaton(evento)?.id);
  };

  const alPulsar = (evento: EventoDeRaton): void => {
    if (arrastrando.current) return;
    const elemento = elementoBajoElRaton(evento);
    if (elemento === undefined) return;
    const acumula = evento.shiftKey || evento.ctrlKey || evento.metaKey;
    const resultado = pulsar(elemento, acumula);
    props.onSelectionChange?.(resultado.seleccion.map((e) => e.id));
    if (!resultado.seleccionado) return;
    onSelect?.(elemento.id);
    if (acumula || elemento.tipo !== 'nodo') return;
    const destino = vista.nodes.find((n) => n.id === elemento.id)?.link;
    if (destino !== undefined && source.views.some((v) => v.id === destino)) props.alEnlazar(destino);
  };

  return (
    <div ref={zona} onClick={alPulsar} onMouseMove={alMoverElRaton} onMouseLeave={() => fijarHover(undefined)} className="rd-vista" data-vista={view} data-layout={calculo !== undefined && calculo.vista === vista && morph === undefined ? 'listo' : 'calculando'} tabIndex={0} onKeyDown={alTeclear} onFocus={alEnfocar} onBlur={alSoltarElFoco} style={{ ...variablesDeChrome(estilo), width, height }}>
      <EstiloDelChrome />
      {fontUrl !== undefined && estilo.caras.length > 0 && <style data-fuentes="">{hojaDeFuentes(estilo.caras, fontUrl)}</style>}
      {mostrado !== undefined && recortada !== undefined && (
        <Diagram
          view={recortada}
          geometry={mostrado.geometria}
          theme={theme}
          {...(props.icons !== undefined && { icons: props.icons })}
          {...(props.componentes !== undefined && { componentes: props.componentes })}
          width={width}
          height={height}
          camera={camaraVista}
          detail={detalle}
          estados={estadosFinales}
          estilo={estilo}
          {...(fontUrl !== undefined && { urlDeFuente: fontUrl })}
          onToggle={alternar}
          {...(reducedMotion !== undefined && { reducedMotion })}
          {...(visibilidadMostrada !== undefined && { visibility: visibilidadMostrada })}
        />
      )}
      {pasos.controles}
      {interruptor}
      <Leyenda fuente={source} vista={vista} tema={theme} modo={props.legend ?? 'auto'} />
      {props.migas}
      <PanelDeIssues issues={[...(props.issues ?? []), ...avisosDeFuentes]} />
      <Toasts toasts={props.toasts ?? []} />
    </div>
  );
}
