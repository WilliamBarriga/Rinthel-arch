/**
 * `sesion` — estado compilado de un Workspace (termino Sesion en CONTEXT.md).
 *
 * Interfaz: `abrirSesion(archivos, { tema? }) -> Sesion` (compilar, validar, layout y Estilo), edicion
 * estructurada (`aplicarEdiciones`, `editarPin`), Intenciones con `Historial` y `aplicarAlWorkspace`.
 * Invariantes: pura sobre `ArchivosDelWorkspace` (sin disco); una Sesion es inmutable; nunca importa codigo (ADR 0008).
 * Modos de error: los errores del Workspace son issues; las ediciones rechazadas traen `motivo`; los fallos de layout y de I/O del puerto se propagan.
 * Detalle por funcion: TSDoc de cada export. Importa solo `canonico`, `tema`, `dsl` y `layout`.
 */
export { abrirSesion, archivoDeVista } from './sesion';
export { aplicarEdiciones, editarPin, hashDeContenido } from './ediciones';
export { aplicarAlWorkspace, cambiosDeEdicion } from './aplicar';
export type { PuertoDeWorkspace, ResultadoDeAplicar } from './aplicar';
export { aplicarIntencion, apilar, crearHistorial, deshacer, editarEnHistorial, rehacer } from './intenciones';
export type { Historial, Intencion, ResultadoDeIntencion } from './intenciones';
// Vocabulario del Gesto: se declara en `canonico` y se reexporta aqui.
export type { IntencionDePin, MotivoDeRechazo } from 'canonico';
export type { EdicionConHash, ResultadoDeEdicion } from './ediciones';
export type { InterfazDeComponente, OpcionesDeSesion, ResultadoDeConstruir, SalidaDeBuild, Sesion } from './sesion';
