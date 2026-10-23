/**
 * Cliente de `POST /api/pin` de `diagrams dev` (ADR 0005): envia la intencion de
 * mover un Pin y traduce la respuesta. El `fetch` entra como argumento. La
 * `IntencionDePin` se declara una sola vez en `canonico` y se importa type-only.
 */
import type { IntencionDePin } from 'canonico';

export type { IntencionDePin } from 'canonico';

/** Nombre historico de `shell` para la intencion; el tipo vive en `canonico`. */
export type IntencionDePinEnviada = IntencionDePin;

export type ResultadoDeEnvioDePin = { ok: true } | { ok: false; desactualizado: boolean; mensaje: string };

export type EnviadorDePin = (intencion: IntencionDePin) => Promise<ResultadoDeEnvioDePin>;

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
