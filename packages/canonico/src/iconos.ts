/**
 * Puerto `IconProvider` (clave opaca -> SVG inline) y sus adaptadores: los
 * iconos genericos del nucleo y los SVG del Workspace (ADR 0002). El nucleo no
 * conoce ningun set de marcas: uno externo se enchufa como otro `IconProvider`.
 */
import type { TipoDeNodo } from './esquema';

/** Resuelve una clave de icono a SVG inline; `undefined` si no la conoce. */
export interface IconProvider {
  resolve(key: string): string | undefined;
  /** Claves conocidas, para sugerir candidatos ante un typo. */
  keys(): string[];
}

const svg = (cuerpo: string): string =>
  `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">${cuerpo}</svg>`;

const GENERICOS: Readonly<Record<string, string>> = {
  box: svg('<rect x="4" y="4" width="16" height="16" rx="2"/>'),
  server: svg('<rect x="3" y="4" width="18" height="6" rx="1"/><rect x="3" y="14" width="18" height="6" rx="1"/><path d="M7 7h.01M7 17h.01"/>'),
  database: svg('<ellipse cx="12" cy="5" rx="8" ry="3"/><path d="M4 5v14c0 1.7 3.6 3 8 3s8-1.3 8-3V5"/><path d="M4 12c0 1.7 3.6 3 8 3s8-1.3 8-3"/>'),
  user: svg('<circle cx="12" cy="8" r="4"/><path d="M4 21c0-4 3.6-7 8-7s8 3 8 7"/>'),
  queue: svg('<rect x="2" y="8" width="5" height="8"/><rect x="9.5" y="8" width="5" height="8"/><rect x="17" y="8" width="5" height="8"/>'),
  cloud: svg('<path d="M7 18a4 4 0 0 1-.5-8A6 6 0 0 1 18 9a4.5 4.5 0 0 1-.5 9z"/>'),
};

/** Adaptador: el set pequeno de iconos genericos propios del nucleo. */
export function genericIcons(): IconProvider {
  return {
    resolve: (key) => GENERICOS[key],
    keys: () => Object.keys(GENERICOS),
  };
}

/**
 * Adaptador: los archivos `.svg` del Workspace (mapa ruta -> texto). La clave es
 * el nombre del archivo sin carpeta ni extension (`iconos/mi-logo.svg` -> `mi-logo`).
 */
export function workspaceIcons(archivos: Readonly<Record<string, string>>): IconProvider {
  const porClave = new Map<string, string>();
  for (const ruta of Object.keys(archivos).sort()) {
    if (!ruta.endsWith('.svg')) continue;
    const clave = ruta.slice(ruta.lastIndexOf('/') + 1, -'.svg'.length);
    if (!porClave.has(clave)) porClave.set(clave, archivos[ruta] as string);
  }
  return { resolve: (key) => porClave.get(key), keys: () => [...porClave.keys()] };
}

/** Gana el primer proveedor que conoce la clave; los siguientes sirven de respaldo. */
export function combineIconProviders(...proveedores: IconProvider[]): IconProvider {
  return {
    resolve: (key) => proveedores.map((proveedor) => proveedor.resolve(key)).find((icono) => icono !== undefined),
    keys: () => [...new Set(proveedores.flatMap((proveedor) => proveedor.keys()))],
  };
}

/** SVG inline del icono de un Tipo de nodo; `undefined` sin icono o con clave desconocida. */
export function resolveNodeTypeIcon(tipo: TipoDeNodo, iconos: IconProvider): string | undefined {
  return tipo.icon === undefined ? undefined : iconos.resolve(tipo.icon);
}

/** Iconos de un proveedor como mapa clave -> SVG, con claves ordenadas (determinista); lo que viaja al navegador. */
export function serializarIconos(proveedor: IconProvider): Record<string, string> {
  return Object.fromEntries(
    proveedor.keys().sort().flatMap((clave) => {
      const svg = proveedor.resolve(clave);
      return svg === undefined ? [] : [[clave, svg] as const];
    }),
  );
}

/** Inverso de `serializarIconos`: un `IconProvider` sobre el mapa. */
export function hidratarIconos(iconos: Readonly<Record<string, string>>): IconProvider {
  return { resolve: (clave) => iconos[clave], keys: () => Object.keys(iconos) };
}

const ETIQUETAS_DE_ICONO = new Set(['svg', 'g', 'path', 'circle', 'ellipse', 'rect', 'line', 'polyline', 'polygon']);
const ATRIBUTOS_DE_ICONO = new Set([
  'xmlns', 'viewBox', 'width', 'height', 'd', 'cx', 'cy', 'r', 'rx', 'ry', 'x', 'y', 'x1', 'y1', 'x2', 'y2', 'points', 'transform',
  'fill', 'stroke', 'stroke-width', 'stroke-linecap', 'stroke-linejoin', 'stroke-dasharray', 'fill-rule', 'clip-rule', 'opacity',
  'fill-opacity', 'stroke-opacity',
]);
const ETIQUETA_SVG = /<(\/?)([a-zA-Z][\w-]*)((?:\s+[\w:-]+\s*=\s*"[^"<>]*")*)\s*(\/?)>/g;
const ATRIBUTO_SVG = /\s+([\w:-]+)\s*=\s*"([^"]*)"/g;

/**
 * Saneado del icono por lista blanca: solo etiquetas de forma y atributos de
 * dibujo, entre comillas dobles, sin `url(`; sin texto suelto, sin `id` ni
 * referencias. Quita el prologo XML y los comentarios. Devuelve `undefined` si
 * hay algo fuera de la lista: el icono viene de fuera (Workspace) y el SVG
 * exportado debe ser autocontenido.
 */
export function sanearIcono(svg: string): string | undefined {
  const limpio = svg.replace(/^\s*<\?xml[^>]*\?>/, '').replace(/<!--[\s\S]*?-->/g, '').trim();
  if (limpio.replace(ETIQUETA_SVG, '').trim() !== '') return undefined;
  for (const [, , nombre = '', atributos = ''] of limpio.matchAll(ETIQUETA_SVG)) {
    if (!ETIQUETAS_DE_ICONO.has(nombre)) return undefined;
    for (const [, atributo = '', valor = ''] of atributos.matchAll(ATRIBUTO_SVG)) {
      if (!ATRIBUTOS_DE_ICONO.has(atributo) || /url\(|javascript:|&/i.test(valor)) return undefined;
    }
  }
  return /^<svg[\s>]/.test(limpio) ? limpio : undefined;
}
