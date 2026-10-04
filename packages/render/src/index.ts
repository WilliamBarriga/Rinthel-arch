/**
 * `render` — dibuja una Vista como SVG con React puro.
 *
 * Interfaz publica. Todo lo que no sale de este archivo (ni de `exports` del
 * `package.json`) es privado y puede cambiar sin avisar.
 *
 * Hoy:
 * - `paquete`: identidad del paquete, observable por cualquier consumidor.
 *
 * Previsto (spec #19, aun sin implementar): componente con props `geometry`,
 * `width`, `height`, `theme`, `expanded`, `onToggle`, `visibility(id) -> 0..1`,
 * camara controlada (`viewBox`) y `onSelect`, mas
 * `renderToSvgString(props) -> string` para el estatico.
 *
 * Invariantes:
 * - Componente puro: sin reloj, sin estado propio, sin dependencias de UI
 *   distintas de React (peer `^18 || ^19`); todo entra por props.
 * - Determinista: la misma entrada produce el mismo SVG byte a byte, porque de
 *   eso dependen el export PNG y los snapshots.
 * - Grupos colapsados no dibujan hijos; los Grupos con `link` no se expanden.
 * - React y los paquetes anteriores de la cadena
 *   `canonico -> dsl -> layout -> render -> shell / cli` se importan por nombre
 *   de paquete y unicamente por lo que declara su `exports`.
 *
 * Modos de error:
 * - Props ausentes o inconsistentes: excepcion de uso con el motivo; no hay
 *   render parcial ni estado que dejar a medias.
 * - Excepcion tambien para fallos internos de React.
 *
 * Configuracion requerida: `theme` y `geometry` resueltos por los paquetes
 * anteriores; este paquete no valida el Modelo.
 */
export const paquete = 'render';
