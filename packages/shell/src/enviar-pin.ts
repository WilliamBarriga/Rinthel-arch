/**
 * Cliente de `POST /api/pin` de `diagrams dev` (ADR 0005): envia la intencion de
 * mover un Pin y traduce la respuesta. El `fetch` entra como argumento. La
 * `IntencionDePin` se declara una sola vez en `canonico` y se importa type-only.
 */
import type { Intencion, IntencionDePin } from 'canonico';

export type { IntencionDePin } from 'canonico';

export type ResultadoDeEnvioDePin = { ok: true } | { ok: false; desactualizado: boolean; mensaje: string };

/** Transitorio (hasta el cliente unico de `dev`, #164): el navegador anota la version del estado que vio; `dev` la traduce a `visto`. */
export type ConVersionVista<T> = T & { version?: number };

export type EnviadorDePin = (intencion: ConVersionVista<IntencionDePin>) => Promise<ResultadoDeEnvioDePin>;
export type EnviadorDeIntencion = (intencion: ConVersionVista<Intencion>) => Promise<ResultadoDeEnvioDePin>;

/** `desactualizado` es el 409 por texto desactualizado: hay que recargar la Vista y avisar. Nunca lanza. */
export function crearEnviadorDePin(fetchFn: typeof fetch = (...a) => fetch(...a)): EnviadorDePin {
  const enviar = enviador('/api/pin', fetchFn);
  return (intencion) => enviar(intencion);
}

/** Como `crearEnviadorDePin`, pero para cualquier `Intencion` por `POST /api/edit` (ADR 0007). */
export function crearEnviadorDeIntencion(fetchFn: typeof fetch = (...a) => fetch(...a)): EnviadorDeIntencion {
  return enviador('/api/edit', fetchFn);
}

function enviador(ruta: string, fetchFn: typeof fetch): (cuerpo: unknown) => Promise<ResultadoDeEnvioDePin> {
  return async (intencion) => {
    try {
      const res = await fetchFn(ruta, {
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
