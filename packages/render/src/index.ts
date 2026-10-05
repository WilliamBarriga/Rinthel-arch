/**
 * `render` — dibuja una Vista como SVG.
 *
 * `renderToSvgString({ view, geometry, theme, width, height })` recibe la Vista
 * resuelta y su Geometria (salida de `layout`) y devuelve el SVG como cadena:
 * Nodos, Grupos y Aristas con los tokens del Tema. Un Grupo colapsado se dibuja
 * como un Nodo con su contador y trazo discontinuo. Cada Arista es una ruta
 * ortogonal con flecha en el destino y, si la tiene, cardinalidad junto a cada
 * puerto; una Arista sin ruta en la geometria se omite.
 *
 * Por ahora solo hay camino de cadena (el export estatico del ADR 0003): el
 * componente React con `visibility`, `expanded` y `camera` llega en tickets
 * posteriores. `view` es parametro extra a
 * `geometry` porque la Geometria no lleva jerarquia, textos ni colores.
 *
 * Invariantes: funcion pura (sin reloj, sin estado propio); determinista byte a
 * byte; los colores salen solo del Tema, por nombre de Paleta (ADR 0006); sin
 * dependencia de Next, Tailwind ni json-render.
 * Modos de error: una geometria que no contiene un Nodo de la Vista lanza
 * excepcion de uso. Configuracion requerida: `theme` y `geometry` resueltos por
 * paquetes anteriores.
 * Solo importa paquetes anteriores en la cadena `canonico -> dsl -> layout -> render`.
 */
export const paquete = 'render';

export { renderToSvgString } from './svg';
export type { EntradaDeRender } from './svg';
