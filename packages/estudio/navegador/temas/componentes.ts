/**
 * Carga de los Componentes de Tema de la pagina: consulta el codigo, pide confianza y evalua el bundle, todo por el
 * cliente de `dev`. El bundle se evalua con el mismo React de la pagina (si no, los hooks del componente fallan).
 * Corre codigo del Workspace sin sandbox: solo tras la confirmacion del usuario. Nunca lanza: los fallos son datos.
 */
import * as React from 'react';
import * as jsxRuntime from 'react/jsx-runtime';
import type { ComponentesDeTema } from 'render';

import type { ClienteDeDev, Lectura } from '../cliente';

const MODULOS: Record<string, unknown> = { react: React, 'react/jsx-runtime': jsxRuntime, 'react/jsx-dev-runtime': jsxRuntime };

/** Registra solo los exports con nombre en mayuscula que son funciones; lanza si el bundle importa otro modulo. */
function evaluarBundle(bundle: string): ComponentesDeTema {
  const requerir = (nombre: string): unknown => {
    if (!Object.hasOwn(MODULOS, nombre)) throw new Error(`A Theme component cannot import '${nombre}'`);
    return MODULOS[nombre];
  };
  const exportados = new Function('require', bundle)(requerir) as Record<string, unknown>;
  return Object.fromEntries(Object.entries(exportados).filter(([nombre, valor]) => /^[A-Z]/.test(nombre) && typeof valor === 'function')) as ComponentesDeTema;
}

/** `valor` ausente: no hay codigo o se rechazo la confirmacion. `ok: false` lleva el motivo visible. */
export type CargaDeComponentes = Lectura<ComponentesDeTema | undefined>;

/**
 * Pide confirmacion la primera vez que hay codigo sin confianza (no vuelve a preguntar si se rechazo) y carga el
 * bundle. Cada llamada vuelve a consultar el codigo (se llama tras cada estado nuevo).
 */
export function crearCargadorDeComponentes(cliente: ClienteDeDev, confirmar: (mensaje: string) => boolean): () => Promise<CargaDeComponentes> {
  let rechazado = false;
  return async () => {
    if (rechazado) return { ok: true, valor: undefined };
    const codigo = await cliente.codigo();
    if (!codigo.ok) return codigo;
    const { temaConCodigo, componentes, confiado } = codigo.valor;
    if (!temaConCodigo) return { ok: true, valor: undefined };
    if (!confiado) {
      if (!confirmar(`The Themes of this Workspace load code (${componentes.join(', ')}) that runs in your browser without a sandbox. Load it only if you trust the Workspace. Load the code?`)) {
        rechazado = true;
        return { ok: true, valor: undefined };
      }
      const confirmado = await cliente.confiar();
      if (!confirmado.ok) return { ok: false, mensaje: `dev did not accept the confirmation: ${confirmado.mensaje}` };
    }
    const bundle = await cliente.bundleDeComponentes();
    if (!bundle.ok) return bundle;
    try {
      return { ok: true, valor: evaluarBundle(bundle.valor) };
    } catch (error) {
      return { ok: false, mensaje: (error as Error).message };
    }
  };
}
