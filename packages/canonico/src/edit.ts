/**
 * Esquema Zod de la salida de `edit --json` (ADR 0005). Version independiente de `validate` e `inspect`:
 * anadir campos no rompe el contrato; quitarlos o cambiar su significado exige subir `EDIT_CONTRACT_VERSION`.
 */
import { z } from 'zod';

import { MOTIVOS_DE_RECHAZO } from './pin';

export const EDIT_CONTRACT_VERSION = 1;

/** Hash estable (53 bits, hex) del contenido de un archivo; no criptografico. Puro, sin `node:crypto`. */
export function hashDeContenido(texto: string): string {
  let h1 = 0xdeadbeef;
  let h2 = 0x41c6ce57;
  for (let i = 0; i < texto.length; i++) {
    const c = texto.charCodeAt(i);
    h1 = Math.imul(h1 ^ c, 2654435761);
    h2 = Math.imul(h2 ^ c, 1597334677);
  }
  h1 = Math.imul(h1 ^ (h1 >>> 16), 2246822507) ^ Math.imul(h2 ^ (h2 >>> 13), 3266489909);
  h2 = Math.imul(h2 ^ (h2 >>> 16), 2246822507) ^ Math.imul(h1 ^ (h1 >>> 13), 3266489909);
  return (4294967296 * (2097151 & h2) + (h1 >>> 0)).toString(16).padStart(14, '0');
}

const posicionSchema = z.object({ line: z.number().int().min(1), column: z.number().int().min(1) });

/** Edicion de texto `{ file, range, replacement }`; el rango es 1-based con fin excluido. */
export const edicionDeTextoSchema = z.object({
  file: z.string(),
  range: z.object({ start: posicionSchema, end: posicionSchema }),
  replacement: z.string(),
});

/** Entrada de `edit --edits`; `hash` opcional es el del archivo que vio quien las pide. */
export const edicionesPedidasSchema = z.array(edicionDeTextoSchema.extend({ hash: z.string().optional() })).min(1);

const comun = { contractVersion: z.literal(EDIT_CONTRACT_VERSION) };

export const salidaDeEditSchema = z.discriminatedUnion('ok', [
  z.object({
    ...comun,
    ok: z.literal(true),
    /** Rangos sobre el contenido previo. */
    edits: z.array(edicionDeTextoSchema),
    /** Archivos escritos, ordenados. */
    files: z.array(z.string()),
  }),
  z.object({
    ...comun,
    ok: z.literal(false),
    reason: z.enum(MOTIVOS_DE_RECHAZO),
    message: z.string(),
    file: z.string().optional(),
  }),
]);

export type SalidaDeEdit = z.infer<typeof salidaDeEditSchema>;

export function salidaDeEditJsonSchema(): Record<string, unknown> {
  return z.toJSONSchema(salidaDeEditSchema);
}
