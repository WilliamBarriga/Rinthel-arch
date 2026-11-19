/**
 * Evalua el bundle de `/componentes.js` con el mismo React de la pagina (si no, los hooks del componente fallan).
 * Corre codigo del Workspace sin sandbox: solo se llama tras la confirmacion del usuario.
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
  fetch: typeof fetch;
  /** Prefijo de las rutas de `dev`; vacio en la pagina. */
  base?: string;
  confirmar(mensaje: string): boolean;
}

/**
 * Pide confirmacion la primera vez que hay codigo (no vuelve a preguntar si se rechazo). Resuelve `undefined` si no
 * hay codigo o se rechazo; lanza si la carga falla.
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
