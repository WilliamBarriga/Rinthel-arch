/**
 * `sesion` — estado compilado de un Workspace (termino Sesion en CONTEXT.md).
 *
 * Interfaz: `abrirSesion(archivos, { tema? }) -> Sesion`, con `fuente`,
 * `diagnosticar()`, `construir()`, `geometria(vista)` y `actualizar(archivos)`.
 * Es la unica tuberia compilar, validar y calcular layout: la comparten `cli`,
 * `dev` e `inspect`.
 *
 * Invariantes: pura sobre `ArchivosDelWorkspace` (sin disco ni observadores; eso
 * son adaptadores de `cli`). Una Sesion es inmutable: `actualizar` devuelve otra
 * y no toca la anterior. La geometria es perezosa y memoizada por Vista;
 * `diagnosticar` solo paga layout en Vistas con 2 o mas Pins (el solape se
 * conoce tras ELK). `actualizar` reutiliza la geometria de una Vista cuando su
 * `layoutKey`, su Tema y sus Pins no cambian. Sin compilacion incremental: cada
 * Sesion compila todo el Workspace.
 * Modos de error: los errores del Workspace son issues, no excepciones; los
 * fallos internos de layout se propagan como rechazo de la promesa.
 * Configuracion requerida: ninguna; `tema` (opcional) es el Tema global.
 * Solo importa paquetes anteriores en la cadena `canonico -> dsl -> layout -> sesion`.
 */
export { abrirSesion } from './sesion';
export type { OpcionesDeSesion, ResultadoDeConstruir, SalidaDeBuild, Sesion } from './sesion';
