/**
 * `canonico` — esquema, validacion y resolucion de la Fuente canonica.
 *
 * Interfaz publica. Todo lo que no sale de este archivo (ni de `exports` del
 * `package.json`) es privado y puede cambiar sin avisar.
 *
 * Hoy:
 * - `paquete`: identidad del paquete, observable por cualquier consumidor.
 *
 * Previsto (spec #19, aun sin implementar): esquema Zod de la Fuente canonica,
 * `validate(canonico) -> issues`,
 * `resolveView(canonico, vistaId, estadoExpandido?) -> VistaResuelta` y
 * `revealAt(vistaResuelta, posicion) -> visibility(id)`.
 *
 * Invariantes:
 * - Nucleo puro: sin I/O, sin reloj, sin estado global. Las dependencias entran
 *   como argumento y las funciones devuelven resultados, no mutan.
 * - Los problemas de validacion y de compilacion son datos: lista de `issues`
 *   con `code` estable, `severity`, `file`, `line` y `column`, en orden
 *   determinista (archivo, linea, columna, codigo).
 * - Solo importa paquetes anteriores en la cadena
 *   `canonico -> dsl -> layout -> render -> shell / cli`, por nombre de paquete
 *   y unicamente por lo que declara `exports` de ese paquete.
 *
 * Modos de error:
 * - Invalidacion del dominio: se devuelve como `issues`; nunca lanza.
 * - Excepcion solo para fallos de uso (argumento fuera del contrato) o fallos
 *   internos.
 *
 * Configuracion requerida: ninguna.
 */
export const paquete = 'canonico';
