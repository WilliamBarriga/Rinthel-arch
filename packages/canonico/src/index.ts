/**
 * `canonico` — esquema, validacion y resolucion de la Fuente canonica.
 *
 * Invariantes: ids cualificados (`a.b.c`) definen jerarquia del Modelo (sin
 * hijos huerfanos); extremos de Arista siempre existentes, y `nodo#atributo`
 * solo con un Atributo declarado en ese Nodo (distinto de un Nodo hijo);
 * `type` siempre declarado en `specification.nodeTypes`;
 * una Vista (`views`) tiene `type` architecture|flow y solo selecciona Nodos
 * (`resolveView`, que devuelve `undefined` si la Vista no existe), nunca define
 * entidades; sus `overrides` (label, pin, order, color) son solo presentacion; un Grupo
 * colapsado (estado, `depth`, `collapsed`/`expanded`, `link`) eleva y fusiona las
 * Aristas de sus hijos; los `steps` de una Vista los interpreta `revealAt` (ADR 0007,
 * acumulativos, con fundido entre pasos); `IconProvider` resuelve claves de icono a SVG inline;
 * colores son nombres de Paleta, nunca valores hex (ADR 0006); el Tema (`themes`,
 * siempre con el neutro) es un objeto plano ya resuelto, sin herencia.
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
  overrideSchema,
  pasoSchema,
  TEMA_NEUTRO,
  temaSchema,
  TIPOS_DE_VISTA,
  tipoDeNodoSchema,
  vistaSchema,
} from './esquema';
export { combineIconProviders, genericIcons, resolveNodeTypeIcon, workspaceIcons } from './iconos';
export type { IconProvider } from './iconos';
export { idDeArista, revealAt } from './pasos';
export type { Visibilidad } from './pasos';
export { matchesSelector, resolveView } from './vistas';
export type { AristaResuelta, EstadoDeColapso, NodoResuelto, VistaResuelta } from './vistas';
export type {
  AristaDePaso,
  Arista,
  Atributo,
  CatalogoDeTiposDeNodo,
  ElementoDePaso,
  Extremo,
  FuenteCanonica,
  Modelo,
  Nodo,
  OverrideDeNodo,
  Paso,
  ReferenciaOpaca,
  Tema,
  TipoDeNodo,
  Vista,
} from './esquema';

export type { Issue, IssueFix, IssueRelated, Severity, TextPosition, TextRange } from './issue';

export { CODIGOS, CODIGOS_DEPRECADOS } from './codigos';
export type { Codigo } from './codigos';

export { CONTRACT_VERSION, issueSchema, salidaDeValidateSchema } from './salida';
export type { SalidaDeValidate } from './salida';
