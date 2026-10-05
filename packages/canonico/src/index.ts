/**
 * `canonico` — esquema, validacion y resolucion de la Fuente canonica.
 *
 * Invariantes: ids cualificados (`a.b.c`) definen jerarquia del Modelo (sin
 * hijos huerfanos); extremos de Arista siempre existentes, y `nodo#atributo`
 * solo con un Atributo declarado en ese Nodo (distinto de un Nodo hijo);
 * `type` siempre declarado en `specification.nodeTypes`;
 * colores son nombres de Paleta, nunca valores hex (ADR 0006).
 * Modos de error: validacion devuelve `issues` (datos), nunca lanza;
 * excepcion solo para fallos de uso o internos.
 * Configuracion requerida: ninguna. Solo importa paquetes anteriores en la
 * cadena `canonico -> dsl -> layout -> render -> shell / cli`.
 */
export const paquete = 'canonico';

export {
  fuenteCanonicaSchema,
  idDeNodoSchema,
  nodoSchema,
  tipoDeNodoSchema,
} from './esquema';
export type {
  Arista,
  Atributo,
  CatalogoDeTiposDeNodo,
  Extremo,
  FuenteCanonica,
  Modelo,
  Nodo,
  ReferenciaOpaca,
  TipoDeNodo,
} from './esquema';

export type { Issue, IssueFix, IssueRelated, Severity, TextPosition, TextRange } from './issue';

export { CODIGOS, CODIGOS_DEPRECADOS } from './codigos';
export type { Codigo } from './codigos';

export { CONTRACT_VERSION, issueSchema, salidaDeValidateSchema } from './salida';
export type { SalidaDeValidate } from './salida';
