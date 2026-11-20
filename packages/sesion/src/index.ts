/**
 * `sesion`: estado compilado de un Workspace (Sesion en CONTEXT.md).
 * Interfaz: `abrirSesion(archivos, { tema? }) -> Sesion` (compilar, validar, layout, Estilo, `consultar` incluido `inspect tema`); escritura unica `aplicarAlWorkspace`, `diferenciar(antes, despues)` (Diferencia pura entre Fuentes), `hashDeContenido` y el `Historial` de Intenciones (`crearHistorial`, `editarEnHistorial`, `deshacer`, `rehacer`).
 * Workspace vivo (el estado de `dev` sin transporte, dueno de la secuencia de eventos: `conexion` y `escuchar`; compone el Historial de archivos y el Registro de actividad vivo): `abrirWorkspaceVivo` sobre un `PuertoDelWorkspaceVivo` con reloj y hora
 * inyectados, `atenderApiDeDev` (las rutas `/api/*` como peticion -> respuesta completa) y `puertoEnMemoria` (fake del puerto).
 * Solo se exporta lo que usa otro paquete; lo demas es interno.
 * Invariantes: pura sobre `ArchivosDelWorkspace` (sin disco); una Sesion es inmutable; nunca importa codigo (ADR 0008).
 * Errores: los del Workspace son issues; las ediciones rechazadas traen `motivo`; los fallos de layout y de I/O del puerto se propagan.
 * Dependencias: `canonico`, `tema`, `dsl` y `layout`.
 */
export { abrirSesion } from './sesion';
export type { InterfazDeComponente, Sesion } from './sesion';
export { hashDeContenido } from './ediciones';
export { diferenciar } from './diferencia';
export { aplicarAlWorkspace } from './aplicar';
export type { Aplicable } from './aplicar';
export { crearHistorial, deshacer, editarEnHistorial, rehacer } from './intenciones';
export type { Historial, Intencion } from './intenciones';
export type { Respuesta } from './consultas';
export { abrirWorkspaceVivo } from './workspace-vivo';
export type { CodigoCompilado, PuertoDelWorkspaceVivo, WorkspaceVivo } from './workspace-vivo';
export type { RegistroDeActividad } from './registro-de-actividad-vivo';
export type { Reloj } from './reloj';
export { atenderApiDeDev } from './api-de-dev';
export { puertoEnMemoria } from './puerto-vivo-en-memoria';
export type { WorkspaceEnMemoria } from './puerto-en-memoria';
