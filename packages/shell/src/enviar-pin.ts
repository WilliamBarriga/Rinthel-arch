/**
 * Cliente de `POST /api/pin` de `diagrams dev` (ADR 0010): envia la intencion de
 * mover un Pin y traduce la respuesta. El `fetch` entra como argumento.
 */

export interface IntencionDePinEnviada {
  vista: string;
  /** Id cualificado del Nodo. */
  nodo: string;
  x: number;
  y: number;
  /** Hash del archivo de la Vista que vio quien pide (`hashes[<archivo>]` del estado de dev). */
  hash: string;
}

export type ResultadoDeEnvioDePin = { ok: true } | { ok: false; desactualizado: boolean; mensaje: string };

export type EnviadorDePin = (intencion: IntencionDePinEnviada) => Promise<ResultadoDeEnvioDePin>;

/** `desactualizado` es el 409 por hash: hay que recargar la Vista y avisar. Nunca lanza. */
export function crearEnviadorDePin(fetchFn: typeof fetch = (...a) => fetch(...a)): EnviadorDePin {
  return async (intencion) => {
    try {
      const res = await fetchFn('/api/pin', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(intencion),
      });
      const cuerpo = (await res.json().catch(() => ({}))) as { ok?: boolean; motivo?: string; mensaje?: string };
      if (res.ok && cuerpo.ok === true) return { ok: true };
      return {
        ok: false,
        desactualizado: res.status === 409 || cuerpo.motivo === 'hash-desactualizado',
        mensaje: cuerpo.mensaje ?? `Error ${res.status}`,
      };
    } catch (error) {
      return { ok: false, desactualizado: false, mensaje: (error as Error).message };
    }
  };
}
