import { describe, expect, it } from 'vitest';

import { compile } from 'dsl';

describe('dsl', () => {
  it('se importa por nombre de paquete y compila un Workspace minimo', () => {
    const { canonico, issues } = compile({
      'a.dg': 'specification { node servicio }\nmodel { servicio a "A" }\n',
    });
    expect(issues).toEqual([]);
    expect(canonico?.model.nodes.map((nodo) => nodo.id)).toEqual(['a']);
  });
});
