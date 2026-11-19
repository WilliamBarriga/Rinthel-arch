/**
 * `<Estudio>`: la app de `dev` (marco F). Lienzo a pantalla completa (`VistaInteractiva` con `chrome={false}`) y encima
 * la barra de pildoras, las islas laterales con las pestanas del registro (`marco/pestanas.tsx`), la leyenda y los toasts.
 * Toda la red pasa por el cliente que se arma con `fetch` y `eventos` inyectados (en pruebas, los de `devEnMemoria`);
 * la Vista vive en el hash (`#vista=<id>`). Sin Fuente (el Workspace nunca compilo) el lienzo queda vacio y los paneles lo dicen.
 */
import { useEffect, useMemo, useRef, useState, useSyncExternalStore } from 'react';
import type { ReactElement, ReactNode } from 'react';

import { resolveView, urlDeFuente } from 'canonico';
import type { FuenteCanonica } from 'canonico';
import type { ComponentesDeTema } from 'render';
import { Leyenda, Migas, VistaInteractiva, deserializarEstado, useEstadoEnHash } from 'shell';
import type { AdaptadorDeHash, AdaptadorDeLayout, Navegacion, PropsDeEstadoEnHash } from 'shell';

import type { EstadoDeDev } from '../src/protocolo';
import { usePropsDeDatos, useTamano } from './arranque';
import { crearClienteDeDev } from './cliente';
import type { ClienteDeDev, DependenciasDelCliente } from './cliente';
import { crearCargadorDeCodigo } from './componentes';
import { crearGeometriasDeDev } from './geometrias';
import type { Dibujable, GeometriasDeDev } from './geometrias';
import { hashDeEstudio } from './hash-de-estudio';
import { accionDeAtajo, crearAlAtajo } from './historial';
import { ContextoDeEstudio } from './marco/contexto';
import type { ContextoDelEstudio } from './marco/contexto';
import { IslaLateral } from './marco/isla';
import type { LadoDeIsla } from './marco/limites';
import { PESTANAS_DERECHAS, PESTANAS_IZQUIERDAS, PILDORAS_DE_LA_BARRA } from './marco/pestanas';
import { useIsla } from './marco/use-isla';
import { crearAlMover, crearAlOrdenar } from './mover';

export interface PropsDelEstudio {
  fetch: typeof fetch;
  /** Fabrica de la conexion SSE (`EventSource` en el navegador, `devEnMemoria` en pruebas). */
  eventos: DependenciasDelCliente['eventos'];
  /** Hash del navegador tal cual (`hashDelNavegador(window)`); el estudio lo traduce a `#vista=<id>`. */
  hash: AdaptadorDeHash;
  /** Layout cuando la Geometria del servidor no llega (el Worker en el navegador). */
  layout: AdaptadorDeLayout;
  /** Confirmacion antes de cargar Componentes de Tema con codigo. */
  confirmar: (mensaje: string) => boolean;
}

const DURACION_DEL_AVISO_MS = 6000;
/** Tras el ultimo evento de rueda, el zoom se da por terminado. */
const FIN_DE_RUEDA_MS = 200;

/**
 * Gesto en curso sobre el lienzo (arrastre, pan o zoom con rueda). Medido en Chromium sobre `examples/rinthel-arch`:
 * con `backdrop-filter` el pan sube el p95 de cuadro de ~17 ms a ~33 ms; sin el, 17 ms. Por eso durante el gesto el
 * marco pasa a superficie solida (`data-arrastrando`).
 */
function useGestoEnLienzo(): { enGesto: boolean; props: { onPointerDown: () => void; onPointerUp: () => void; onPointerCancel: () => void; onWheel: () => void } } {
  const [puntero, setPuntero] = useState(false);
  const [rueda, setRueda] = useState(false);
  const fin = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  useEffect(() => () => clearTimeout(fin.current), []);
  return {
    enGesto: puntero || rueda,
    props: {
      onPointerDown: () => setPuntero(true),
      onPointerUp: () => setPuntero(false),
      onPointerCancel: () => setPuntero(false),
      onWheel: () => {
        setRueda(true);
        clearTimeout(fin.current);
        fin.current = setTimeout(() => setRueda(false), FIN_DE_RUEDA_MS);
      },
    },
  };
}

function useEstado(cliente: ClienteDeDev, geometrias: GeometriasDeDev): { estado: EstadoDeDev | undefined; recargar: () => Promise<void> } {
  const [estado, setEstado] = useState<EstadoDeDev>();
  const recibir = (nuevo: EstadoDeDev): void => {
    geometrias.recibir(nuevo);
    setEstado((previo) => (previo === undefined || nuevo.version >= previo.version ? nuevo : previo));
  };
  const recibirVivo = useRef(recibir);
  recibirVivo.current = recibir;
  useEffect(() => cliente.suscribir((e) => recibirVivo.current(e)), [cliente]);
  const recargar = async (): Promise<void> => {
    const nuevo = await cliente.estado();
    if (nuevo !== undefined) recibir(nuevo);
  };
  return { estado, recargar };
}

/** Se vuelve a pedir el codigo tras cada estado nuevo; si la carga falla se conserva el registro anterior. */
function useComponentes(estado: EstadoDeDev | undefined, fetchFn: typeof fetch, confirmar: (mensaje: string) => boolean): ComponentesDeTema | undefined {
  const cargar = useMemo(() => crearCargadorDeCodigo({ fetch: fetchFn, confirmar }), [fetchFn, confirmar]);
  const [componentes, setComponentes] = useState<ComponentesDeTema>();
  const version = estado?.version;
  useEffect(() => {
    if (version === undefined) return;
    let vigente = true;
    void cargar().then(
      (registro) => {
        if (vigente) setComponentes(registro);
      },
      () => undefined,
    );
    return () => {
      vigente = false;
    };
  }, [version, cargar]);
  return componentes;
}

function useAviso(): [string | undefined, (texto: string) => void] {
  const [aviso, setAviso] = useState<string>();
  useEffect(() => {
    if (aviso === undefined) return;
    const t = setTimeout(() => setAviso(undefined), DURACION_DEL_AVISO_MS);
    return () => clearTimeout(t);
  }, [aviso]);
  return [aviso, setAviso];
}

/** Deshacer y rehacer del Historial de `dev` con Ctrl/Cmd+Z (el registro de comandos lo absorbera). */
function useAtajosDeHistorial(cliente: ClienteDeDev, avisar: (texto: string) => void, recargar: () => Promise<void>): void {
  const alAtajo = crearAlAtajo({ enviar: (accion) => (accion === 'deshacer' ? cliente.deshacer() : cliente.rehacer()), avisar, recargar });
  const vivo = useRef(alAtajo);
  vivo.current = alAtajo;
  useEffect(() => {
    const alTeclear = (e: KeyboardEvent): void => {
      const destino = e.target instanceof HTMLElement ? e.target : undefined;
      const enCampoDeTexto = destino !== undefined && (destino.isContentEditable || ['INPUT', 'TEXTAREA', 'SELECT'].includes(destino.tagName));
      const accion = accionDeAtajo({ key: e.key, ctrlKey: e.ctrlKey, metaKey: e.metaKey, shiftKey: e.shiftKey, altKey: e.altKey, repeat: e.repeat, enCampoDeTexto });
      if (accion === undefined) return;
      e.preventDefault();
      void vivo.current(accion);
    };
    window.addEventListener('keydown', alTeclear);
    return () => window.removeEventListener('keydown', alTeclear);
  }, []);
}

export function Estudio(props: PropsDelEstudio): ReactElement {
  const { fetch: fetchFn, eventos, layout, confirmar } = props;
  const hash = useMemo(() => hashDeEstudio(props.hash), [props.hash]);
  const cliente = useMemo(() => crearClienteDeDev({ fetch: fetchFn, eventos }), [fetchFn, eventos]);
  const geometrias = useMemo(
    () =>
      crearGeometriasDeDev({
        pedir: (vista) => cliente.geometria(vista),
        vistaInicial: (fuente) => {
          const { path } = deserializarEstado(hash.leer(), fuente);
          return path[path.length - 1];
        },
      }),
    [cliente, hash],
  );
  const { estado, recargar } = useEstado(cliente, geometrias);
  const [aviso, avisar] = useAviso();
  useAtajosDeHistorial(cliente, avisar, recargar);
  const dibujable = useSyncExternalStore(geometrias.suscribir, geometrias.dibujable);
  const componentes = useComponentes(estado, fetchFn, confirmar);
  const vivo = useRef(estado);
  vivo.current = estado;
  const alMover = crearAlMover({ estado: () => vivo.current, enviar: cliente.editar, avisar, recargar });
  const alOrdenar = crearAlOrdenar({ estado: () => vivo.current, enviar: cliente.editar, avisar, recargar });

  const marco = { estado, cliente, aviso, avisar };
  if (dibujable === undefined) return <Marco {...marco} navegacion={undefined} lienzo={null} />;
  return <ConFuente {...marco} dibujable={dibujable} hash={hash} geometrias={geometrias} layout={layout} componentes={componentes} alMover={alMover} alOrdenar={alOrdenar} />;
}

interface PropsDelMarco {
  estado: EstadoDeDev | undefined;
  cliente: ClienteDeDev;
  aviso: string | undefined;
  avisar: (texto: string) => void;
}

interface PropsConFuente extends PropsDelMarco {
  dibujable: Dibujable;
  hash: AdaptadorDeHash;
  geometrias: GeometriasDeDev;
  layout: AdaptadorDeLayout;
  componentes: ComponentesDeTema | undefined;
  alMover: (vista: string, mov: { id: string; x: number; y: number }) => Promise<boolean>;
  alOrdenar: (vista: string, cambio: { orden: string[] }) => Promise<boolean>;
}

/** La Vista activa, la Seleccion y la ruta viven en el hash; el lienzo y los paneles las comparten. */
function ConFuente({ dibujable, hash, geometrias, layout, componentes, alMover, alOrdenar, ...marco }: PropsConFuente): ReactElement {
  const { estado, geometrias: porVista } = dibujable;
  const fuente = estado.fuente;
  const props = useEstadoEnHash({ source: fuente, hash, defaultView: estado.vistas[0] ?? '', camera: true });
  useEffect(() => geometrias.activar(props.view), [geometrias, props.view]);
  const datos = usePropsDeDatos({ fuente, iconos: estado.iconos, geometrias: porVista }, props.view);
  const abrirDetalle = useRef<(() => void) | undefined>(undefined);
  const navegacion = navegacionDesde(props);
  const tema = datos.theme;
  const lienzo =
    tema === undefined ? null : (
      <VistaInteractiva
        {...props}
        onSelect={(id) => {
          props.onSelect(id);
          abrirDetalle.current?.();
        }}
        source={fuente}
        theme={tema}
        layout={layout}
        {...(estado.fuentes !== undefined && { fontFiles: estado.fuentes, fontUrl: urlDeFuente })}
        icons={datos.icons}
        {...(componentes !== undefined && { componentes })}
        width={datos.width}
        height={datos.height}
        cachedGeometries={datos.cachedGeometries}
        onMoveNode={(mov) => alMover(props.view, mov)}
        onReorderLifelines={(cambio) => alOrdenar(props.view, cambio)}
        chrome={false}
      />
    );
  const leyenda = tema === undefined ? null : <LeyendaDeVista fuente={fuente} props={props} tema={tema} />;
  return <Marco {...marco} fuente={fuente} hashProps={props} navegacion={navegacion} lienzo={lienzo} leyenda={leyenda} alAbrirDetalle={abrirDetalle} />;
}

function LeyendaDeVista({ fuente, props, tema }: { fuente: FuenteCanonica; props: PropsDeEstadoEnHash; tema: Parameters<typeof Leyenda>[0]['tema'] }): ReactElement | null {
  const vista = useMemo(() => resolveView(fuente, props.view, props.state), [fuente, props.view, props.state]);
  if (vista === undefined) return null;
  return (
    <div className="ui-leyenda">
      <Leyenda fuente={fuente} vista={vista} tema={tema} modo="auto" />
    </div>
  );
}

/** Migas montadas fuera del lienzo sobre la ruta controlada por el hash. */
function navegacionDesde(props: PropsDeEstadoEnHash): Navegacion {
  const ruta = props.path.length > 0 ? props.path : [props.view];
  return {
    vista: props.view,
    ruta,
    ir: (destino) => props.onPathChange([...ruta, destino]),
    atras: () => {
      if (ruta.length > 1) props.onPathChange(ruta.slice(0, -1));
    },
    irA: (indice) => {
      if (indice >= 0 && indice < ruta.length - 1) props.onPathChange(ruta.slice(0, indice + 1));
    },
  };
}

interface PropsDeMarcoCompleto extends PropsDelMarco {
  fuente?: FuenteCanonica;
  hashProps?: PropsDeEstadoEnHash;
  navegacion: Navegacion | undefined;
  lienzo: ReactNode;
  leyenda?: ReactNode;
  /** El marco publica aqui como abrir el Detalle (un clic en un Nodo lo llama). */
  alAbrirDetalle?: { current: (() => void) | undefined };
}

function Marco({ estado, cliente, aviso, avisar, fuente, hashProps, navegacion, lienzo, leyenda, alAbrirDetalle }: PropsDeMarcoCompleto): ReactElement {
  const lienzoTamano = useTamano();
  const medidas = { ancho: lienzoTamano.width, alto: lienzoTamano.height };
  const izquierda = useIsla({ lado: 'izquierda', id: 'ui-isla-izquierda', nombre: 'panel izquierdo', lienzo: medidas, anchoInicial: 280 });
  const derecha = useIsla({ lado: 'derecha', id: 'ui-isla-derecha', nombre: 'panel derecho', lienzo: medidas, anchoInicial: 400 });
  const [pestanas, setPestanas] = useState<Record<LadoDeIsla, string>>({ izquierda: 'vistas', derecha: 'detalle' });
  const [portales, setPortales] = useState<HTMLElement | null>(null);
  const islas = { izquierda, derecha };
  const gesto = useGestoEnLienzo();

  const abrirPestana = (lado: LadoDeIsla, pestana: string): void => {
    islas[lado].mostrar();
    setPestanas((p) => ({ ...p, [lado]: pestana }));
  };
  if (alAbrirDetalle !== undefined) alAbrirDetalle.current = () => abrirPestana('derecha', 'detalle');

  const contexto: ContextoDelEstudio = {
    estado,
    fuente,
    cliente,
    vista: hashProps?.view,
    seleccion: hashProps?.selected ?? null,
    irAVista: (vista) => hashProps?.onPathChange([vista]),
    seleccionar: (id) => hashProps?.onSelect(id),
    abrirPestana,
    alternarIsla: (lado) => islas[lado].alternar(),
    avisar,
    portales,
  };

  return (
    <ContextoDeEstudio.Provider value={contexto}>
      <div className="ui-chrome" data-arrastrando={izquierda.arrastrando || derecha.arrastrando || gesto.enGesto ? '' : undefined}>
        <main className="ui-lienzo" aria-label="Lienzo" {...gesto.props}>
          {lienzo}
        </main>
        <header className="ui-barra">
          <span className="ui-pildora ui-marca">rinthel-arch</span>
          {navegacion !== undefined && (
            <div className="ui-pildora ui-migas">
              <Migas navegacion={navegacion} />
            </div>
          )}
          {PILDORAS_DE_LA_BARRA.map(({ id, Contenido }) => (
            <div key={id} className="ui-pildora">
              <Contenido />
            </div>
          ))}
        </header>
        <IslaLateral lado="izquierda" id="ui-isla-izquierda" nombre="panel izquierdo" isla={izquierda} pestanas={PESTANAS_IZQUIERDAS} activa={pestanas.izquierda} alCambiarPestana={(p) => setPestanas((v) => ({ ...v, izquierda: p }))} />
        <IslaLateral lado="derecha" id="ui-isla-derecha" nombre="panel derecho" isla={derecha} pestanas={PESTANAS_DERECHAS} activa={pestanas.derecha} alCambiarPestana={(p) => setPestanas((v) => ({ ...v, derecha: p }))} />
        {leyenda}
        {aviso !== undefined && (
          <div className="ui-toasts">
            <div role="alert" className="ui-toast">
              {aviso}
            </div>
          </div>
        )}
        <div className="ui-portales" ref={setPortales} />
      </div>
    </ContextoDeEstudio.Provider>
  );
}
