/**
 * `canonico` — esquema, validacion y resolucion de la Fuente canonica.
 *
 * Invariantes: ids cualificados (`a.b.c`) definen jerarquia del Modelo (sin
 * hijos huerfanos); extremos de Arista siempre existentes, y `nodo#atributo`
 * solo con un Atributo declarado en ese Nodo (distinto de un Nodo hijo);
 * `type` siempre declarado en `specification.nodeTypes`;
 * una Vista (`views`) tiene `type` architecture|flow y solo selecciona Nodos
 * (`resolveView`, que devuelve `undefined` si la Vista no existe), nunca define
 * entidades; sus `overrides` (label, pin, order, color) son solo presentacion (`pin` es relativo al
 * Grupo padre; `order` solo se almacena, sin efecto en v1: ADR 0003 prohibe `considerModelOrder`); un Grupo
 * colapsado (estado, `depth`, `collapsed`/`expanded`, `link`) eleva y fusiona las
 * Aristas de sus hijos; los `steps` de una Vista los interpreta `revealAt` (ADR 0002,
 * acumulativos, con fundido entre pasos); `IconProvider` resuelve claves de icono a SVG inline (`serializarIconos`/`hidratarIconos` lo llevan al navegador y de vuelta; `sanearIcono` filtra por lista blanca los SVG externos);
 * colores son nombres de Paleta, nunca valores hex (ADR 0002); el Tema (`themes`,
 * siempre con el neutro) es un objeto plano ya resuelto, sin herencia;
 * `contratoDeTemaSchema` declara lo que el dibujo exige de el (tokens `background`,
 * `foreground`, `border`; fuentes `body`, `mono`; `fontSize` en px si existe).
 * La geometria cacheada por Vista (`geometriaCacheadaSchema`: `{ view, theme, layoutKey,
 * geometry }`) tiene aqui su esquema para validarla al leerla del disco; la calcula `layout`.
 * Modos de error: validacion devuelve `issues` (datos), nunca lanza;
 * excepcion solo para fallos de uso o internos.
 * `validate(fuente, { iconos?, ubicar? })` devuelve los issues semanticos de una
 * Fuente ya armada (tipo de nodo, Aristas colgantes, Atributos, iconos, colores
 * de Paleta, Temas de Vista, overrides, drill-down y Pasos), ordenados. La Fuente
 * no guarda posiciones: `ubicar(ruta)` las aporta (ver `validar.ts`) y sin el los
 * issues salen en `(canonico):1:1` sin `fix`. No cubre sintaxis ni fusion (las
 * detecta `dsl`) ni `W_OVERLAPPING_PINS` (necesita la geometria; lo emite el CLI).
 * `candidatosCercanos(escrito, existentes)` es la ayuda de typos para `hint`/`fix`.
 * El Gesto de editar un Pin (ADR 0005) tiene aqui su vocabulario: `IntencionDePin`
 * (el cuerpo de `POST /api/pin`, validado por `intencionDePinSchema`) y
 * `MotivoDeRechazo` (`MOTIVOS_DE_RECHAZO`), del que deriva el enum `reason` de
 * `salidaDeEditSchema`; se declaran una sola vez y `sesion` los reexporta.
 * Configuracion requerida: ninguna. Solo importa paquetes anteriores en la
 * cadena `canonico -> dsl -> layout -> render -> shell / cli`.
 */
export {
  fuenteCanonicaSchema,
  idDeNodoSchema,
  nodoSchema,
  overrideSchema,
  pasoSchema,
  TEMA_NEUTRO,
  temaSchema,
  contratoDeTemaSchema,
  TIPOS_DE_VISTA,
  tamanoDeTexto,
  tipoDeNodoSchema,
  vistaSchema,
} from './esquema';
export { geometriaCacheadaSchema, geometriaSchema } from './geometria';
export type { GeometriaCacheada } from './geometria';
export { combineIconProviders, genericIcons, hidratarIconos, resolveNodeTypeIcon, sanearIcono, serializarIconos, workspaceIcons } from './iconos';
export type { IconProvider } from './iconos';
export { idDeArista, revealAt } from './pasos';
export type { Visibilidad } from './pasos';
export { candidatosCercanos } from './sugerencias';
export { validate } from './validar';
export type { OpcionesDeValidate, RutaDeFuente, SitioDeTexto, Ubicador } from './validar';
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

export { CODIGOS, CODIGOS_DEPRECADOS, DESCRIPCION_DE_CODIGO } from './codigos';
export type { Codigo } from './codigos';

export { EDIT_CONTRACT_VERSION, edicionDeTextoSchema, edicionesPedidasSchema, salidaDeEditJsonSchema, salidaDeEditSchema } from './edit';
export type { SalidaDeEdit } from './edit';

export { INSPECT_CONTRACT_VERSION, salidaDeInspectJsonSchema, salidaDeInspectSchema } from './inspect';
export type { SalidaDeInspect } from './inspect';

export { MOTIVOS_DE_RECHAZO, intencionDePinSchema } from './pin';
export type { IntencionDePin, MotivoDeRechazo } from './pin';

export { CONTRACT_VERSION, issueSchema, salidaDeValidateJsonSchema, salidaDeValidateSchema } from './salida';
export type { SalidaDeValidate } from './salida';
