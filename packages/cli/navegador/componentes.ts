/**
 * Registro de Componentes de Tema en el navegador de `dev`: evalua el bundle
 * CommonJS que sirve `/componentes.js` (ver `src/codigo.ts`) y devuelve los
 * componentes por nombre. El bundle deja `react` fuera: se le entrega el mismo
 * React de la pagina, para que los hooks del componente funcionen. Corre codigo
 * del Workspace con los privilegios del navegador, sin sandbox (ADR 0008): solo
 * se llama tras la confirmacion del usuario.
 */
import * as React from 'react';
import * as jsxRuntime from 'react/jsx-runtime';
import type { ComponentesDeTema } from 'render';

const MODULOS: Record<string, unknown> = { react: React, 'react/jsx-runtime': jsxRuntime, 'react/jsx-dev-runtime': jsxRuntime };

export function cargarComponentes(bundle: string): ComponentesDeTema {
  const requerir = (nombre: string): unknown => {
    if (!Object.hasOwn(MODULOS, nombre)) throw new Error(`Un componente de Tema no puede importar '${nombre}'`);
    return MODULOS[nombre];
  };
  const exportados = new Function('require', bundle)(requerir) as Record<string, unknown>;
  return Object.fromEntries(Object.entries(exportados).filter(([nombre, valor]) => /^[A-Z]/.test(nombre) && typeof valor === 'function')) as ComponentesDeTema;
}

export interface PuertoDeCodigo {
  /** `fetch` del navegador; los tests pasan el global. */
  fetch: typeof fetch;
  /** Prefijo de las rutas de `dev` (vacio en la pagina; la URL del servidor en las pruebas). */
  base?: string;
  /** Pregunta al usuario; en la pagina es `window.confirm`. */
  confirmar(mensaje: string): boolean;
}

/**
 * Cargador de los Componentes de Tema desde `dev`: consulta `/api/codigo`, pide confirmacion explicita la
 * primera vez que el Workspace tiene un Tema con codigo (y no vuelve a preguntar si se rechazo), la registra con
 * `POST /api/confiar` y evalua `/componentes.js`. Resuelve `undefined` si no hay codigo o se rechazo; lanza si la
 * carga falla, y quien llama conserva entonces los componentes anteriores (el ultimo dibujo bueno).
 */
export function crearCargadorDeCodigo({ fetch: pedir, base = '', confirmar }: PuertoDeCodigo): () => Promise<ComponentesDeTema | undefined> {
  let rechazado = false;
  return async () => {
    if (rechazado) return undefined;
    const info = (await (await pedir(`${base}/api/codigo`)).json()) as { temaConCodigo: boolean; componentes: string[]; confiado: boolean };
    if (!info.temaConCodigo) return undefined;
    if (!info.confiado) {
      if (!confirmar(`Los Temas de este Workspace cargan codigo (${info.componentes.join(', ')}) que corre en tu navegador sin sandbox. Cargalo solo si confias en el Workspace. Cargar el codigo?`)) {
        rechazado = true;
        return undefined;
      }
      const confirmado = await pedir(`${base}/api/confiar`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: '{}' });
      if (!confirmado.ok) throw new Error('dev no acepto la confirmacion');
    }
    const bundle = await pedir(`${base}/componentes.js`);
    if (!bundle.ok) throw new Error('dev no sirve el codigo');
    return cargarComponentes(await bundle.text());
  };
}
