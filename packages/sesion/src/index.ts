/**
 * `sesion`: estado compilado de un Workspace (Sesion en CONTEXT.md).
 * Interfaz: `abrirSesion(archivos, { tema? }) -> Sesion` (compilar, validar, layout, Estilo, `consultar` incluido `inspect tema`); escritura unica `aplicarAlWorkspace`, `diferenciar(antes, despues)` (Diferencia pura entre Fuentes), reductor `aplicarIntencion`, `Historial` y `workspaceEnMemoria` como `PuertoDeWorkspace`.
 * Invariantes: pura sobre `ArchivosDelWorkspace` (sin disco); una Sesion es inmutable; nunca importa codigo (ADR 0008).
 * Errores: los del Workspace son issues; las ediciones rechazadas traen `motivo`; los fallos de layout y de I/O del puerto se propagan.
 * Dependencias: `canonico`, `tema`, `dsl` y `layout`.
 */
export { abrirSesion, archivoDeVista } from './sesion';
export { hashDeContenido } from './ediciones';
export { claveDeElemento, diferenciaVacia, diferenciar } from './diferencia';
export type { ClaseDePropiedad, Diferencia, ElementoCambiado, ElementoDeDiferencia, PropiedadCambiada, TipoDeElementoDeDiferencia } from './diferencia';
export { aplicarAlWorkspace } from './aplicar';
export type { Aplicable, PuertoDeWorkspace, ResultadoDeAplicar } from './aplicar';
export { workspaceEnMemoria } from './puerto-en-memoria';
export type { ContenidoEnMemoria, WorkspaceEnMemoria } from './puerto-en-memoria';
export { aplicarIntencion, apilar, crearHistorial, deshacer, editarEnHistorial, rehacer } from './intenciones';
export type { Consulta, Respuesta } from './consultas';
export type { OpcionesDeConsultaDeTema } from './consulta-de-tema';
export type { Historial, Intencion, ResultadoDeIntencion, Visto } from './intenciones';
export type { IntencionDePin, IntencionDeTema, MotivoDeRechazo } from 'canonico';
export type { EdicionConHash, ResultadoDeEdicion } from './ediciones';
export type { InterfazDeComponente, OpcionesDeGeometria, OpcionesDeSesion, ResultadoDeConstruir, SalidaDeBuild, Sesion } from './sesion';
