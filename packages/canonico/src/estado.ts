/**
 * Esquema unico del estado que el servidor de `dev` empuja al navegador
 * (`/api/estado` y `/eventos`, ADR 0005/0007). Lo produce `cli` (servidor) y lo
 * consume el navegador: ninguno de los dos lo redeclara.
 */
import { z } from 'zod';

import { fuenteCanonicaSchema } from './esquema';
import { issueSchema } from './salida';

/** Issue tal como lo ve el navegador: el de `validate` mas el enlace que abre el editor. */
export const issueDeDevSchema = issueSchema.extend({
  /** Enlace `vscode://file/<ruta>:<linea>:<columna>`. */
  href: z.string(),
});

export const estadoDeDevSchema = z.object({
  version: z.number().int(),
  /** Ausente mientras el Workspace nunca compilo sin errores. */
  fuente: fuenteCanonicaSchema.optional(),
  iconos: z.record(z.string(), z.string()),
  vistas: z.array(z.string()),
  /** Archivo en que se declara cada Vista. */
  archivosDeVista: z.record(z.string(), z.string()),
  /** Hash del contenido de cada archivo del Workspace. */
  hashes: z.record(z.string(), z.string()),
  issues: z.array(issueDeDevSchema),
});

export type IssueDeDev = z.infer<typeof issueDeDevSchema>;
export type EstadoDeDev = z.infer<typeof estadoDeDevSchema>;
