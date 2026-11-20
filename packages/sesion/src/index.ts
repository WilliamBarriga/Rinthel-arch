/**
 * `sesion`: estado compilado de un Workspace (Sesion en CONTEXT.md).
 * Interfaz: `abrirSesion(archivos, { tema? }) -> Sesion` (compilar, validar, layout, Estilo, `consultar` incluido `inspect tema`); escritura unica `aplicarAlWorkspace`, `diferenciar(antes, despues)` (Diferencia pura entre Fuentes), reductor `aplicarIntencion`, `Historial`, `HistorialDeArchivos` (el Historial de archivos de `dev`) y `workspaceEnMemoria` como `PuertoDeWorkspace`.
 * Workspace vivo (el estado de `dev` sin transporte, dueno de la secuencia de eventos: `conexion` y `escuchar`): `abrirWorkspaceVivo` sobre un `PuertoDelWorkspaceVivo` con reloj y hora
 * inyectados, `atenderApiDeDev` (las rutas `/api/*` como peticion -> estado HTTP y cuerpo) y `puertoEnMemoria` (fake del puerto).
 * Invariantes: pura sobre `ArchivosDelWorkspace` (sin disco); una Sesion es inmutable; nunca importa codigo (ADR 0008).
 * Errores: los del Workspace son issues; las ediciones rechazadas traen `motivo`; los fallos de layout y de I/O del puerto se propagan.
 * Dependencias: `canonico`, `tema`, `dsl` y `layout`.
 */
export { abrirSesion, archivoDeVista } from './sesion';
export { hashDeContenido } from './ediciones';
export { diferenciar } from './diferencia';
export { clasificarCambio } from './cambio';
export type { InstanteDeDev } from './cambio';
export { abrirWorkspaceVivo, DEBOUNCE_MS, EVENTOS_PREVIOS, VERSIONES_GUARDADAS } from './workspace-vivo';
export type { CodigoCompilado, CodigoDelWorkspace, EdicionesDeTexto, OpcionesDelWorkspaceVivo, PuertoDelWorkspaceVivo, RegistroDeActividad, Reloj, ResultadoDelWorkspaceVivo, WorkspaceVivo } from './workspace-vivo';
export { atenderApiDeDev, consultaDeRuta, pedidoDeEdicion } from './api-de-dev';
export type { PeticionDeDev, RespuestaDeDev } from './api-de-dev';
export { puertoEnMemoria } from './puerto-vivo-en-memoria';
export type { ContenidoVivoEnMemoria, WorkspaceVivoEnMemoria } from './puerto-vivo-en-memoria';
export { aplicarAlWorkspace } from './aplicar';
export type { Aplicable, EdicionDeTexto, OpcionesDeAplicar, PuertoDeWorkspace, ResultadoDeAplicar } from './aplicar';
export { workspaceEnMemoria } from './puerto-en-memoria';
export type { ContenidoEnMemoria, WorkspaceEnMemoria } from './puerto-en-memoria';
export { descripcionDeIntencion, descripcionDeTexto, deshacerSobre, historialVacio, historialVisible, registrar, rehacerSobre, saltar } from './historial-de-archivos';
export type { CambioDeArchivo, EntradaDelHistorial, HistorialDeArchivos, ResultadoDeRestaurar } from './historial-de-archivos';
export { aplicarIntencion, apilar, crearHistorial, deshacer, editarEnHistorial, rehacer } from './intenciones';
export type { Consulta, Respuesta } from './consultas';
export type { OpcionesDeConsultaDeTema } from './consulta-de-tema';
export type { Historial, Intencion, ResultadoDeIntencion, Visto } from './intenciones';
export type { EdicionConHash, ResultadoDeEdicion } from './ediciones';
export type { InterfazDeComponente, OpcionesDeGeometria, OpcionesDeSesion, ResultadoDeConstruir, SalidaDeBuild, Sesion } from './sesion';
