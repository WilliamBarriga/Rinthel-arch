/**
 * `render`: `<Diagram>` dibuja una Vista resuelta y su Geometria como arbol React; `resolverEstilo` deriva el Estilo
 * del Tema (ADR 0002, 0008).
 * Invariantes: sin estado ni efectos; marcado determinista byte a byte; colores solo de la Paleta del Tema; lo animado
 * nunca provoca relayout; el codigo del Workspace entra solo por la prop `componentes`.
 * Errores: lanza si un Nodo de la Vista no esta en la Geometria, si la Geometria es de otro Tipo de diagrama o si el
 * Tema no cumple `resolverTema`. Depende de `canonical`, `tema` y `layout`; peer React 18 y 19.
 */
export { Diagram } from './diagram';
export type { ComponenteDeTema, ComponentesDeTema, PropsDeCodigo } from './codigo';
export type { DiagramProps } from './diagram';
export type { Camara, Estados, NivelDeDetalle } from './escena';
export { resolverEstilo } from './estilo';
export { hojaDeFuentes } from './hoja';
export { PINTORES } from './hoja';
export { centroDeEtiquetaSinCaja } from './pintores';
export type { AspectoDeEstado, EstadoVisual, Estilo } from './estilo';
