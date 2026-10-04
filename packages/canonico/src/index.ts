/** `canonico` — esquema, validacion y resolucion de la Fuente canonica. Interfaz publica; lo que no sale por `exports` es privado. */
export const paquete = 'canonico';

export { fuenteCanonicaSchema, idDeNodoSchema, nodoSchema, tipoDeNodoSchema } from './esquema';
export type {
  CatalogoDeTiposDeNodo,
  FuenteCanonica,
  Modelo,
  Nodo,
  TipoDeNodo,
} from './esquema';

export type { Issue, IssueFix, IssueRelated, Severity, TextPosition, TextRange } from './issue';

export { CODIGOS, CODIGOS_DEPRECADOS } from './codigos';
export type { Codigo } from './codigos';
