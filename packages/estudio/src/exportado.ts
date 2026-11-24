/**
 * Data of an exported Dev UI (`diagrams export`): what the read-only client serves instead of `dev`. Captured once
 * through the `dev` protocol itself (`capturarExportado`), so the export shows exactly what `dev` would show.
 * Interface: `datosDeExportadoSchema` (validated by the page when it opens) and `capturarExportado({ fetch, leerFuente })`.
 * Invariants: no DOM and no Node; the state is the connection state of `dev`; `temas` has the `inspect tema` output of
 * every Theme of the Source; `fuentes` has a `data:` URL per font path of the state (fonts that cannot be read are left
 * out and the viewer falls back to its default font); `componentes` is present only if the Themes load code.
 * Errors: `capturarExportado` rejects if `dev` gives no state, the Workspace never compiled, or the code bundle fails.
 */
import { z } from 'zod';

import { salidaDeInspectSchema } from 'canonico';

import { codigoDeDevSchema, estadoDeDevSchema, RUTAS_DE_DEV, rutaDeInspect } from './protocolo';

/** Bumped on any incompatible change of the embedded data. */
export const FORMATO_DEL_EXPORTADO = 1;

export const datosDeExportadoSchema = z.object({
  formato: z.literal(FORMATO_DEL_EXPORTADO),
  estado: estadoDeDevSchema,
  /** Theme name -> `inspect tema` output (extends chain and Layers of the Themes gallery). */
  temas: z.record(z.string(), salidaDeInspectSchema),
  /** Font path of `estado.fuentes` -> `data:` URL. */
  fuentes: z.record(z.string(), z.string()),
  /** Theme components with code: their names and the CommonJS bundle that `dev` serves in `/componentes.js`. */
  componentes: z.object({ nombres: z.array(z.string()), bundle: z.string() }).optional(),
});

export type DatosDeExportado = z.infer<typeof datosDeExportadoSchema>;

/** Bytes and MIME type of a font path of the state; `undefined` if it cannot be read. */
export type LeerFuente = (ruta: string) => { bytes: Uint8Array; tipo: string } | undefined;

export interface FuentesDeCaptura {
  /** The `dev` API (real or in memory); only `GET` routes and `POST /api/confiar` are used. */
  fetch: typeof fetch;
  leerFuente: LeerFuente;
}

async function leerJson<T>(fetchFn: typeof fetch, ruta: string, esquema: z.ZodType<T>): Promise<T> {
  const res = await fetchFn(ruta);
  if (!res.ok) throw new Error(`dev answered ${res.status} at ${ruta}`);
  return esquema.parse(await res.json());
}

function base64(bytes: Uint8Array): string {
  let binario = '';
  for (let i = 0; i < bytes.length; i += 0x8000) binario += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  return btoa(binario);
}

export async function capturarExportado({ fetch: fetchFn, leerFuente }: FuentesDeCaptura): Promise<DatosDeExportado> {
  const estado = await leerJson(fetchFn, RUTAS_DE_DEV.estado, estadoDeDevSchema);
  if (estado.fuente === undefined) throw new Error('The Workspace does not compile: nothing to export');
  const temas: DatosDeExportado['temas'] = {};
  for (const { name } of estado.fuente.themes) temas[name] = await leerJson(fetchFn, rutaDeInspect('theme', name), salidaDeInspectSchema);
  const fuentes: DatosDeExportado['fuentes'] = {};
  for (const ruta of Object.keys(estado.fuentes ?? {}).sort()) {
    const leida = leerFuente(ruta);
    if (leida !== undefined) fuentes[ruta] = `data:${leida.tipo};base64,${base64(leida.bytes)}`;
  }
  const codigo = await leerJson(fetchFn, RUTAS_DE_DEV.codigo, codigoDeDevSchema);
  if (!codigo.temaConCodigo) return { formato: FORMATO_DEL_EXPORTADO, estado, temas, fuentes };
  // Whoever exports is the author of the Workspace: the code is trusted as `dev --trust-code` would.
  if (!codigo.confiado) await fetchFn(RUTAS_DE_DEV.confiar, { method: 'POST', headers: { 'content-type': 'application/json' }, body: '{}' });
  const res = await fetchFn(RUTAS_DE_DEV.componentes);
  if (!res.ok) throw new Error(`dev answered ${res.status} at ${RUTAS_DE_DEV.componentes}`);
  return { formato: FORMATO_DEL_EXPORTADO, estado, temas, fuentes, componentes: { nombres: codigo.componentes, bundle: await res.text() } };
}
