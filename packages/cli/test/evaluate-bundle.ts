/**
 * Evaluates the CommonJS bundle of `/components.js` with React as the only external module, as the `dev-ui` loader does
 * in the browser (`cli` does not import browser code). It checks that what `cli` compiles loads and draws.
 */
import * as React from 'react';
import type { ComponentType } from 'react';
import * as jsxRuntime from 'react/jsx-runtime';

const MODULES: Record<string, unknown> = { react: React, 'react/jsx-runtime': jsxRuntime };

export function evaluateBundle(bundle: string): Record<string, ComponentType> {
  const requireFn = (name: string): unknown => {
    if (!Object.hasOwn(MODULES, name)) throw new Error(`module not allowed: ${name}`);
    return MODULES[name];
  };
  return new Function('require', bundle)(requireFn) as Record<string, ComponentType>;
}
