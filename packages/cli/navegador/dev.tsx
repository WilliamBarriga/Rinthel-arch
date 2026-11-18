/** Pagina viva de `dev`: toda la red pasa por `cliente.ts`; la Vista la elige el hash de URL. */
import { useEffect, useMemo, useRef, useState, useSyncExternalStore } from 'react';
import type { ReactElement } from 'react';

import { urlDeFuente } from 'canonico';
import type { EstadoDeDev, IssueDeDev } from 'canonico';
import { VistaInteractiva, adaptadorDeWorker, deserializarEstado, hashDelNavegador, useEstadoEnHash } from 'shell';
import type { AdaptadorDeLayout, PuertoDeMensajes } from 'shell';
import type { ComponentesDeTema } from 'render';

import { montar, usePropsDeDatos } from './arranque';
import { crearClienteDeDev } from './cliente';
import { crearCargadorDeCodigo } from './componentes';
import { crearGeometriasDeDev } from './geometrias';
import type { Dibujable } from './geometrias';
import { accionDeAtajo, crearAlAtajo } from './historial';
import { crearAlMover, crearAlOrdenar } from './mover';

type Estado = EstadoDeDev;

/** Unico adaptador del hash: al recompilar, `Vista` no se remonta y conserva camara, colapso y seleccion. */
const hash = hashDelNavegador(window);

const cliente = crearClienteDeDev({
  fetch: (...args) => fetch(...args),
  eventos: (url, alMensaje) => {
    const origen = new EventSource(url);
    origen.onmessage = (evento: MessageEvent<string>) => alMensaje(evento.data);
    return () => origen.close();
  },
});

const geometrias = crearGeometriasDeDev({
  pedir: (vista) => cliente.geometria(vista),
  vistaInicial: (fuente) => {
    const { path } = deserializarEstado(hash.leer(), fuente);
    return path[path.length - 1];
  },
});

function useEstado(): { estado: Estado | undefined; recargar: () => Promise<void> } {
  const [estado, setEstado] = useState<Estado>();
  const recibir = (nuevo: Estado): void => {
    geometrias.recibir(nuevo);
    setEstado((previo) => (previo === undefined || nuevo.version >= previo.version ? nuevo : previo));
  };
  useEffect(() => cliente.suscribir(recibir), []);
  const recargar = async (): Promise<void> => {
    const nuevo = await cliente.estado();
    if (nuevo !== undefined) recibir(nuevo);
  };
  return { estado, recargar };
}

/** Se vuelve a pedir el codigo tras cada estado nuevo; si la carga falla se conserva el registro anterior. */
function useComponentes(estado: Estado | undefined): ComponentesDeTema | undefined {
  const cargar = useMemo(() => crearCargadorDeCodigo({ fetch: (...args) => fetch(...args), confirmar: (mensaje) => window.confirm(mensaje) }), []);
  const [componentes, setComponentes] = useState<ComponentesDeTema>();
  const version = estado?.version;
  useEffect(() => {
    if (version === undefined) return;
    let vigente = true;
    void cargar().then((registro) => {
      if (vigente) setComponentes(registro);
    }, () => undefined);
    return () => {
      vigente = false;
    };
  }, [version, cargar]);
  return componentes;
}

function layoutEnWorker(): AdaptadorDeLayout {
  let adaptador: Promise<AdaptadorDeLayout> | undefined;
  return (vista, tema, medidas) => {
    adaptador ??= fetch('/worker.js')
      .then((r) => r.text())
      .then((codigo) => adaptadorDeWorker(new Worker(URL.createObjectURL(new Blob([codigo], { type: 'text/javascript' }))) as unknown as PuertoDeMensajes));
    return adaptador.then((layout) => layout(vista, tema, medidas));
  };
}

/** Sin Vista dibujable (el Workspace nunca compilo) no hay lienzo que aloje el chrome: lista simple sin Tema. */
function IssuesSinVista({ issues }: { issues: readonly IssueDeDev[] }): ReactElement | null {
  if (issues.length === 0) return null;
  return (
    <ul data-panel="issues">
      {issues.map((issue, i) => (
        <li key={i}>
          <a href={issue.href}>
            {issue.file}:{issue.line}
          </a>{' '}
          {issue.code} {issue.message}
        </li>
      ))}
    </ul>
  );
}

interface PropsDeVista extends Dibujable {
  layout: AdaptadorDeLayout;
  componentes: ComponentesDeTema | undefined;
  /** Resuelve `false` si se rechazo. */
  alMover: (vista: string, mov: { id: string; x: number; y: number }) => Promise<boolean>;
  alOrdenar: (vista: string, cambio: { orden: string[] }) => Promise<boolean>;
  aviso: string | undefined;
}

function Vista({ estado, geometrias: porVista, layout, componentes, alMover, alOrdenar, aviso }: PropsDeVista): ReactElement | null {
  const fuente = estado.fuente;
  const props = useEstadoEnHash({ source: fuente, hash, defaultView: estado.vistas[0] ?? '', camera: true });
  useEffect(() => geometrias.activar(props.view), [props.view]);
  const { icons, cachedGeometries, theme: tema, width, height } = usePropsDeDatos({ fuente, iconos: estado.iconos, geometrias: porVista }, props.view);
  if (tema === undefined) return null;
  return <VistaInteractiva {...props} source={fuente} theme={tema} layout={layout} {...(estado.fuentes !== undefined && { fontFiles: estado.fuentes, fontUrl: urlDeFuente })} icons={icons} {...(componentes !== undefined && { componentes })} width={width} height={height} cachedGeometries={cachedGeometries} onMoveNode={(mov) => alMover(props.view, mov)} onReorderLifelines={(cambio) => alOrdenar(props.view, cambio)} issues={estado.issues} toasts={aviso === undefined ? [] : [aviso]} />;
}

function App(): ReactElement {
  const { estado, recargar } = useEstado();
  const [aviso, setAviso] = useState<string>();
  useEffect(() => {
    if (aviso === undefined) return;
    const t = setTimeout(() => setAviso(undefined), 6000);
    return () => clearTimeout(t);
  }, [aviso]);
  const vivo = useRef(estado);
  vivo.current = estado;
  const enviar = cliente.editar;
  const alMover = crearAlMover({ estado: () => vivo.current, enviar, avisar: setAviso, recargar });
  const alOrdenar = crearAlOrdenar({ estado: () => vivo.current, enviar, avisar: setAviso, recargar });
  const alAtajo = crearAlAtajo({ enviar: (accion) => (accion === 'deshacer' ? cliente.deshacer() : cliente.rehacer()), avisar: setAviso, recargar });
  const alAtajoVivo = useRef(alAtajo);
  alAtajoVivo.current = alAtajo;
  useEffect(() => {
    const alTeclear = (e: KeyboardEvent): void => {
      const destino = e.target instanceof HTMLElement ? e.target : undefined;
      const enCampoDeTexto = destino !== undefined && (destino.isContentEditable || ['INPUT', 'TEXTAREA', 'SELECT'].includes(destino.tagName));
      const accion = accionDeAtajo({ key: e.key, ctrlKey: e.ctrlKey, metaKey: e.metaKey, shiftKey: e.shiftKey, altKey: e.altKey, repeat: e.repeat, enCampoDeTexto });
      if (accion === undefined) return;
      e.preventDefault();
      void alAtajoVivo.current(accion);
    };
    window.addEventListener('keydown', alTeclear);
    return () => window.removeEventListener('keydown', alTeclear);
  }, []);
  const dibujable = useSyncExternalStore(geometrias.suscribir, geometrias.dibujable);
  const erroresDeGeometria = dibujable?.errores ?? [];
  const layout = useMemo(layoutEnWorker, []);
  const componentes = useComponentes(estado);
  return (
    <>
      {erroresDeGeometria.length > 0 && (
        <ul data-panel="error-geometria" role="alert">
          {erroresDeGeometria.map((error) => (
            <li key={error}>{error}</li>
          ))}
        </ul>
      )}
      {dibujable === undefined ? <IssuesSinVista issues={estado?.issues ?? []} /> : <Vista {...dibujable} layout={layout} componentes={componentes} alMover={alMover} alOrdenar={alOrdenar} aviso={aviso} />}
    </>
  );
}

montar(<App />);
