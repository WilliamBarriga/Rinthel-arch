/**
 * `shell` — capa interactiva sobre `render` (pan/zoom, colapso, drill-down).
 *
 * Interfaz publica. Todo lo que no sale de este archivo (ni de `exports` del
 * `package.json`) es privado y puede cambiar sin avisar.
 *
 * Hoy:
 * - `paquete`: identidad del paquete, observable por cualquier consumidor.
 *
 * Previsto (spec #19, aun sin implementar): componente `VistaInteractiva`
 * (props: Fuente canonica, Vista inicial, Tema, adaptador de layout) y un
 * estado serializable al hash de URL (Vista activa, Grupos abiertos, Nodo
 * seleccionado, breadcrumbs, Paso, viewport).
 *
 * Invariantes:
 * - El estado del hash entra siempre como props al nucleo; este paquete no
 *   guarda verdad propia ni toca el Modelo.
 * - Pan/zoom (d3-zoom) y relayout en Web Worker son adaptadores del borde: se
 *   inyectan como argumento y no se usan en el build ni en la CLI.
 * - Solo dibuja lo que `render` devuelve; React es peer `^18 || ^19`.
 * - Importa solo paquetes anteriores en la cadena
 *   `canonico -> dsl -> layout -> render -> shell / cli`, por nombre de paquete
 *   y unicamente por lo que declara `exports` de ese paquete. Nunca importa de
 *   `cli`.
 *
 * Modos de error:
 * - Estado de hash ilegible: se degrada al valor por defecto y se ignora.
 * - Fallos de uso (props incompletas) y fallos internos: excepcion.
 *
 * Configuracion requerida: Fuente canonica, Vista inicial, Tema y adaptador de
 * layout.
 */
export const paquete = 'shell';
