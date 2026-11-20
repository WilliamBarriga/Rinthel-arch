/**
 * `<Estudio>`: la app de `dev` (marco F). Lienzo a pantalla completa (`VistaInteractiva` con `chrome={false}`) y encima
 * la barra de pildoras, las islas laterales con las pestanas del registro (`marco/pestanas.tsx`), la leyenda y los toasts.
 * Toda la red pasa por el cliente que se arma con `fetch` y `eventos` inyectados (en pruebas, los de `devEnMemoria`);
 * la Vista vive en el hash (`#vista=<id>`). Sin Fuente (el Workspace nunca compilo) el lienzo queda vacio y los paneles lo dicen.
 */
import { useEffect, useMemo, useRef, useState, useSyncExternalStore } from 'react';
import type { ReactElement, ReactNode } from 'react';

import { resolveView, urlDeFuente } from 'canonico';
import type { FuenteCanonica, GeometriaCacheada } from 'canonico';
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
import { ContextoDeEstudio } from './marco/contexto';
import type { ContextoDelEstudio, DialogoDelEstudio, SitioDeCodigo } from './marco/contexto';
import { IslaLateral } from './marco/isla';
import type { LadoDeIsla } from './marco/limites';
import { PESTANAS_DERECHAS, PESTANAS_IZQUIERDAS, PILDORAS_DE_LA_BARRA } from './marco/pestanas';
import { useIsla } from './marco/use-isla';
import { crearAlMover, crearAlOrdenar } from './mover';
import { Ayuda } from './comandos/ayuda';
import { Buscador, PildoraDelBuscador } from './comandos/buscador';
import { COMANDOS } from './comandos/registro';
import { plataformaDe } from './comandos/teclas';
import type { Plataforma } from './comandos/teclas';
import { useAtajos } from './comandos/use-atajos';

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
  /** Como se escriben las teclas (`Cmd` o `Ctrl`); por defecto, la de `navigator`. */
  plataforma?: Plataforma;
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
  const dibujable = useSyncExternalStore(geometrias.suscribir, geometrias.dibujable);
  const componentes = useComponentes(estado, fetchFn, confirmar);
  const vivo = useRef(estado);
  vivo.current = estado;
  const alMover = crearAlMover({ estado: () => vivo.current, enviar: cliente.editar, avisar, recargar });
  const alOrdenar = crearAlOrdenar({ estado: () => vivo.current, enviar: cliente.editar, avisar, recargar });

  const plataforma = props.plataforma ?? plataformaDe(typeof navigator === 'undefined' ? undefined : navigator);
  const [temaPrevio, previsualizarTema] = useState<string>();
  const marco = { estado, cliente, aviso, avisar, recargar, plataforma, temaPrevio, previsualizarTema };
  if (dibujable === undefined) return <Marco {...marco} navegacion={undefined} lienzo={null} />;
  return <ConFuente {...marco} dibujable={dibujable} hash={hash} geometrias={geometrias} layout={layout} componentes={componentes} alMover={alMover} alOrdenar={alOrdenar} />;
}

interface PropsDelMarco {
  estado: EstadoDeDev | undefined;
  cliente: ClienteDeDev;
  aviso: string | undefined;
  avisar: (texto: string) => void;
  recargar: () => Promise<void>;
  plataforma: Plataforma;
  temaPrevio: string | undefined;
  previsualizarTema: (tema: string | undefined) => void;
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
  const { estado, geometrias: delServidor } = dibujable;
  const fuente = estado.fuente;
  const props = useEstadoEnHash({ source: fuente, hash, defaultView: estado.vistas[0] ?? '', camera: true });
  useEffect(() => geometrias.activar(props.view), [geometrias, props.view]);
  const { previsualizarTema } = marco;
  useEffect(() => previsualizarTema(undefined), [props.view, previsualizarTema]);
  const { fuente: dibujada, geometrias: porVista } = usePrevisualizacion(marco.cliente, fuente, delServidor, props.view, marco.temaPrevio, estado.version);
  const datos = usePropsDeDatos({ fuente: dibujada, iconos: estado.iconos, geometrias: porVista }, props.view);
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
        source={dibujada}
        theme={tema}
        layout={layout}
        {...(estado.fuentes !== undefined && { fontFiles: estado.fuentes, fontUrl: urlDeFuente })}
        icons={datos.icons}
        {...(componentes !== undefined && { componentes })}
        width={datos.width}
        height={datos.height}
        cachedGeometries={datos.cachedGeometries}
        {...(motivoSinGestos(marco.estado) === undefined && { onMoveNode: (mov) => alMover(props.view, mov), onReorderLifelines: (cambio) => alOrdenar(props.view, cambio) })}
        chrome={false}
      />
    );
  const leyenda = tema === undefined ? null : <LeyendaDeVista fuente={fuente} props={props} tema={tema} />;
  return <Marco {...marco} fuente={fuente} hashProps={props} navegacion={navegacion} lienzo={lienzo} leyenda={leyenda} alAbrirDetalle={abrirDetalle} />;
}

/**
 * Con `tema`, la Vista activa se dibuja con ese Tema sin escribir: su `theme` se sustituye en la Fuente dibujada y su
 * Geometria se pide con `?tema=` (mientras no llega, la calcula el Worker). Sin `tema`, todo pasa tal cual.
 */
function usePrevisualizacion(
  cliente: ClienteDeDev,
  fuente: FuenteCanonica,
  geometrias: Dibujable['geometrias'],
  vista: string,
  tema: string | undefined,
  version: number,
): { fuente: FuenteCanonica; geometrias: Dibujable['geometrias'] } {
  const [previa, setPrevia] = useState<{ vista: string; tema: string; geometria: GeometriaCacheada }>();
  useEffect(() => {
    if (tema === undefined) return;
    let vigente = true;
    void cliente.geometria(vista, { tema }).then((r) => {
      if (vigente && r.ok) setPrevia({ vista, tema, geometria: r.geometria });
    });
    return () => {
      vigente = false;
    };
  }, [cliente, vista, tema, version]);
  return useMemo(() => {
    if (tema === undefined) return { fuente, geometrias };
    const conTema = { ...fuente, views: fuente.views.map((v) => (v.id === vista ? { ...v, theme: tema } : v)) };
    const { [vista]: _delTemaPropio, ...resto } = geometrias;
    const llego = previa !== undefined && previa.vista === vista && previa.tema === tema;
    return { fuente: conTema, geometrias: llego ? { ...resto, [vista]: previa.geometria } : resto };
  }, [fuente, geometrias, vista, tema, previa]);
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

/**
 * Con errores (p. ej. un guardado del editor que no compila) el lienzo conserva la ultima Fuente buena y los Gestos
 * se deshabilitan: escribirian sobre un texto que no es el dibujado. Devuelve el motivo visible, o `undefined`.
 */
export function motivoSinGestos(estado: EstadoDeDev | undefined): string | undefined {
  const error = estado?.issues.find((i) => i.severity === 'error');
  return error === undefined ? undefined : `Gestos deshabilitados: el texto no compila (${error.file}:${error.line} ${error.message})`;
}

function Marco({ estado, cliente, aviso, avisar, recargar, plataforma, temaPrevio, previsualizarTema, fuente, hashProps, navegacion, lienzo, leyenda, alAbrirDetalle }: PropsDeMarcoCompleto): ReactElement {
  const lienzoTamano = useTamano();
  const medidas = { ancho: lienzoTamano.width, alto: lienzoTamano.height };
  const izquierda = useIsla({ lado: 'izquierda', id: 'ui-isla-izquierda', nombre: 'panel izquierdo', lienzo: medidas, anchoInicial: 280 });
  const derecha = useIsla({ lado: 'derecha', id: 'ui-isla-derecha', nombre: 'panel derecho', lienzo: medidas, anchoInicial: 400 });
  const [pestanas, setPestanas] = useState<Record<LadoDeIsla, string>>({ izquierda: 'vistas', derecha: 'detalle' });
  const [portales, setPortales] = useState<HTMLElement | null>(null);
  const [dialogo, setDialogo] = useState<DialogoDelEstudio>();
  const [sitioDeCodigo, setSitioDeCodigo] = useState<SitioDeCodigo>();
  const guardados = useRef(new Set<() => Promise<void>>());
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
    temaPrevio,
    previsualizarTema,
    avisar,
    recargar,
    abrirDialogo: setDialogo,
    abrirCodigo: (sitio) => {
      abrirPestana('izquierda', 'codigo');
      if (sitio !== undefined) setSitioDeCodigo(sitio);
    },
    sitioDeCodigo,
    async vaciarGuardado() {
      await Promise.all([...guardados.current].map((guardar) => guardar()));
    },
    registrarGuardado(guardar) {
      guardados.current.add(guardar);
      return () => guardados.current.delete(guardar);
    },
    plataforma,
    portales,
  };
  useAtajos(COMANDOS, contexto);
  const cerrarDialogo = (abierto: boolean): void => {
    if (!abierto) setDialogo(undefined);
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
          <PildoraDelBuscador />
          {motivoSinGestos(estado) !== undefined && (
            <div role="status" aria-label="Gestos" className="ui-pildora ui-aviso-gestos">
              {motivoSinGestos(estado)}
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
        <Buscador abierto={dialogo === 'buscador'} alCambiar={cerrarDialogo} />
        <Ayuda abierto={dialogo === 'ayuda'} alCambiar={cerrarDialogo} />
        <div className="ui-portales" ref={setPortales} />
      </div>
    </ContextoDeEstudio.Provider>
  );
}
