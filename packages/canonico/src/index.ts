/**
 * `canonico`: esquemas Zod y tipos de la Fuente canonica, la Geometria cacheada, las Intenciones de edicion, las
 * salidas JSON del CLI, el Evento de actividad y el protocolo de `dev`, del que es el unico dueno (rutas, eventos SSE, estado, Diferencia, Historial de archivos); `validate`, `resolveView`, `revealAt` e iconos (ADR 0002, 0003, 0005, 0007, 0008).
 * Invariantes: ids cualificados `a.b.c` definen la jerarquia; colores son nombres de Paleta, nunca hex; del Tema
 * solo conoce `name` y `palette`; una Vista solo selecciona Nodos.
 * Errores: `validate` devuelve issues ordenados y nunca lanza; solo se lanza por fallos de uso o internos.
 * Dependencias: solo `zod`; es el primero de `canonico -> tema -> dsl -> layout -> sesion -> render -> shell -> estudio -> cli`.
 */
export {
  CARDINALIDADES_ER,
  CLAVES_DE_ATRIBUTO,
  fuenteCanonicaSchema,
  idDeNodoSchema,
  nodoSchema,
  overrideSchema,
  padreDe,
  pasoSchema,
  temaSchema,
  TIPOS_DE_MENSAJE,
  OPERADORES_DE_FRAGMENTO,
  TIPOS_DE_VISTA,
  tipoDeNodoSchema,
  vistaSchema,
} from './esquema';
export { geometriaCacheadaSchema, geometriaSchema } from './geometria';
export type {
  CajaDeActivacion,
  CajaDeGrupoColocada,
  CajaDeNodo,
  Geometria,
  GeometriaCacheada,
  GeometriaGrafo,
  GeometriaSecuencia,
  MarcoDeFragmento,
  NotaColocada,
  OperandoColocado,
  Punto,
  RutaDeArista,
  RutaDeMensaje,
} from './geometria';
export { combineIconProviders, genericIcons, hidratarIconos, resolveNodeTypeIcon, sanearIcono, serializarIconos, workspaceIcons } from './iconos';
export type { IconProvider } from './iconos';
export { idDeArista, idDeElementoDeSecuencia, leerIdDeElementoDeSecuencia, revealAt } from './pasos';
export type { Visibilidad } from './pasos';
export { candidatosCercanos } from './sugerencias';
export { validate } from './validar';
export type { OpcionesDeValidate, RutaDeFuente, SitioDeTexto, Ubicador } from './validar';
export { activacionesDe, aplanarMensajes, destinoDeRef, lifelinesDe } from './secuencia';
export type { Activacion, CajaDeGrupo, FragmentoResuelto, InteraccionResuelta, ItemResuelto, MensajeResuelto, MensajeUbicado, NotaResuelta, RefResuelto } from './secuencia';
export { matchesSelector, resolveView } from './vistas';
export type { AristaResuelta, EstadoDeColapso, NodoResuelto, PasoResuelto, VistaDeGrafo, VistaDeSecuencia, VistaResuelta } from './vistas';
export type {
  AristaDePaso,
  Arista,
  Atributo,
  CatalogoDeTiposDeNodo,
  ClaveDeAtributo,
  ElementoDePaso,
  Extremo,
  FuenteCanonica,
  Interaccion,
  ItemDeInteraccion,
  Fragmento,
  Mensaje,
  AnclajeDeNota,
  Nota,
  Referencia,
  Operando,
  OperadorDeFragmento,
  Modelo,
  Nodo,
  OverrideDeNodo,
  Paso,
  ReferenciaOpaca,
  Tema,
  TipoDeMensaje,
  TipoDeNodo,
  Vista,
} from './esquema';

export type { Issue, IssueFix, IssueRelated, Severity, TextPosition, TextRange } from './issue';

export { CODIGOS, CODIGOS_DEPRECADOS, DESCRIPCION_DE_CODIGO } from './codigos';
export type { Codigo } from './codigos';

export { EDIT_CONTRACT_VERSION, edicionDeTextoSchema, hashDeContenido, edicionesPedidasSchema, salidaDeEditJsonSchema, salidaDeEditSchema } from './edit';
export type { SalidaDeEdit } from './edit';

export { ACTIVIDAD_CONTRACT_VERSION, COMANDOS_CON_ACTIVIDAD, crearLectorDeActividad, eventoDeActividadSchema } from './actividad';
export type { EventoDeActividad, ObjetivoDeActividad } from './actividad';

export { INSPECT_CONTRACT_VERSION, salidaDeInspectJsonSchema, salidaDeInspectSchema } from './inspect';
export type { SalidaDeInspect } from './inspect';

export { MOTIVOS_DE_RECHAZO, intencionDeOrdenSchema, intencionDePinSchema, intencionDeTemaSchema, intencionSchema } from './pin';
export type { Intencion, IntencionDeOrden, IntencionDePin, IntencionDeTema, MotivoDeRechazo } from './pin';
export { esArchivoDeFuente, RUTA_DE_FUENTES, tipoDeFuente, urlDeFuente } from './ruta-de-fuentes';
export {
  actividadDeDevSchema,
  archivoDeDevSchema,
  archivoDeRuta,
  archivosDeDevSchema,
  CLASES_DE_PROPIEDAD,
  claveDeElemento,
  codigoDeDevSchema,
  COMANDOS_DE_INSPECT,
  confianzaDeDevSchema,
  diferenciaDeDevSchema,
  diferenciaSchema,
  diferenciaVacia,
  elementoDeDiferenciaSchema,
  entradaDelHistorialDeDevSchema,
  errorDeDevSchema,
  escrituraDeDevSchema,
  estadoDeDevSchema,
  estadoHttpDeRechazo,
  etiquetaDeElemento,
  EVENTOS_DE_DEV,
  historialDeDevSchema,
  INICIO_DEL_HISTORIAL_DE_DEV,
  inspectNoEncontradoSchema,
  issueDeDevSchema,
  ORIGENES_DE_DIFERENCIA,
  peticionDeEdicionesSchema,
  peticionDeSaltoSchema,
  rechazoDeDevSchema,
  rutaDeArchivo,
  rutaDeInspect,
  RUTAS_DE_DEV,
  TIPOS_DE_CAMBIO,
} from './dev';
export type {
  ActividadDeDev,
  ArchivoDeDev,
  ArchivosDeDev,
  ClaseDePropiedad,
  CodigoDeDev,
  ComandoDeInspect,
  Diferencia,
  DiferenciaDeDev,
  ElementoCambiado,
  ElementoDeDiferencia,
  EntradaDelHistorialDeDev,
  ErrorDeDev,
  EscrituraDeDev,
  EstadoDeDev,
  EventoDeDev,
  HistorialDeDev,
  InspectNoEncontrado,
  IssueDeDev,
  NombreDeEventoDeDev,
  OrigenDeDiferencia,
  PeticionDeEdiciones,
  RechazoDeDev,
  PropiedadCambiada,
  TipoDeCambio,
  TipoDeElementoDeDiferencia,
} from './dev';

export { CONTRACT_VERSION, issueSchema, salidaDeValidateJsonSchema, salidaDeValidateSchema } from './salida';
export type { SalidaDeValidate } from './salida';
