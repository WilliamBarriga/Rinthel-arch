/**
 * `shell` — capa interactiva sobre `render` (pan/zoom, seleccion, filtrado por
 * viewport; colapso, drill-down y Pasos llegan en tickets siguientes).
 *
 * Interfaz publica:
 * - `<VistaInteractiva source view theme layout width height ... />`: resuelve la
 *   Vista `view` de la Fuente canonica (`resolveView`, con `state` opcional de
 *   colapso), pide la Geometria al adaptador `layout` y la dibuja con `Diagram`.
 * - `AdaptadorDeLayout = (vista, tema) => Promise<Geometria>`: seam de layout.
 *   En produccion envuelve `layoutView` (ELK, o su motor en Web Worker); en
 *   pruebas es un fake en memoria.
 * - `Camara` (`{x, y, width, height}` en unidades de la geometria; escala 1 =
 *   `width`/`height` del lienzo) y `VistaInteractivaProps`.
 *
 * Camara: controlada con `camera` + `onCameraChange` (el padre decide; si
 * ignora el aviso, la camara no se mueve) o interna si no se pasa `camera`.
 * Pan y zoom los da d3-zoom (arrastre, rueda, tactil); escala entre 0.05 y 16.
 * Seleccion: `selected` controlada o interna; `onSelect(id)` al pulsar un Nodo;
 * el Nodo marcado lleva un rectangulo con `data-selected="<id>"`.
 * Filtrado por viewport: solo se dibujan Nodos y Aristas cuya caja o ruta cruza
 * la camara; un Grupo visible conserva solo sus hijos visibles.
 *
 * Invariantes: no guarda verdad propia salvo camara y seleccion cuando no son
 * controladas; solo dibuja lo que `render` devuelve; un layout que llega tarde
 * (Vista, Tema o adaptador cambiaron) se descarta, y mientras llega el nuevo se
 * sigue mostrando el anterior. Modos de error: Vista inexistente lanza al
 * renderizar; un rechazo del adaptador va a `onError` o, sin el, se lanza al
 * renderizar (para un error boundary). Configuracion requerida: Fuente canonica,
 * Vista, Tema, adaptador de layout y tamano del lienzo. Peer React 18 y 19.
 * Solo importa paquetes anteriores en la cadena `canonico -> dsl -> layout -> render -> shell`.
 */
export const paquete = 'shell';

export { VistaInteractiva } from './vista-interactiva';
export type { AdaptadorDeLayout, VistaInteractivaProps } from './vista-interactiva';
export type { Camara } from 'render';
