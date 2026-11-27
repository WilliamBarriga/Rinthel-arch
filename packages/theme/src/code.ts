/** Theme components named by the `code` Layers, walking the full cascade (base, Node kinds, states and combinations). */
import type { Theme } from 'canonical';

import { cascade, STATES } from './patches';
import type { State, LayerOp } from './patches';
import { resolveTheme } from './theme';

/** `parametros`: everything declared except `component`. */
export interface ComponentUse {
  nombre: string;
  parametros: Readonly<Record<string, number | string>>;
}

/** `code` uses of the Theme, without repeats, sorted by name and parameters. `view` are the patches of a View. */
export function codeUses(theme: Theme, view?: readonly LayerOp[]): ComponentUse[] {
  const resolved = resolveTheme(theme);
  const uses = new Map<string, ComponentUse>();
  for (const element of ['nodo', 'grupo'] as const) {
    const kinds: Array<string | undefined> = [undefined, ...Object.keys(resolved[element].tipos)];
    const states: Array<State | undefined> = [undefined, ...STATES.filter((e) => resolved[element].estados[e] !== undefined)];
    for (const collapsed of element === 'grupo' ? [false, true] : [false]) {
      for (const kind of kinds) {
        for (const state of states) {
          const level = { ...(kind !== undefined && { tipo: kind }), ...(state !== undefined && { estado: state }), ...(collapsed && { colapsado: collapsed }), ...(element === 'nodo' && view !== undefined && { vista: view }) };
          for (const layer of cascade(resolved, level, element)) {
            if (layer.primitiva.tipo !== 'code') continue;
            const { component, ...parameters } = layer.primitiva.props;
            const use = { nombre: String(component), parametros: parameters };
            uses.set(JSON.stringify(use), use);
          }
        }
      }
    }
  }
  return [...uses.values()].sort((a, b) => a.nombre.localeCompare(b.nombre) || JSON.stringify(a.parametros).localeCompare(JSON.stringify(b.parametros)));
}

export const themeComponents = (theme: Theme, view?: readonly LayerOp[]): string[] => [...new Set(codeUses(theme, view).map((use) => use.nombre))].sort();
