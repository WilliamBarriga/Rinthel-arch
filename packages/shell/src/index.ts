/**
 * `shell`: capa interactiva sobre `render` (ADR 0003, 0008). `<VistaInteractiva>` anade pan/zoom, Seleccion, culling por viewport, colapso con relayout y morph, drill-down, Pasos y zoom semantico; `useEstadoEnHash` lleva ese estado al hash de URL; `adaptadorDeWorker`/`servirLayout` corren el layout en un Worker.
 * Invariantes: cada estado (camara, Seleccion, colapso, Vista, Paso) es controlado por props o interno; solo dibuja lo que devuelve `render`; un layout que llega tarde se descarta y se sigue mostrando el anterior.
 * Errores: una Vista inexistente, o faltar `view`, `path` y `defaultView`, lanza al renderizar; un rechazo del adaptador va a `onError` o, sin el, se lanza al renderizar.
 * Depende de `canonico`, `tema`, `layout`, `sesion` y `render` (d3-zoom); peer React 18 y 19.
 */
export { VistaInteractiva } from './vista-interactiva';
export type { AdaptadorDeLayout, MedidorDeTexto, VistaInteractivaProps } from './vista-interactiva';
export { SELECCION_VACIA, cajaDeElemento, elementoBajo, seleccionar } from './interaccion';
export type { ElementoSeleccionable, ModoDeSeleccion, OpcionesDeHitTest, Seleccion, TipoDeElemento } from './interaccion';
export type { PropsDeNavegacion } from './navegacion';
export type { PropsDePasos } from './pasos';
export type { AjustesDeInteraccion } from './configuracion';
export type { RelojDeCuadros } from './morph';
export { UMBRALES_POR_DEFECTO, nivelDeDetalle } from './zoom-semantico';
export type { UmbralesDeDetalle } from './zoom-semantico';
export type { Camara, NivelDeDetalle } from 'render';
export type { IconProvider } from 'canonico';
export { deserializarEstado, hashDelNavegador, serializarEstado, vistaPorDefecto } from './hash';
export type { AdaptadorDeHash, EstadoDeShell } from './hash';
export { useEstadoEnHash } from './estado-en-hash';
export type { OpcionesDeEstadoEnHash, PropsDeEstadoEnHash } from './estado-en-hash';
export type { AlReordenarLifelines } from './arrastre';
export type { IntencionDePin } from 'canonico';
export type { Historial, Intencion } from 'sesion';
export { adaptadorDeWorker } from './layout-en-worker';
export { servirLayout } from './servir-layout';
export { hashesDeFamilias, medirEnVisor } from './medicion-de-visor';
export type { OpcionesDeMedicion } from './medicion-de-visor';
export type { PuertoDeMensajes } from './layout-en-worker';
