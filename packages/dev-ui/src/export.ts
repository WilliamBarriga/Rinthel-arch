/**
 * Data of an exported Dev UI (`diagrams export`): what the read-only client serves instead of `dev`. Captured once
 * through the `dev` protocol itself (`captureExport`), so the export shows exactly what `dev` would show.
 * Interface: `exportDataSchema` (validated by the page when it opens) and `captureExport({ fetch, readSource })`.
 * Invariants: no DOM and no Node; the state is the connection state of `dev`; `temas` has the `inspect tema` output of
 * every Theme of the Source; `fuentes` has a `data:` URL per font path of the state (fonts that cannot be read are left
 * out and the viewer falls back to its default font); `componentes` is present only if the Themes load code.
 * Errors: `captureExport` rejects if `dev` gives no state, the Workspace never compiled, or the code bundle fails.
 */
import { z } from 'zod';

import { inspectOutputSchema } from 'canonical';

import { devCodeSchema, devStateSchema, DEV_ROUTES, inspectRoute } from './protocol';

/** Bumped on any incompatible change of the embedded data. */
export const EXPORT_FORMAT = 1;

export const exportDataSchema = z.object({
  formato: z.literal(EXPORT_FORMAT),
  estado: devStateSchema,
  /** Theme name -> `inspect tema` output (extends chain and Layers of the Themes gallery). */
  temas: z.record(z.string(), inspectOutputSchema),
  /** Font path of `estado.fuentes` -> `data:` URL. */
  fuentes: z.record(z.string(), z.string()),
  /** Theme components with code: their names and the CommonJS bundle that `dev` serves in `/components.js`. */
  componentes: z.object({ nombres: z.array(z.string()), bundle: z.string() }).optional(),
});

export type ExportData = z.infer<typeof exportDataSchema>;

/** Bytes and MIME type of a font path of the state; `undefined` if it cannot be read. */
export type ReadSource = (route: string) => { bytes: Uint8Array; kind: string } | undefined;

export interface CaptureSources {
  /** The `dev` API (real or in memory); only `GET` routes and `POST /api/trust` are used. */
  fetch: typeof fetch;
  readSource: ReadSource;
}

async function readJson<T>(fetchFn: typeof fetch, route: string, schema: z.ZodType<T>): Promise<T> {
  const res = await fetchFn(route);
  if (!res.ok) throw new Error(`dev answered ${res.status} at ${route}`);
  return schema.parse(await res.json());
}

function base64(bytes: Uint8Array): string {
  let binary = '';
  for (let i = 0; i < bytes.length; i += 0x8000) binary += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  return btoa(binary);
}

export async function captureExport({ fetch: fetchFn, readSource }: CaptureSources): Promise<ExportData> {
  const state = await readJson(fetchFn, DEV_ROUTES.state, devStateSchema);
  if (state.fuente === undefined) throw new Error('The Workspace does not compile: nothing to export');
  const themes: ExportData['temas'] = {};
  for (const { name } of state.fuente.themes) themes[name] = await readJson(fetchFn, inspectRoute('theme', name), inspectOutputSchema);
  const fonts: ExportData['fuentes'] = {};
  for (const route of Object.keys(state.fuentes ?? {}).sort()) {
    const read = readSource(route);
    if (read !== undefined) fonts[route] = `data:${read.kind};base64,${base64(read.bytes)}`;
  }
  const code = await readJson(fetchFn, DEV_ROUTES.code, devCodeSchema);
  if (!code.temaConCodigo) return { formato: EXPORT_FORMAT, estado: state, temas: themes, fuentes: fonts };
  // Whoever exports is the author of the Workspace: the code is trusted as `dev --trust-code` would.
  if (!code.confiado) await fetchFn(DEV_ROUTES.trust, { method: 'POST', headers: { 'content-type': 'application/json' }, body: '{}' });
  const res = await fetchFn(DEV_ROUTES.components);
  if (!res.ok) throw new Error(`dev answered ${res.status} at ${DEV_ROUTES.components}`);
  return { formato: EXPORT_FORMAT, estado: state, temas: themes, fuentes: fonts, componentes: { nombres: code.componentes, bundle: await res.text() } };
}
