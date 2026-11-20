/**
 * `estudio/protocolo`: contrato del protocolo de `dev` entre el servidor (`cli`) y la pagina (ADR 0004, 0007).
 * Interfaz: el estado que `dev` empuja por `/api/estado` y `/eventos` (`estadoDeDevSchema`, `EstadoDeDev`, `IssueDeDev`,
 * `TipoDeCambio`). La pagina valida con los esquemas; `cli` importa de aqui solo tipos (`import type`).
 * Invariantes: sin DOM ni Node; solo depende de `canonico` y `zod`, para que importarlo no arrastre la app de navegador.
 */
import { eventoDeActividadSchema, fuenteCanonicaSchema, issueSchema } from 'canonico';
import { z } from 'zod';

export const issueDeDevSchema = issueSchema.extend({
  /** Enlace `vscode://file/<ruta>:<linea>:<columna>`. */
  href: z.string(),
});

/**
 * `pintura`: Capas o animacion, se reaplica el Estilo sobre la Geometria vigente; `estructura`: Metricas,
 * fuentes, Modelo o Vistas, relayout; `codigo`: un `.tsx`, se re-registra el componente sin relayout.
 * Con varios a la vez gana el mas fuerte: estructura, codigo, pintura.
 */
export const TIPOS_DE_CAMBIO = ['pintura', 'estructura', 'codigo'] as const;
export type TipoDeCambio = (typeof TIPOS_DE_CAMBIO)[number];

/**
 * La pagina devuelve `version` al editar y el servidor la traduce a los hashes que vio (resuelve la concurrencia).
 * Con `cambio: 'pintura'` la pagina no pide Geometria.
 */
export const estadoDeDevSchema = z.object({
  version: z.number().int(),
  /** Ausente en el estado inicial y cuando la recompilacion fallo (se conserva el ultimo dibujo bueno). */
  cambio: z.enum(TIPOS_DE_CAMBIO).optional(),
  /** Ausente mientras el Workspace nunca compilo sin errores. */
  fuente: fuenteCanonicaSchema.optional(),
  iconos: z.record(z.string(), z.string()),
  vistas: z.array(z.string()),
  /** Ruta relativa -> hash del contenido; se sirven en `/fuentes/<ruta>`. Ausente si el adaptador no los conoce. */
  fuentes: z.record(z.string(), z.string()).optional(),
  issues: z.array(issueDeDevSchema),
});

export type IssueDeDev = z.infer<typeof issueDeDevSchema>;
export type EstadoDeDev = z.infer<typeof estadoDeDevSchema>;

/**
 * Eventos SSE de `/eventos`, cada uno con `event: <nombre>`. `estado` lleva un `EstadoDeDev` (al conectar y tras cada
 * recompilacion). `actividad`, `diferencia` e `historial` los anaden los tickets del Registro de actividad, la Diferencia
 * y el Historial; el cliente ignora los que no escucha.
 */
export const EVENTOS_DE_DEV = ['estado', 'actividad', 'diferencia', 'historial'] as const;
export type NombreDeEventoDeDev = (typeof EVENTOS_DE_DEV)[number];

/**
 * Datos de `event: actividad`: Eventos del Registro de actividad en orden. Al conectar llega uno con `previos: true` y
 * los ultimos 50 del registro (si los hay); despues, uno con `previos: false` por cada tanda que el CLI anexa.
 */
export const actividadDeDevSchema = z.object({ previos: z.boolean(), eventos: z.array(eventoDeActividadSchema) });
export type ActividadDeDev = z.infer<typeof actividadDeDevSchema>;

/** Subcomandos de `GET /api/inspect/<comando>/<argumento>`; las opciones de `tema` van en la query. */
export const COMANDOS_DE_INSPECT = ['buscar', 'nodo', 'vista', 'interaccion', 'tema'] as const;
export type ComandoDeInspect = (typeof COMANDOS_DE_INSPECT)[number];

/** Cuerpo de un 404 de `/api/inspect` (o 422 si el Workspace nunca compilo): el mensaje de `inspect` y los ids cercanos. */
export const inspectNoEncontradoSchema = z.object({ ok: z.literal(false), mensaje: z.string(), cercanos: z.array(z.string()) });
export type InspectNoEncontrado = z.infer<typeof inspectNoEncontradoSchema>;

export function rutaDeInspect(comando: ComandoDeInspect, argumento: string, opciones: Readonly<Record<string, string>> = {}): string {
  const query = new URLSearchParams(opciones).toString();
  return `/api/inspect/${comando}/${encodeURIComponent(argumento)}${query === '' ? '' : `?${query}`}`;
}
