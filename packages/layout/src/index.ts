/**
 * `layout` — `layoutView` calcula la `Geometria` de una Vista (ELK para grafos, algoritmo propio para secuencia),
 * con cajas relativas al Grupo padre; `claveDeLayout`/`claveDeEstructura` dicen cuando relayoutar y
 * `aplicarPinsAGeometria` aplica los Pins sin ELK; `indiceDeGeometria` da cajas absolutas, padres y raices (ADR 0003).
 * Invariantes: determinista; sin DOM; corre en Node y en Web Worker; `render` debe recibir las mismas Metricas.
 * Modos de error: los fallos de ELK rechazan la promesa. Dependencias: `canonico` y `tema`; `opciones.elk` inyecta el motor.
 */
export { aplicarPinsAGeometria, claveDeEstructura, claveDeLayout, layoutConMetricas, layoutView } from './layout';
export { indiceDeGeometria } from './indice';
export type { IndiceDeGeometria } from './indice';
export type { OpcionesDeLayout } from './layout';
