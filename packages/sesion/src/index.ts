/**
 * `sesion`: estado compilado de un Workspace (Sesion en CONTEXT.md).
 * Interfaz: `abrirSesion(archivos, { tema? }) -> Sesion` (compilar, validar, layout, Estilo, `consultar`); escritura unica `aplicarAlWorkspace`, reductor `aplicarIntencion`, `Historial`, `HistorialDeArchivos` (el de `dev`, por archivo) y `workspaceEnMemoria` como `PuertoDeWorkspace`.
 * Invariantes: pura sobre `ArchivosDelWorkspace` (sin disco); una Sesion es inmutable; nunca importa codigo (ADR 0008).
 * Errores: los del Workspace son issues; las ediciones rechazadas traen `motivo`; los fallos de layout y de I/O del puerto se propagan.
 * Dependencias: `canonico`, `tema`, `dsl` y `layout`.
 */
export { abrirSesion, archivoDeVista } from './sesion';
export { hashDeContenido } from './ediciones';
export { aplicarAlWorkspace } from './aplicar';
export type { Aplicable, EdicionDeTexto, OpcionesDeAplicar, PuertoDeWorkspace, ResultadoDeAplicar } from './aplicar';
export { workspaceEnMemoria } from './puerto-en-memoria';
export type { ContenidoEnMemoria, WorkspaceEnMemoria } from './puerto-en-memoria';
export { deshacerSobre, historialVacio, registrar, rehacerSobre } from './historial-de-archivos';
export type { CambioDeArchivo, EntradaDelHistorial, HistorialDeArchivos, ResultadoDeRestaurar } from './historial-de-archivos';
export { aplicarIntencion, apilar, crearHistorial, deshacer, editarEnHistorial, rehacer } from './intenciones';
export type { Consulta, Respuesta } from './consultas';
export type { Historial, Intencion, ResultadoDeIntencion, Visto } from './intenciones';
export type { IntencionDePin, MotivoDeRechazo } from 'canonico';
export type { EdicionConHash, ResultadoDeEdicion } from './ediciones';
export type { InterfazDeComponente, OpcionesDeSesion, ResultadoDeConstruir, SalidaDeBuild, Sesion } from './sesion';
