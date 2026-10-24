/**
 * `dsl` — compila DSL de texto a Fuente canonica y fusiona el Workspace.
 *
 * Invariantes: compilacion unidireccional (DSL -> canonico); fusion
 * multiarchivo determinista; `compile` devuelve todos los issues con posicion.
 * Modos de error: errores de sintaxis/fusion/negocio como lista de issues,
 * nunca excepcion. Configuracion requerida: ninguna. Solo importa paquetes
 * anteriores en la cadena `canonico -> tema -> dsl`.
 *
 * Temas: el bloque `theme` (palette, fonts, tokens y `node { layer ... slots { ... } }`)
 * lo compila `temas.ts`, un modulo propio, validando cada Capa y Slot contra el
 * catalogo de `tema` (todos los errores a la vez, con codigo estable). `nodeStyles` y
 * `edgeStyles` ya no existen: son error de sintaxis.
 */
export { compile } from './compilar';
export type { ArchivosDelWorkspace, PosicionDePin, ResultadoDeCompilacion } from './compilar';
export type { OrigenDeTema } from './temas';
