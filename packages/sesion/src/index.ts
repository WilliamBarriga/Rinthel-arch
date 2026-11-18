/**
 * `sesion` — estado compilado de un Workspace (termino Sesion en CONTEXT.md).
 *
 * Interfaz: `abrirSesion(archivos, { tema? }) -> Sesion` (compilar, validar, layout, Estilo y `consultar` de solo lectura)
 * y la edicion: la puerta de escritura unica `aplicarAlWorkspace` (Intencion o ediciones con hash), el reductor
 * puro `aplicarIntencion` y el `Historial`. `PuertoDeWorkspace` tiene un adaptador en memoria (`workspaceEnMemoria`);
 * el de disco vive en `cli`. Los Gestos y la aplicacion de ediciones sueltas son internos.
 * Invariantes: pura sobre `ArchivosDelWorkspace` (sin disco); una Sesion es inmutable; nunca importa codigo (ADR 0008).
 * Modos de error: los errores del Workspace son issues; las ediciones rechazadas traen `motivo`; los fallos de layout y de I/O del puerto se propagan.
 * Detalle por funcion: TSDoc de cada export. Importa solo `canonico`, `tema`, `dsl` y `layout`.
 */
export { abrirSesion, archivoDeVista } from './sesion';
export { hashDeContenido } from './ediciones';
export { aplicarAlWorkspace } from './aplicar';
export type { Aplicable, PuertoDeWorkspace, ResultadoDeAplicar } from './aplicar';
export { workspaceEnMemoria } from './puerto-en-memoria';
export type { ContenidoEnMemoria, WorkspaceEnMemoria } from './puerto-en-memoria';
export { aplicarIntencion, apilar, crearHistorial, deshacer, editarEnHistorial, rehacer } from './intenciones';
export type { Consulta, Respuesta } from './consultas';
export type { Historial, Intencion, ResultadoDeIntencion, Visto } from './intenciones';
// Vocabulario del Gesto: se declara en `canonico` y se reexporta aqui.
export type { IntencionDePin, MotivoDeRechazo } from 'canonico';
export type { EdicionConHash, ResultadoDeEdicion } from './ediciones';
export type { InterfazDeComponente, OpcionesDeSesion, ResultadoDeConstruir, SalidaDeBuild, Sesion } from './sesion';
