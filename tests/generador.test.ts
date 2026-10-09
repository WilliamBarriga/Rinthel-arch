import { describe, expect, it } from 'vitest';

import type { Nodo } from 'canonico';
import { compile } from 'dsl';

import { generarWorkspace } from '../bench/generador';

const contar = (nodos: readonly Nodo[]): number => nodos.reduce((suma, nodo) => suma + 1 + contar(nodo.children), 0);
const profundidad = (nodos: readonly Nodo[]): number => nodos.reduce((max, nodo) => Math.max(max, 1 + profundidad(nodo.children)), 0);

describe('generarWorkspace', () => {
  it.each([1, 10, 137, 1000])('compila sin issues y tiene exactamente %i Nodos', (nodos) => {
    const { issues, canonico } = compile(generarWorkspace({ nodos }));

    expect(issues).toEqual([]);
    expect(contar(canonico!.model.nodes)).toBe(nodos);
  });

  it('es determinista: misma entrada, mismos archivos; otra semilla, otro grafo', () => {
    expect(generarWorkspace({ nodos: 200 })).toEqual(generarWorkspace({ nodos: 200 }));
    expect(generarWorkspace({ nodos: 200, semilla: 2 })).not.toEqual(generarWorkspace({ nodos: 200 }));
  });

  it('genera Grupos anidados y Aristas en proporcion a los Nodos', () => {
    const { canonico } = compile(generarWorkspace({ nodos: 500, aristasPorNodo: 2 }));

    expect(profundidad(canonico!.model.nodes)).toBeGreaterThanOrEqual(3);
    expect(canonico!.model.edges).toHaveLength(1000);
  });

  it('declara una Vista que incluye todo el Modelo', () => {
    const { canonico } = compile(generarWorkspace({ nodos: 20 }));

    expect(canonico!.views.map((vista) => vista.id)).toEqual(['todo']);
    expect(canonico!.views[0]!.include).toEqual(['**']);
  });

  it('es generico: no menciona Rinthel', () => {
    expect(JSON.stringify(generarWorkspace({ nodos: 50 })).toLowerCase()).not.toContain('rinthel');
  });
});
