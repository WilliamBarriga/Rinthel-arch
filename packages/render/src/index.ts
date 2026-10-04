/**
 * `render` — dibuja una Vista como SVG con React puro.
 *
 * Invariantes: componente puro (sin reloj, sin estado propio); determinista
 * byte a byte; grupos colapsados no dibujan hijos; `link` no se expande.
 * Modos de error: props ausentes/inconsistentes lanzan excepcion de uso;
 * fallos internos de React se propagan. Configuracion requerida:
 * `theme` y `geometry` resueltos por paquetes anteriores.
 * Solo importa paquetes anteriores en la cadena `canonico -> dsl -> layout -> render`.
 */
export const paquete = 'render';
