/**
 * Loading of the page's Theme components: it queries the code, asks for trust and evaluates the bundle, all through
 * the `dev` client. The bundle is evaluated with the page's own React (otherwise the component hooks fail).
 * It runs Workspace code without a sandbox: only after the user confirms. It never throws: failures are data.
 */
import * as React from 'react';
import * as jsxRuntime from 'react/jsx-runtime';
import type { ThemeComponents } from 'render';

import type { DevClient, Read } from '../client';

const MODULES: Record<string, unknown> = { react: React, 'react/jsx-runtime': jsxRuntime, 'react/jsx-dev-runtime': jsxRuntime };

/** Registers only the capitalized named exports that are functions; throws if the bundle imports another module. */
function evaluateBundle(bundle: string): ThemeComponents {
  const require = (name: string): unknown => {
    if (!Object.hasOwn(MODULES, name)) throw new Error(`A Theme component cannot import '${name}'`);
    return MODULES[name];
  };
  const exported = new Function('require', bundle)(require) as Record<string, unknown>;
  return Object.fromEntries(Object.entries(exported).filter(([name, value]) => /^[A-Z]/.test(name) && typeof value === 'function')) as ThemeComponents;
}

/** Missing `value`: there is no code or the confirmation was refused. `ok: false` carries the visible reason. */
export type ComponentsLoad = Read<ThemeComponents | undefined>;

/**
 * Asks for confirmation the first time there is untrusted code (it does not ask again if refused) and loads the
 * bundle. Each call queries the code again (it is called after each new state).
 */
export function createComponentsLoader(client: DevClient, confirm: (message: string) => boolean): () => Promise<ComponentsLoad> {
  let rejected = false;
  return async () => {
    if (rejected) return { ok: true, value: undefined };
    const code = await client.code();
    if (!code.ok) return code;
    const { temaConCodigo: themeWithCode, componentes: components, confiado: trusted } = code.value;
    if (!themeWithCode) return { ok: true, value: undefined };
    if (!trusted) {
      if (!confirm(`The Themes of this Workspace load code (${components.join(', ')}) that runs in your browser without a sandbox. Load it only if you trust the Workspace. Load the code?`)) {
        rejected = true;
        return { ok: true, value: undefined };
      }
      const confirmed = await client.trust();
      if (!confirmed.ok) return { ok: false, message: `dev did not accept the confirmation: ${confirmed.message}` };
    }
    const bundle = await client.componentsBundle();
    if (!bundle.ok) return bundle;
    try {
      return { ok: true, value: evaluateBundle(bundle.value) };
    } catch (error) {
      return { ok: false, message: (error as Error).message };
    }
  };
}
