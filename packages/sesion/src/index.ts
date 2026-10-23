/**
 * `sesion` — estado compilado de un Workspace (termino Sesion en CONTEXT.md).
 *
 * Interfaz: `abrirSesion(archivos, { tema? }) -> Sesion`, con `fuente`,
 * `diagnosticar()`, `construir()`, `geometria(vista)`, `estilo(vista)` (Estilo resuelto
 * del Tema de la Vista: Metricas y pintura) y `actualizar(archivos)`.
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
 *
 * Intenciones (ADR 0007): `Intencion` es la union discriminada por `tipo` (hoy `mover-pin`);
 * `aplicarIntencion(archivos, intencion)` es el reductor puro (reutiliza `editarPin`);
 * `Historial` (`crearHistorial`, `editarEnHistorial`, `deshacer`, `rehacer`) es la pila
 * inmutable de deshacer/rehacer sobre el texto: deshacer restaura el DSL exactamente.
 * `apilar(historial, archivos)` registra `archivos` como el nuevo texto vigente cuando el llamador
 * ya lo escribio por su cuenta (el anterior pasa al pasado y el futuro se descarta); es pura y
 * no comprueba que `archivos` difiera del vigente: evitar entradas repetidas es del llamador.
 *
 * `aplicarAlWorkspace(puerto, intencion)` aplica una Intencion al Workspace en disco a traves
 * del puerto `PuertoDeWorkspace` (`leer` -> `{ disco, propios }`, `escribir(ruta, texto)`):
 * reduce, y escribe solo los archivos propios que cambian (todo o nada; un archivo de
 * `--theme-path` se rechaza como `archivo-desconocido`). Los fallos de I/O del puerto se propagan.
 *
 * `origenesDeTema` da, por Tema declarado, la cadena `extends`, las `part` usadas y el sitio de la ultima
 * escritura de cada Capa (base, por Tipo y por estado); lo consume `inspect tema`.
 *
 * `archivoDeVista(sesion, vista)` da el archivo que declara una Vista (el de su hash).
 *
 * Edicion estructurada (ADR 0005): `aplicarEdiciones(archivos, ediciones)` aplica
 * `{ file, range, replacement, hash }` sobre el mapa sin tocar disco, todo o nada
 * (hash viejo, rango invalido, solape o errores nuevos la rechazan con un
 * `motivo`); `editarPin(archivos, { vista, nodo, x, y, hash })` es el Gesto de mover
 * un Pin: fusiona calcular la edicion minima, auto-probarla una vez y aplicar en
 * memoria (devuelve archivos, ediciones e issues); `hashDeContenido(texto)`
 * produce el hash esperado. La intencion de Pin se consume solo via `editarPin`;
 * `aplicarEdiciones` es la entrada de las ediciones ya calculadas (`--edits`,
 * `fix` de `validate`). El vocabulario del Gesto (`IntencionDePin`,
 * `MotivoDeRechazo`) se declara una sola vez en
 * `canonico` y se reexporta aqui para los consumidores. Solo importa paquetes
 * anteriores en la cadena `canonico -> tema -> dsl -> layout -> sesion`.
 */
export { abrirSesion, archivoDeVista } from './sesion';
export { aplicarEdiciones, editarPin, hashDeContenido } from './ediciones';
// Vocabulario del Gesto declarado una sola vez en `canonico`; se reexporta para no romper consumidores.
export { aplicarAlWorkspace, cambiosDeEdicion } from './aplicar';
export type { PuertoDeWorkspace, ResultadoDeAplicar } from './aplicar';
export { aplicarIntencion, apilar, crearHistorial, deshacer, editarEnHistorial, rehacer } from './intenciones';
export type { Historial, Intencion, ResultadoDeIntencion } from './intenciones';
export type { IntencionDePin, MotivoDeRechazo } from 'canonico';
export type { EdicionConHash, ResultadoDeEdicion } from './ediciones';
export type { OpcionesDeSesion, ResultadoDeConstruir, SalidaDeBuild, Sesion } from './sesion';
