/**
 * `estudio/protocolo`: contrato del protocolo de `dev` entre el servidor (`cli`) y la pagina (ADR 0004, 0007).
 * Interfaz: reexporta de `canonico` (`dev.ts`) las rutas (`RUTAS_DE_DEV`), los esquemas de lo que produce el Workspace
 * vivo (`estadoDeDevSchema`, `diferenciaDeDevSchema`, `historialDeDevSchema`, archivos) y de las peticiones, y suma lo que
 * solo conoce la pagina: los eventos SSE con nombre, `actividadDeDevSchema` y el 404 de `inspect`. La pagina valida con
 * los esquemas; `cli` importa de aqui solo tipos (los valores los toma de `canonico`).
 * Invariantes: sin DOM ni Node; solo depende de `canonico` y `zod`, para que importarlo no arrastre la app de navegador.
 */
import { eventoDeActividadSchema } from 'canonico';
import { z } from 'zod';

export {
  archivoDeDevSchema,
  archivosDeDevSchema,
  COMANDOS_DE_INSPECT,
  diferenciaDeDevSchema,
  elementoDeDiferenciaSchema,
  entradaDelHistorialDeDevSchema,
  estadoDeDevSchema,
  historialDeDevSchema,
  INICIO_DEL_HISTORIAL_DE_DEV,
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
  ArchivoDeDev,
  ArchivosDeDev,
  ComandoDeInspect,
  DiferenciaDeDev,
  ElementoDeDiferencia as ElementoDeDiferenciaDeDev,
  EntradaDelHistorialDeDev,
  EstadoDeDev,
  HistorialDeDev,
  IssueDeDev,
  OrigenDeDiferencia,
  PeticionDeEdiciones,
  TipoDeCambio,
} from 'canonico';

/**
 * Eventos SSE de `/eventos`, cada uno con `event: <nombre>`. `estado` lleva un `EstadoDeDev` (al conectar y tras cada
 * recompilacion). `actividad`, `diferencia` e `historial` los anaden los tickets del Registro de actividad, la Diferencia
 * y el Historial; el cliente ignora los que no escucha.
 */
export const EVENTOS_DE_DEV = ['estado', 'actividad', 'diferencia', 'historial'] as const;
export type NombreDeEventoDeDev = (typeof EVENTOS_DE_DEV)[number];

/**
 * Datos de `event: actividad`: Eventos del Registro de actividad en orden. Al conectar llega uno con `previos: true` y
 * los ultimos 50 del registro (quiza ninguno); despues, uno con `previos: false` por cada tanda que el CLI anexa.
 */
export const actividadDeDevSchema = z.object({ previos: z.boolean(), eventos: z.array(eventoDeActividadSchema) });
export type ActividadDeDev = z.infer<typeof actividadDeDevSchema>;

/** Cuerpo de un 404 de `/api/inspect` (o 422 si el Workspace nunca compilo): el mensaje de `inspect` y los ids cercanos. */
export const inspectNoEncontradoSchema = z.object({ ok: z.literal(false), mensaje: z.string(), cercanos: z.array(z.string()) });
export type InspectNoEncontrado = z.infer<typeof inspectNoEncontradoSchema>;
