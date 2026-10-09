/**
 * `render` — dibuja una Vista como SVG.
 *
 * Dos salidas de una misma escena (`construirEscena`): `renderToSvgString({ view,
 * geometry, theme, width, height, icons? })` devuelve el SVG como cadena (export
 * estatico) y `<Diagram {...props} />` es el componente React (ADR 0003). Ambos
 * reciben la Vista resuelta y su Geometria (salida de `layout`; `view` es extra
 * porque la Geometria no lleva jerarquia, textos ni colores) y dibujan Nodos,
 * Grupos y Aristas con los tokens del Tema:
 * - Un Grupo colapsado es un Nodo con su contador y trazo discontinuo.
 * - Un Nodo hoja con Atributos los lista en orden; una Arista a `nodo#atributo`
 *   termina en la fila del Atributo.
 * - El icono del Tipo de nodo, si `icons` (un `IconProvider`) lo resuelve, va
 *   inline; un SVG con referencias externas, scripts o eventos se descarta.
 * - Cada Arista es una ruta ortogonal con flecha en el destino y cardinalidad
 *   junto a cada puerto; sin ruta en la geometria, se omite.
 *
 * `renderToSvgString` acepta ademas `fonts` (`FuenteIncrustada[]`: familia, MIME y
 * base64) y las incrusta como `@font-face` con data URI, sin recursos externos.
 *
 * Props de `Diagram` ademas de las anteriores: `visibility(id) -> 0..1` (opacidad
 * de Nodos, por id, y de Aristas, por `idDeArista`; sin ella, todo 1; `revealAt`
 * de `canonico` la produce), `camera` (viewBox controlado), `onSelect(id)` y
 * `onToggle(id)`. El colapso viene en `view`: quien llama resuelve la Vista con
 * su estado de `expanded`/`collapsed` (`resolveView`) y `onToggle` solo avisa
 * de que se pulso el control de un Grupo, que se dibuja solo si hay `onToggle`.
 *
 * `detail` (`NivelDeDetalle`: `etiqueta` | `titulo` | `completo`) elige cuanto texto se
 * dibuja sin tocar cajas ni rutas: el `label` de la Vista se respeta siempre y solo
 * `completo` dibuja los Atributos; sin `detail`, etiqueta de la Vista y Atributos.
 *
 * Invariantes: sin estado ni efectos (mismas props, mismo arbol); determinista
 * byte a byte en la cadena; los colores salen solo del Tema, por nombre de Paleta
 * (ADR 0006); sin dependencia de Next, Tailwind ni json-render. Peer React 18 y 19.
 * Modos de error: una geometria que no contiene un Nodo de la Vista lanza
 * excepcion de uso. Configuracion requerida: `theme` y `geometry` resueltos por
 * paquetes anteriores.
 * Solo importa paquetes anteriores en la cadena `canonico -> dsl -> layout -> render`.
 */
export { Diagram } from './diagram';
export type { DiagramProps } from './diagram';
export type { Camara, NivelDeDetalle } from './escena';
export { renderToSvgString } from './svg';
export type { EntradaDeRender, FuenteIncrustada } from './svg';
