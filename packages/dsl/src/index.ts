/**
 * `dsl` — compila DSL de texto a Fuente canonica y fusiona el Workspace (ADR 0001).
 *
 * Invariantes: compilacion unidireccional (DSL -> canonico); fusion multiarchivo determinista.
 * Modos de error: nunca lanza; `compile` devuelve todos los issues con posicion y codigo estable.
 * Dependencias: `canonical` y `tema` (los Temas se validan contra su catalogo). No lee disco.
 */
export { compile } from './compilar';
export type { ArchivosDelWorkspace, PosicionDePin, ResultadoDeCompilacion } from './compilar';
export type { OrigenDeTema } from './temas';
