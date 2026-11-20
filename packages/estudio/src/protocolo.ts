/**
 * `estudio/protocolo`: el protocolo de `dev` entre el servidor (`cli`) y la pagina, tal como lo ve la pagina (ADR 0004, 0007).
 * Interfaz: reexporta de `canonico` (`dev.ts`, el unico dueno del protocolo) las rutas (`RUTAS_DE_DEV`), los eventos SSE
 * con nombre (`EVENTOS_DE_DEV`), los esquemas de lo que produce el Workspace vivo (estado, Diferencia, Historial,
 * actividad, archivos, codigo, errores, `inspect` no encontrado) y los de las peticiones. La pagina valida con ellos;
 * `cli` importa de aqui solo tipos (los valores los toma de `canonico`).
 * Invariantes: sin DOM ni Node; solo reexporta de `canonico`, para que importarlo no arrastre la app de navegador.
 */
export {
  actividadDeDevSchema,
  archivoDeDevSchema,
  archivosDeDevSchema,
  codigoDeDevSchema,
  COMANDOS_DE_INSPECT,
  confianzaDeDevSchema,
  diferenciaDeDevSchema,
  elementoDeDiferenciaSchema,
  entradaDelHistorialDeDevSchema,
  errorDeDevSchema,
  estadoDeDevSchema,
  EVENTOS_DE_DEV,
  historialDeDevSchema,
  INICIO_DEL_HISTORIAL_DE_DEV,
  inspectNoEncontradoSchema,
  issueDeDevSchema,
  ORIGENES_DE_DIFERENCIA,
  peticionDeEdicionesSchema,
  peticionDeSaltoSchema,
  rutaDeArchivo,
  rutaDeInspect,
  RUTAS_DE_DEV,
  TIPOS_DE_CAMBIO,
} from 'canonico';
export type {
  ActividadDeDev,
  ArchivoDeDev,
  ArchivosDeDev,
  CodigoDeDev,
  ComandoDeInspect,
  DiferenciaDeDev,
  ElementoDeDiferencia as ElementoDeDiferenciaDeDev,
  EntradaDelHistorialDeDev,
  ErrorDeDev,
  EstadoDeDev,
  EventoDeDev,
  HistorialDeDev,
  InspectNoEncontrado,
  IssueDeDev,
  NombreDeEventoDeDev,
  OrigenDeDiferencia,
  PeticionDeEdiciones,
  TipoDeCambio,
} from 'canonico';
