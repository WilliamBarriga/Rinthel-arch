/**
 * Entrada de navegador de `diagrams dev`: pagina viva. Pide el estado a
 * `/api/estado`, se suscribe a `/eventos` (SSE) y, cuando llega un estado
 * nuevo, pide la geometria de cada Vista a `/api/vista/<id>`. Muestra la Vista
 * elegida por el hash de URL y un panel de issues clicables. Arrastrar un Nodo envia
 * `POST /api/pin` con el hash del archivo de la Vista; un 409 recarga el estado y avisa. No es parte de la
 * interfaz del paquete: la empaqueta `dev-shell.ts`.
 */
import { useEffect, useMemo, useRef, useState } from 'react';
import type { ReactElement } from 'react';
import { createRoot } from 'react-dom/client';

import type { FuenteCanonica, GeometriaCacheada, IconProvider } from 'canonico';
import { VistaInteractiva, adaptadorDeWorker, crearEnviadorDePin, hashDelNavegador, useEstadoEnHash } from 'shell';
import type { AdaptadorDeLayout, PuertoDeMensajes } from 'shell';

import { crearAlMover } from './mover';

interface IssueDeDev {
  file: string;
  line: number;
  column: number;
  severity: 'error' | 'warning';
  code: string;
  message: string;
  /** Enlace que abre el editor en `archivo:linea`. */
  href: string;
}

interface Estado {
  version: number;
  fuente?: FuenteCanonica;
  iconos: Record<string, string>;
  vistas: string[];
  /** Hash del contenido de cada archivo del Workspace. */
  hashes: Record<string, string>;
  /** Archivo en que se declara cada Vista. */
  archivosDeVista: Record<string, string>;
  issues: IssueDeDev[];
}

function useTamano(): { width: number; height: number } {
  const [tamano, setTamano] = useState({ width: window.innerWidth, height: window.innerHeight });
  useEffect(() => {
    const alCambiar = (): void => setTamano({ width: window.innerWidth, height: window.innerHeight });
    window.addEventListener('resize', alCambiar);
    return () => window.removeEventListener('resize', alCambiar);
  }, []);
  return tamano;
}

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

function layoutEnWorker(): AdaptadorDeLayout {
  let adaptador: Promise<AdaptadorDeLayout> | undefined;
  return (vista, tema) => {
    adaptador ??= fetch('/worker.js')
      .then((r) => r.text())
      .then((codigo) => adaptadorDeWorker(new Worker(URL.createObjectURL(new Blob([codigo], { type: 'text/javascript' }))) as unknown as PuertoDeMensajes));
    return adaptador.then((layout) => layout(vista, tema));
  };
}

function Aviso({ texto }: { texto: string | undefined }): ReactElement | null {
  if (texto === undefined) return null;
  return (
    <div data-aviso="pin" role="alert" style={{ position: 'fixed', top: 12, left: '50%', transform: 'translateX(-50%)', padding: '8px 16px', borderRadius: 6, background: 'rgba(30,30,30,.94)', color: '#ffd180', font: '13px/1.5 monospace' }}>
      {texto}
    </div>
  );
}

function PanelDeIssues({ issues }: { issues: readonly IssueDeDev[] }): ReactElement | null {
  if (issues.length === 0) return null;
  return (
    <ul
      data-panel="issues"
      style={{ position: 'fixed', left: 0, right: 0, bottom: 0, maxHeight: '35%', overflow: 'auto', margin: 0, padding: '8px 16px', listStyle: 'none', background: 'rgba(30,30,30,.94)', color: '#eee', font: '13px/1.5 monospace' }}
    >
      {issues.map((issue, i) => (
        <li key={i} style={{ color: issue.severity === 'error' ? '#ff8a80' : '#ffd180' }}>
          <a href={issue.href} style={{ color: 'inherit' }}>
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

interface PropsDeVista {
  fuente: FuenteCanonica;
  estado: Estado;
  geometrias: Record<string, GeometriaCacheada>;
  layout: AdaptadorDeLayout;
  /** Arrastre soltado: la Vista dibujada y el Nodo; resuelve `false` si se rechazo. */
  alMover: (vista: string, mov: { id: string; x: number; y: number }) => Promise<boolean>;
}

function Vista({ fuente, estado, geometrias, layout, alMover }: PropsDeVista): ReactElement | null {
  const props = useEstadoEnHash({ source: fuente, hash, defaultView: estado.vistas[0] ?? '', camera: true });
  const { width, height } = useTamano();
  const iconos = useMemo<IconProvider>(() => ({ resolve: (clave) => estado.iconos[clave], keys: () => Object.keys(estado.iconos) }), [estado.iconos]);
  const cachedGeometries = useMemo(() => Object.fromEntries(Object.entries(geometrias).map(([id, g]) => [id, g.geometry])), [geometrias]);
  const tema = fuente.themes.find(({ name }) => name === geometrias[props.view]?.theme) ?? fuente.themes[0];
  if (tema === undefined) return null;
  return <VistaInteractiva {...props} source={fuente} theme={tema} layout={layout} icons={iconos} width={width} height={height} cachedGeometries={cachedGeometries} onMoveNode={(mov) => alMover(props.view, mov)} />;
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
  const geometrias = useGeometrias(estado);
  // La ultima Vista dibujable se conserva mientras llega la nueva.
  const [ultima, setUltima] = useState<{ fuente: FuenteCanonica; estado: Estado; geometrias: Record<string, GeometriaCacheada> }>();
  useEffect(() => {
    if (estado?.fuente !== undefined && geometrias !== undefined) setUltima({ fuente: estado.fuente, estado, geometrias });
  }, [estado, geometrias]);
  const layout = useMemo(layoutEnWorker, []);
  return (
    <>
      {ultima === undefined ? null : <Vista {...ultima} layout={layout} alMover={alMover} />}
      <Aviso texto={aviso} />
      <PanelDeIssues issues={estado?.issues ?? []} />
    </>
  );
}

createRoot(document.getElementById('raiz') as HTMLElement).render(<App />);
