/**
 * Entrada de navegador de `diagrams dev`: pagina viva. Pide el estado a
 * `/api/estado`, se suscribe a `/eventos` (SSE) y, cuando llega un estado
 * nuevo, pide la geometria de cada Vista a `/api/vista/<id>`. Muestra la Vista
 * elegida por el hash de URL y un panel de issues clicables. Ctrl/Cmd+Z y Ctrl/Cmd+Mayus+Z (o Ctrl+Y) piden deshacer/rehacer al servidor. Arrastrar un Nodo envia
 * `POST /api/pin` con el hash del archivo de la Vista; un 409 recarga el estado y avisa. No es parte de la
 * interfaz del paquete: la empaqueta `dev-shell.ts`.
 */
import { useEffect, useMemo, useRef, useState } from 'react';
import type { ReactElement } from 'react';

import { urlDeFuente } from 'canonico';
import type { EstadoDeDev, FuenteCanonica, GeometriaCacheada, IssueDeDev } from 'canonico';
import { VistaInteractiva, adaptadorDeWorker, crearEnviadorDePin, hashDelNavegador, useEstadoEnHash } from 'shell';
import type { AdaptadorDeLayout, PuertoDeMensajes } from 'shell';
import type { ComponentesDeTema } from 'render';

import { montar, usePropsDeDatos } from './arranque';
import { crearCargadorDeCodigo } from './componentes';
import { accionDeAtajo, crearAlAtajo, crearEnviadorDeHistorial } from './historial';
import { crearAlMover } from './mover';

/** Estado del servidor: esquema unico de `canonico` (`estadoDeDevSchema`), el mismo que produce `dev`. */
type Estado = EstadoDeDev;

/** Estado vigente (el inicial y cada evento SSE) y `recargar`, que lo pide de nuevo a `/api/estado`. */
function useEstado(): { estado: Estado | undefined; recargar: () => Promise<void> } {
  const [estado, setEstado] = useState<Estado>();
  useEffect(() => {
    const origen = new EventSource('/eventos');
    origen.onmessage = (evento: MessageEvent<string>) => setEstado(JSON.parse(evento.data) as Estado);
    return () => origen.close();
  }, []);
  const recargar = async (): Promise<void> => {
    const nuevo = (await (await fetch('/api/estado')).json()) as Estado;
    setEstado((previo) => (previo === undefined || nuevo.version >= previo.version ? nuevo : previo));
  };
  return { estado, recargar };
}

/** Geometria cacheada de cada Vista para la version vigente del estado. */
function useGeometrias(estado: Estado | undefined): Record<string, GeometriaCacheada> | undefined {
  const [geometrias, setGeometrias] = useState<{ version: number; porVista: Record<string, GeometriaCacheada> }>();
  const version = estado?.version;
  const vistas = estado?.vistas;
  useEffect(() => {
    if (version === undefined || vistas === undefined) return;
    let vigente = true;
    void Promise.all(
      vistas.map(async (id) => [id, (await (await fetch(`/api/vista/${encodeURIComponent(id)}`)).json()) as GeometriaCacheada] as const),
    ).then((pares) => {
      if (vigente) setGeometrias({ version, porVista: Object.fromEntries(pares) });
    }, () => undefined);
    return () => {
      vigente = false;
    };
  }, [version, vistas]);
  return geometrias?.version === version ? geometrias?.porVista : undefined;
}

/**
 * Componentes de Tema (Capa `code`): tras cada estado nuevo se vuelve a pedir el codigo (un cambio de `.tsx` llega como
 * estado `codigo`), con confirmacion explicita la primera vez. Si la carga falla se conserva el registro anterior.
 */
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
  // Las medidas reales de texto (fuentes del Workspace) viajan al Worker: sin ellas el layout estima por caracter.
  return (vista, tema, medidas) => {
    adaptador ??= fetch('/worker.js')
      .then((r) => r.text())
      .then((codigo) => adaptadorDeWorker(new Worker(URL.createObjectURL(new Blob([codigo], { type: 'text/javascript' }))) as unknown as PuertoDeMensajes));
    return adaptador.then((layout) => layout(vista, tema, medidas));
  };
}

/** Mientras no hay Vista dibujable (el Workspace nunca compilo) no hay lienzo que aloje el chrome: lista simple sin Tema. */
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

/**
 * Adaptador unico del hash: `useEstadoEnHash` se suscribe a `hashchange`/`popstate` por el, de modo
 * que atras/adelante o editar el hash a mano cambia la Vista; al recompilar, `Vista` no se
 * remonta, asi que camara, colapso y seleccion se conservan.
 */
const hash = hashDelNavegador(window);

const enviarPin = crearEnviadorDePin();
const enviarHistorial = crearEnviadorDeHistorial();

interface PropsDeVista {
  fuente: FuenteCanonica;
  estado: Estado;
  geometrias: Record<string, GeometriaCacheada>;
  layout: AdaptadorDeLayout;
  componentes: ComponentesDeTema | undefined;
  /** Arrastre soltado: la Vista dibujada y el Nodo; resuelve `false` si se rechazo. */
  alMover: (vista: string, mov: { id: string; x: number; y: number }) => Promise<boolean>;
  /** Aviso vigente de un Pin rechazado. */
  aviso: string | undefined;
}

function Vista({ fuente, estado, geometrias, layout, componentes, alMover, aviso }: PropsDeVista): ReactElement | null {
  const props = useEstadoEnHash({ source: fuente, hash, defaultView: estado.vistas[0] ?? '', camera: true });
  const { icons, cachedGeometries, theme: tema, width, height } = usePropsDeDatos({ fuente, iconos: estado.iconos, geometrias }, props.view);
  if (tema === undefined) return null;
  return <VistaInteractiva {...props} source={fuente} theme={tema} layout={layout} {...(estado.fuentes !== undefined && { fontFiles: estado.fuentes, fontUrl: urlDeFuente })} icons={icons} {...(componentes !== undefined && { componentes })} width={width} height={height} cachedGeometries={cachedGeometries} onMoveNode={(mov) => alMover(props.view, mov)} issues={estado.issues} toasts={aviso === undefined ? [] : [aviso]} />;
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
  const alMover = crearAlMover({ estado: () => vivo.current, enviar: enviarPin, avisar: setAviso, recargar });
  const alAtajo = crearAlAtajo({ enviar: enviarHistorial, avisar: setAviso, recargar });
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
  const geometrias = useGeometrias(estado);
  // La ultima Vista dibujable se conserva mientras llega la nueva.
  const [ultima, setUltima] = useState<{ fuente: FuenteCanonica; estado: Estado; geometrias: Record<string, GeometriaCacheada> }>();
  useEffect(() => {
    if (estado?.fuente !== undefined && geometrias !== undefined) setUltima({ fuente: estado.fuente, estado, geometrias });
  }, [estado, geometrias]);
  const layout = useMemo(layoutEnWorker, []);
  const componentes = useComponentes(estado);
  return (
    <>
      {ultima === undefined ? <IssuesSinVista issues={estado?.issues ?? []} /> : <Vista {...ultima} layout={layout} componentes={componentes} alMover={alMover} aviso={aviso} />}
    </>
  );
}

montar(<App />);
