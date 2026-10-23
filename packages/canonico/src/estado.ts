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

/**
 * Que cambio produjo el estado empujado (enmienda de Temas del ADR 0005), para que el visor haga lo minimo:
 * `pintura` (solo Capas pintadas o animacion: se reaplica el Estilo resuelto con la Geometria vigente),
 * `estructura` (Metricas, fuentes, Modelo o Vistas: relayout) y `codigo` (un `.tsx`: se vuelve a registrar
 * el componente, sin relayout). Si cambian varios a la vez gana el mas fuerte: estructura, codigo, pintura.
 */
export const TIPOS_DE_CAMBIO = ['pintura', 'estructura', 'codigo'] as const;
export type TipoDeCambio = (typeof TIPOS_DE_CAMBIO)[number];

export const estadoDeDevSchema = z.object({
  version: z.number().int(),
  /** Ausente en el estado inicial y cuando la recompilacion fallo (se conserva el ultimo dibujo bueno). */
  cambio: z.enum(TIPOS_DE_CAMBIO).optional(),
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
