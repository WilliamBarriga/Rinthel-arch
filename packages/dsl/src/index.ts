/**
 * `dsl` — compila el DSL de texto a Fuente canonica y fusiona el Workspace.
 *
 * Interfaz publica. Todo lo que no sale de este archivo (ni de `exports` del
 * `package.json`) es privado y puede cambiar sin avisar.
 *
 * Hoy:
 * - `paquete`: identidad del paquete, observable por cualquier consumidor.
 *
 * Previsto (spec #19, aun sin implementar):
 * `compile(workspace) -> { canonico?, issues }`, donde `workspace` es un mapa
 * ruta -> texto: el paquete no lee disco ni hace I/O.
 *
 * Invariantes:
 * - Compila en un solo sentido: DSL de texto -> Fuente canonica; nada se edita
 *   ni versiona aqui, eso es trabajo del autor del Workspace.
 * - `compile` devuelve siempre todos los issues (sintaxis y fusion), con
 *   posicion (archivo, linea, columna); `canonico` solo si no hay errores.
 * - Fusion multiarchivo determinista: el mismo mapa de archivos produce la
 *   misma Fuente canonica.
 * - Solo importa paquetes anteriores en la cadena
 *   `canonico -> dsl -> layout -> render -> shell / cli`, por nombre de paquete
 *   y unicamente por lo que declara `exports` de ese paquete.
 *
 * Modos de error:
 * - Errores de sintaxis, de fusion y de negocio: lista de `issues` (datos),
 *   nunca excepcion.
 * - Excepcion solo para fallos de uso (argumento fuera del contrato) o fallos
 *   internos.
 *
 * Configuracion requerida: ninguna. El disco y la red quedan en adaptadores de
 * los paquetes del borde (`cli`), nunca aqui.
 */
export const paquete = 'dsl';
