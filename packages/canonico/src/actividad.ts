/**
 * Esquema Zod del Evento de actividad: una linea de `<workspace>/.diagrams/actividad.jsonl` (ADR 0005, enmienda
 * "Registro de actividad"). Version independiente de `validate`, `inspect` y `edit`: anadir campos no rompe el
 * contrato; quitarlos o cambiar su significado exige subir `ACTIVIDAD_CONTRACT_VERSION`.
 */
import { z } from 'zod';

export const ACTIVIDAD_CONTRACT_VERSION = 1;

/** Comandos del CLI que registran actividad. */
export const COMANDOS_CON_ACTIVIDAD = ['validate', 'build', 'inspect', 'edit'] as const;

export const eventoDeActividadSchema = z.object({
  contractVersion: z.literal(ACTIVIDAD_CONTRACT_VERSION),
  /** ISO 8601. */
  ts: z.string(),
  pid: z.number().int(),
  /** Texto libre de `DIAGRAMS_AGENTE`. */
  agente: z.string().optional(),
  comando: z.enum(COMANDOS_CON_ACTIVIDAD),
  /** El argv tras el comando, completo. */
  args: z.array(z.string()),
  exitCode: z.union([z.literal(0), z.literal(1), z.literal(2)]),
  duracionMs: z.number().min(0),
  /** Solo lo que el comando nombra; el CLI no deduce nada. */
  objetivo: z
    .object({
      vista: z.string().optional(),
      nodo: z.string().optional(),
      tema: z.string().optional(),
      archivos: z.array(z.string()).optional(),
    })
    .optional(),
  /** Solo `validate` y `build`. */
  resumen: z.object({ errores: z.number().int().min(0), avisos: z.number().int().min(0) }).optional(),
});

export type EventoDeActividad = z.infer<typeof eventoDeActividadSchema>;
export type ObjetivoDeActividad = NonNullable<EventoDeActividad['objetivo']>;

/**
 * Lector incremental de `actividad.jsonl` (puro: recibe el texto entero del archivo, `undefined` si no existe).
 * Cada llamada devuelve los Eventos de las lineas completas que aun no habia dado. Omite las lineas que no parsean o no
 * cumplen `eventoDeActividadSchema`; una linea sin `\n` final espera a la siguiente lectura. Si el texto ya no empieza
 * por lo leido (archivo acortado o rotado) o falta, vuelve a leer desde el principio.
 */
export function crearLectorDeActividad(): (texto: string | undefined) => EventoDeActividad[] {
  let leido = '';
  return (texto) => {
    if (texto === undefined || !texto.startsWith(leido)) leido = '';
    if (texto === undefined) return [];
    const fin = texto.lastIndexOf('\n') + 1;
    if (fin <= leido.length) return [];
    const nuevas = texto.slice(leido.length, fin);
    leido = texto.slice(0, fin);
    return nuevas.split('\n').flatMap((linea) => {
      if (linea.trim() === '') return [];
      try {
        const r = eventoDeActividadSchema.safeParse(JSON.parse(linea));
        return r.success ? [r.data] : [];
      } catch {
        return [];
      }
    });
  };
}
