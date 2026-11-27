/**
 * `estudio/protocolo`: el protocolo de `dev` entre el servidor (`cli`) y la pagina, tal como lo ve la pagina (ADR 0004, 0007).
 * Interfaz: reexporta de `canonical` (`dev.ts`, el unico dueno del protocolo) las rutas (`DEV_ROUTES`), los eventos SSE
 * con nombre (`DEV_EVENTS`), los esquemas de lo que produce el Workspace vivo (estado, Diferencia, Historial,
 * actividad, archivos, codigo, escrituras aceptadas, errores y rechazos, `inspect` no encontrado) y los de las peticiones. La pagina valida con ellos;
 * `cli` importa de aqui solo tipos (los valores los toma de `canonical`).
 * Invariantes: sin DOM ni Node; solo reexporta de `canonical`, para que importarlo no arrastre la app de navegador.
 */
export {
  devActivitySchema as actividadDeDevSchema,
  devFileSchema as archivoDeDevSchema,
  devFilesSchema as archivosDeDevSchema,
  devCodeSchema as codigoDeDevSchema,
  INSPECT_COMMANDS as COMANDOS_DE_INSPECT,
  devTrustSchema as confianzaDeDevSchema,
  devDiffSchema as diferenciaDeDevSchema,
  diffElementSchema as elementoDeDiferenciaSchema,
  devHistoryEntrySchema as entradaDelHistorialDeDevSchema,
  devErrorSchema as errorDeDevSchema,
  devWriteSchema as escrituraDeDevSchema,
  devStateSchema as estadoDeDevSchema,
  DEV_EVENTS as EVENTOS_DE_DEV,
  devHistorySchema as historialDeDevSchema,
  DEV_HISTORY_START as INICIO_DEL_HISTORIAL_DE_DEV,
  inspectNotFoundSchema as inspectNoEncontradoSchema,
  devIssueSchema as issueDeDevSchema,
  DIFF_ORIGINS as ORIGENES_DE_DIFERENCIA,
  editsRequestSchema as peticionDeEdicionesSchema,
  jumpRequestSchema as peticionDeSaltoSchema,
  devRejectionSchema as rechazoDeDevSchema,
  fileRoute as rutaDeArchivo,
  inspectRoute as rutaDeInspect,
  DEV_ROUTES as RUTAS_DE_DEV,
  CHANGE_KINDS as TIPOS_DE_CAMBIO,
} from 'canonical';
export type {
  DevActivity as ActividadDeDev,
  DevFile as ArchivoDeDev,
  DevFiles as ArchivosDeDev,
  DevCode as CodigoDeDev,
  InspectCommand as ComandoDeInspect,
  DevDiff as DiferenciaDeDev,
  DiffElement as ElementoDeDiferenciaDeDev,
  DevHistoryEntry as EntradaDelHistorialDeDev,
  DevError as ErrorDeDev,
  DevWrite as EscrituraDeDev,
  DevState as EstadoDeDev,
  DevEvent as EventoDeDev,
  DevHistory as HistorialDeDev,
  InspectNotFound as InspectNoEncontrado,
  DevIssue as IssueDeDev,
  DevEventName as NombreDeEventoDeDev,
  DiffOrigin as OrigenDeDiferencia,
  EditsRequest as PeticionDeEdiciones,
  DevRejection as RechazoDeDev,
  ChangeKind as TipoDeCambio,
} from 'canonical';
