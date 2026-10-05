/**
 * `dsl` — compila DSL de texto a Fuente canonica y fusiona el Workspace.
 *
 * Invariantes: compilacion unidireccional (DSL -> canonico); fusion
 * multiarchivo determinista; `compile` devuelve todos los issues con posicion.
 * Modos de error: errores de sintaxis/fusion/negocio como lista de issues,
 * nunca excepcion. Configuracion requerida: ninguna. Solo importa paquetes
 * anteriores en la cadena `canonico -> dsl`.
 */
export const paquete = 'dsl';

export { compile } from './compilar';
export type { ArchivosDelWorkspace, PosicionDePin, ResultadoDeCompilacion } from './compilar';
