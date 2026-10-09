/**
 * Estado del shell en el hash de URL: funciones puras (serializar/deserializar)
 * y el adaptador del navegador. Sin DOM salvo en `hashDelNavegador`.
 */
import type { EstadoDeColapso, FuenteCanonica, Nodo } from 'canonico';
import type { Camara } from 'render';

/** Estado del lector que vive en el hash. `path` termina en la Vista activa. */
export interface EstadoDeShell {
  path: string[];
  state: EstadoDeColapso;
  selected: string | null;
  step: number;
  camera?: Camara;
}

/** Seam del hash: `location.hash` en el navegador, un fake en memoria en pruebas. */
export interface AdaptadorDeHash {
  /** Hash vigente, con o sin `#`. */
  leer: () => string;
  /** Fija el hash (sin `#`); `reemplazar` no agrega entrada de historial. */
  escribir: (hash: string, opciones: { reemplazar: boolean }) => void;
  /** Avisa de cambios externos (atras/adelante, edicion manual); devuelve la baja. */
  suscribir: (aviso: () => void) => () => void;
}

/** Adaptador real sobre `win.location` e `history` (inyectar `window` o el de jsdom). */
export function hashDelNavegador(win: Window): AdaptadorDeHash {
  return {
    leer: () => win.location.hash,
    escribir: (hash, { reemplazar }) => {
      const destino = hash === '' ? win.location.pathname + win.location.search : `#${hash}`;
      if (reemplazar) {
        try {
          win.history.replaceState(null, '', destino);
        } catch {
          // Archivos locales (file://): algunos navegadores rechazan replaceState; un cambio de hash reemplaza la entrada igual.
          win.location.replace(`#${hash}`);
        }
      }
      else if (hash === '') {
        try {
          win.history.pushState(null, '', destino);
        } catch {
          win.location.hash = '';
        }
      }
      else win.location.hash = hash;
    },
    suscribir: (aviso) => {
      win.addEventListener('hashchange', aviso);
      win.addEventListener('popstate', aviso);
      return () => {
        win.removeEventListener('hashchange', aviso);
        win.removeEventListener('popstate', aviso);
      };
    },
  };
}

const idsDelModelo = (nodos: readonly Nodo[], acumulado = new Set<string>()): Set<string> => {
  for (const n of nodos) {
    acumulado.add(n.id);
    idsDelModelo(n.children, acumulado);
  }
  return acumulado;
};

/** Vista por defecto: la primera de la Fuente (`undefined` si no hay Vistas). */
export const vistaPorDefecto = (source: FuenteCanonica): string | undefined => source.views[0]?.id;

/**
 * Estado -> hash (sin `#`). Omite lo que vale su default, asi el estado inicial
 * da hash vacio. `vistaInicial` es la Vista por defecto con ruta `[vistaInicial]`.
 */
export function serializarEstado(estado: EstadoDeShell, vistaInicial?: string): string {
  const p = new URLSearchParams();
  if (!(estado.path.length === 1 && estado.path[0] === vistaInicial)) for (const v of estado.path) p.append('p', v);
  for (const id of estado.state.expanded ?? []) p.append('e', id);
  for (const id of estado.state.collapsed ?? []) p.append('c', id);
  if (estado.selected !== null) p.set('s', estado.selected);
  if (estado.step !== 0) p.set('t', String(estado.step));
  if (estado.camera !== undefined) {
    const { x, y, width, height } = estado.camera;
    p.set('cam', [x, y, width, height].join(','));
  }
  return p.toString();
}

function leerCamara(texto: string | null): Camara | undefined {
  if (texto === null) return undefined;
  const partes = texto.split(',');
  if (partes.length !== 4 || partes.some((s) => s.trim() === '')) return undefined;
  const [x, y, width, height] = partes.map(Number) as [number, number, number, number];
  if (![x, y, width, height].every(Number.isFinite) || width <= 0 || height <= 0) return undefined;
  return { x, y, width, height };
}

/**
 * Hash -> estado valido contra la Fuente. Nunca lanza: lo que no se entiende o
 * no existe (Vista, Nodo, Paso fuera de rango, camara mal formada) cae al
 * default de ese campo. El estado de colapso trae `expanded` y `collapsed`
 * juntos, o es `{}`. `vistaInicial` por defecto es la primera Vista de la Fuente.
 */
export function deserializarEstado(hash: string, source: FuenteCanonica, vistaInicial: string | undefined = vistaPorDefecto(source)): EstadoDeShell {
  const p = new URLSearchParams(hash.startsWith('#') ? hash.slice(1) : hash);
  const vistas = new Set(source.views.map((v) => v.id));
  const nodos = idsDelModelo(source.model.nodes);

  let path = p.getAll('p').filter((v) => vistas.has(v));
  if (path.length === 0) path = vistaInicial === undefined ? [] : [vistaInicial];
  const activa = source.views.find((v) => v.id === path[path.length - 1]);

  const conocidos = (clave: string): string[] => p.getAll(clave).filter((id) => nodos.has(id));
  const expanded = conocidos('e');
  const collapsed = conocidos('c');
  const state: EstadoDeColapso = expanded.length === 0 && collapsed.length === 0 ? {} : { expanded, collapsed };

  const s = p.get('s');
  const selected = s !== null && nodos.has(s) ? s : null;

  const t = p.get('t');
  const n = t !== null && /^\d+$/.test(t) ? Number(t) : 0;
  const step = n <= (activa?.steps?.length ?? 0) ? n : 0;

  const camera = leerCamara(p.get('cam'));
  return { path, state, selected, step, ...(camera !== undefined && { camera }) };
}
