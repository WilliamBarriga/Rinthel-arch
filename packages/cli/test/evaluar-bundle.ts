/**
 * Evalua el bundle CommonJS de `/components.js` con React como unico modulo externo, como hace el cargador de
 * `dev-ui` en el navegador (`cli` no importa codigo de navegador). Sirve para comprobar que lo que `cli` compila carga y dibuja.
 */
import * as React from 'react';
import type { ComponentType } from 'react';
import * as jsxRuntime from 'react/jsx-runtime';

const MODULOS: Record<string, unknown> = { react: React, 'react/jsx-runtime': jsxRuntime };

export function evaluarBundle(bundle: string): Record<string, ComponentType> {
  const requerir = (nombre: string): unknown => {
    if (!Object.hasOwn(MODULOS, nombre)) throw new Error(`modulo no permitido: ${nombre}`);
    return MODULOS[nombre];
  };
  return new Function('require', bundle)(requerir) as Record<string, ComponentType>;
}
