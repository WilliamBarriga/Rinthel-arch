/**
 * `render` — dibuja una Vista como componente React (ADR 0002 y 0008).
 *
 * `<Diagram {...props} />` recibe la Vista resuelta y su Geometria (salida de
 * `layout`; `view` es extra porque la Geometria no lleva jerarquia, textos ni
 * colores) y dibuja Nodos, Grupos y Aristas con el Estilo resuelto del Tema. Render
 * hibrido: tres capas planas en coordenadas absolutas (Grupos HTML, Aristas SVG,
 * Nodos HTML, en ese orden de apilado) bajo un contenedor `[data-diagram]` con un
 * solo `transform` de pan/zoom (la camara; `data-camara` la refleja). Cada Slot es
 * un `div` en el rectangulo de la Geometria; la pintura sale de una hoja de estilo
 * determinista (`<style>` con clase de alcance por contenido, estados como
 * selectores) donde cada Primitiva tiene su pintor (tabla exhaustiva) y cada
 * Nodo lleva `contain: layout style`:
 * - Un Grupo colapsado es un Nodo con su contador y trazo discontinuo.
 * - Un Nodo hoja con Atributos los lista en orden; una Arista a `nodo#atributo`
 *   termina en la fila del Atributo.
 * - El icono del Tipo de nodo, si `icons` (un `IconProvider`) lo resuelve, va
 *   inline; un SVG con referencias externas, scripts o eventos se descarta.
 * - Cada Arista es una ruta ortogonal con flecha en el destino y cardinalidad
 *   junto a cada puerto; sin ruta en la geometria, se omite.
 *
 * Props de `Diagram` ademas de las anteriores: `visibility(id) -> 0..1` (opacidad
 * de Nodos, por id, y de Aristas, por `idDeArista`; sin ella, todo 1; `revealAt`
 * de `canonico` la produce), `camera` (ventana visible del lienzo), `onSelect(id)` y
 * `onToggle(id)`. El colapso viene en `view`: quien llama resuelve la Vista con
 * su estado de `expanded`/`collapsed` (`resolveView`) y `onToggle` solo avisa
 * de que se pulso el control de un Grupo, que se dibuja solo si hay `onToggle`.
 *
 * `detail` (`NivelDeDetalle`: `etiqueta` | `titulo` | `completo`) elige cuanto texto se
 * dibuja sin tocar cajas ni rutas: el `label` de la Vista se respeta siempre y solo
 * `completo` dibuja los Atributos; sin `detail`, etiqueta de la Vista y Atributos.
 *
 * Estilo resuelto (ADR 0008): `resolverEstilo(tema, metricas?) -> Estilo` entrega todo
 * lo que el dibujo necesita (colores, fuentes, radios, trazos, flecha, halo, glifos y
 * las Metricas de `layout`) y lanza si el Tema no cumple `resolverTema` (paquete `tema`). Los
 * pintores por parte leen solo de el; `estilo` (prop opcional, por defecto el del Tema)
 * lo sustituye.
 *
 * Estados visuales: `estados` (`Estados`: id de Nodo, de Arista o `nodo#atributo` ->
 * lista de `EstadoVisual`: `seleccionado`, `hover`, `fantasma`) dibuja un contorno por estado
 * con el aspecto de `estilo.estados` (`data-state`, estilado por la hoja; el seleccionado lleva tambien `data-selected`).
 * Un id que no esta dibujado se ignora. Es la unica via de resaltado: el shell no pinta overlays propios.
 *
 * Invariantes: sin estado ni efectos (mismas props, mismo arbol); determinista
 * byte a byte en el marcado; los colores salen solo del Tema, por nombre de Paleta
 * (ADR 0002); sin dependencia de Next, Tailwind ni json-render. Peer React 18 y 19.
 * Modos de error: una geometria que no contiene un Nodo de la Vista lanza
 * excepcion de uso. Configuracion requerida: `theme` y `geometry` resueltos por
 * paquetes anteriores.
 * Solo importa paquetes anteriores en la cadena `canonico -> tema -> dsl -> layout -> render`.
 */
export { Diagram } from './diagram';
export type { DiagramProps } from './diagram';
export type { Camara, Estados, NivelDeDetalle } from './escena';
export { resolverEstilo } from './estilo';
export { PINTORES } from './hoja';
export { centroDeEtiquetaSinCaja } from './pintores';
export type { AspectoDeEstado, EstadoVisual, Estilo } from './estilo';
