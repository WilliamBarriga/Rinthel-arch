import { describe, expect, it } from 'vitest';

import { openSession } from 'session';

const model = `specification { node servicio { color rojo }  node tabla { color azul } }
model {
  servicio api
  tabla db
  api -> db
}
`;
const palette = `palette { rojo "#dc2626"  azul "#2563eb"  papel "#fefce8"  tinta "#1f2937"  verde "#16a34a" }`;
const BASE = `    layer forma rect { radius 8 }
    layer relleno solid { color papel }
    layer borde border { color tinta width 1 }
    slots { title attrs }`;
const views = `view arq { type architecture  include **  theme t }
view flujo { type flow  include **  theme t }
`;
const workspace = (node: string, viewDsl = views) => ({ 'main.dg': `${model}theme t {\n  ${palette}\n  node {\n${BASE}\n${node}\n  }\n}\n${viewDsl}` });
const fill = (session: ReturnType<typeof openSession>, view: string, kind?: string, state?: string): string => {
  const node = session.style(view)!.pintura.nodo;
  const stack = kind === undefined ? node : node.tipos[kind]!;
  return (state === undefined ? stack.capas : stack.estados[state as 'hover']!).find((c) => c.nombre === 'relleno')!.props['color'] as string;
};

describe('session seam: cascade by Diagram type', () => {
  it('a diagram flow patch changes the Metrics only in the flow Views', () => {
    const session = openSession(workspace('    diagram flow { slots row pad 40 { title attrs } }'));

    const flow = session.style('flujo')!.tabla.base;
    const architecture = session.style('arq')!.tabla.base;
    expect(flow.disposicion.pad).toBe(40);
    expect(architecture.disposicion.pad).not.toBe(40);
    expect(flow.disposicion).not.toEqual(architecture.disposicion);
  });

  it('a diagram patch paints only in its Diagram type', () => {
    const session = openSession(workspace('    diagram flow { layer relleno { color verde } }'));

    expect(fill(session, 'flujo')).toBe('#16a34a');
    expect(fill(session, 'arq')).toBe('#fefce8');
  });

  it('the diagram patch sits below the Node kind and the state', () => {
    const session = openSession(
      workspace(`    diagram flow { layer relleno { color verde } }
    type servicio { layer relleno { color rojo } }
    state hover { layer relleno { color azul } }`),
    );

    expect(fill(session, 'flujo', 'tabla')).toBe('#16a34a');
    expect(fill(session, 'flujo', 'servicio')).toBe('#dc2626');
    expect(fill(session, 'flujo', 'servicio', 'hover')).toBe('#2563eb');
  });

  it('accepts the four types even if sequence and er have no Views yet', async () => {
    const session = openSession(workspace('    diagram sequence { layer relleno { color verde } }\n    diagram er { layer relleno { color rojo } }'));

    expect((await session.diagnose()).filter((i) => i.severity === 'error')).toEqual([]);
  });

  it('an unknown type is a Theme issue with a typo fix', async () => {
    const dsl = workspace('    diagram sequense { layer relleno { color verde } }');
    const issues = await openSession(dsl).diagnose();

    const issue = issues.find((i) => i.code === 'theme-unknown-diagram-type');
    expect(issue?.fix?.replacement).toBe('sequence');
  });

  it('an invalid value inside diagram is a Theme issue', async () => {
    const issues = await openSession(workspace('    diagram flow { layer relleno { color noexiste } }')).diagnose();

    expect(issues.map((i) => i.code)).toEqual(['unknown-palette-color']);
  });

  it('in group and edge too: the Group changes its padding and the Edge its marker', () => {
    const dsl = {
      'main.dg': `${model}theme t {
  ${palette}
  node {
${BASE}
  }
  group { diagram flow { padding 40 } }
  edge { end arrow { size 8 }  diagram flow { end arrow { size 20 } } }
}
${views}`,
    };
    const session = openSession(dsl);

    expect(session.style('flujo')!.tabla.grupoAbierto.paddingGrupo.left).toBe(40);
    expect(session.style('arq')!.tabla.grupoAbierto.paddingGrupo.left).not.toBe(40);
    expect(session.style('flujo')!.pintura.arista.fin?.props['size']).toBe(20);
    expect(session.style('arq')!.pintura.arista.fin?.props['size']).toBe(8);
  });
});
