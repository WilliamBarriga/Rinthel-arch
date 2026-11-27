import { describe, expect, it } from 'vitest';

import { openSession } from 'session';

const kindsModel = `specification { node servicio { color rojo }  node tabla { color azul } }
model {
  servicio api
  tabla db
  api -> db
}
`;
const palette = `palette { rojo "#dc2626"  azul "#2563eb"  papel "#fefce8"  tinta "#1f2937" }`;
const BASE = `    layer forma rect { radius 8 }
    layer relleno solid { color papel }
    layer borde border { color tinta width 1 }
    slots { title attrs }`;
const themeT = (node: string, extra = '') => `theme t {
  ${palette}
  ${extra}
  node {
${BASE}
${node}
  }
}
`;
const view = (theme = '  theme t\n') => `view v {
  type architecture
  include **
${theme}}
`;
const workspaceT = (dsl: string, viewDsl = view()) => ({ 'main.dg': kindsModel + dsl + viewDsl });
const layersOf = (session: ReturnType<typeof openSession>, kind?: string, state?: string): string[] => {
  const node = session.style('v')!.pintura.nodo;
  const stack = kind === undefined ? node : node.tipos[kind]!;
  return (state === undefined ? stack.capas : stack.estados[state as 'hover']!).map((c) => `${c.nombre}:${JSON.stringify(c.props)}`);
};
const codes = async (files: Record<string, string>) => (await openSession(files).diagnose()).map((i) => i.code).sort();

describe('session seam: patches by Layer name and cascade', () => {
  it('a patch by kind changes only that Layer of that kind; the rest use the base entry', () => {
    const session = openSession(workspaceT(themeT('    type servicio { layer relleno { color rojo } }')));

    expect(layersOf(session, 'servicio')).toContain('relleno:{"color":"#dc2626"}');
    expect(layersOf(session, 'tabla')).toContain('relleno:{"color":"#fefce8"}');
    expect(layersOf(session)).toContain('relleno:{"color":"#fefce8"}');
  });

  it('adds with before/after, removes with none and marks over', () => {
    const session = openSession(
      workspaceT(
        themeT(`    type servicio {
      layer barra rect after relleno { radius 2 }
      layer brillo solid before forma over { color rojo }
      layer borde none
    }`),
      ),
    );

    const layers = session.style('v')!.pintura.nodo.tipos['servicio']!.capas;
    expect(layers.map((c) => c.nombre)).toEqual(['brillo', 'forma', 'relleno', 'barra']);
    expect(layers[0]).toMatchObject({ encima: true });
    expect(layers[1]).not.toHaveProperty('encima');
  });

  it('the cascade is base Theme, kind, state and View override: the last one wins', () => {
    const dsl = themeT(
      `    type servicio { layer relleno { color rojo } }
    state hover { layer relleno { color azul } }
    state selected { layer borde { width 4 } }`,
    );
    const session = openSession(workspaceT(dsl));
    const withView = openSession(workspaceT(dsl, view('  theme t { layer relleno { color tinta } }\n')));

    expect(layersOf(session, 'servicio', 'hover')).toContain('relleno:{"color":"#2563eb"}');
    expect(layersOf(session, 'tabla', 'hover')).toContain('relleno:{"color":"#2563eb"}');
    expect(layersOf(session, 'servicio', 'selected')).toContain('relleno:{"color":"#dc2626"}');
    expect(layersOf(session, 'servicio', 'selected')).toContain('borde:{"color":"#1f2937","width":4}');
    // The View overrides every level, state ones included.
    expect(layersOf(withView, 'servicio')).toContain('relleno:{"color":"#1f2937"}');
    expect(layersOf(withView, 'servicio', 'hover')).toContain('relleno:{"color":"#1f2937"}');
  });

  it('the Resolved style is deterministic per cascade and paint patches do not touch the Metrics', () => {
    const dsl = themeT('    type servicio { layer relleno { color rojo } }\n    state hover { layer borde { width 3 } }');
    const a = openSession(workspaceT(dsl)).style('v')!;
    const b = openSession(workspaceT(dsl)).style('v')!;
    const withoutPatches = openSession(workspaceT(themeT(''))).style('v')!;

    expect(b).toEqual(a);
    expect(a.metricas).toEqual(withoutPatches.metricas);
  });

  it('part/use includes a reusable patch in a kind, a state or the base block', () => {
    const dsl = `part resalte { layer relleno { color rojo } }\n` + themeT('    type servicio { use resalte }\n    state hover { use resalte }');
    const session = openSession(workspaceT(dsl));

    expect(layersOf(session, 'servicio')).toContain('relleno:{"color":"#dc2626"}');
    expect(layersOf(session, 'tabla', 'hover')).toContain('relleno:{"color":"#dc2626"}');
    expect(layersOf(session)).toContain('relleno:{"color":"#fefce8"}');
  });

  it('extends inherits the parent patches by kind and state and adds them to its own', () => {
    const parent = themeT('    type servicio { layer relleno { color rojo } }');
    const child = `theme hijo extends t {
  node { type servicio { layer borde { width 5 } }  state hover { layer borde { width 2 } } }
}\n`;
    const session = openSession(workspaceT(parent + child, view('  theme hijo\n')));

    expect(layersOf(session, 'servicio')).toEqual(expect.arrayContaining(['relleno:{"color":"#dc2626"}', 'borde:{"color":"#1f2937","width":5}']));
    expect(layersOf(session, 'servicio', 'hover')).toContain('borde:{"color":"#1f2937","width":2}');
  });

  it('$name tokens give numbers and colors accept alpha and mix', () => {
    const session = openSession(
      workspaceT(
        themeT(
          `    type servicio {
      layer vidrio solid after relleno { color rojo/0.5 }
      layer mezcla solid after vidrio { color mix(rojo, papel, 0.5) }
      layer forma { radius $radio }
    }`,
          'tokens { radio 12 }',
        ),
      ),
    );

    const layers = session.style('v')!.pintura.nodo.tipos['servicio']!.capas;
    const prop = (name: string, key: string) => layers.find((c) => c.nombre === name)!.props[key];
    expect(prop('vidrio', 'color')).toBe('rgba(220, 38, 38, 0.5)');
    expect(prop('mezcla', 'color')).toBe('#ed9187');
    expect(prop('forma', 'radius')).toBe(12);
    expect(session.style('v')!.pintura.nodo.tipos['tabla']!.capas.find((c) => c.nombre === 'forma')!.props['radius']).toBe(8);
  });

  it('COLOR takes the color of each kind in the same patch of the base Theme', () => {
    const session = openSession(workspaceT(themeT('    layer marca solid after relleno { color COLOR }')));

    const mark = (kind: string) => session.style('v')!.pintura.nodo.tipos[kind]!.capas.find((c) => c.nombre === 'marca')!.props['color'];
    expect(mark('servicio')).toBe('#dc2626');
    expect(mark('tabla')).toBe('#2563eb');
  });

  it('mix accepts COLOR on either side: the color of each kind mixed with a Palette one', () => {
    const session = openSession(workspaceT(themeT('    layer marca solid after relleno { color mix(COLOR, papel, 0.5) }\n    layer velo solid after marca { color mix(tinta, COLOR, 0.25) }')));

    const prop = (kind: string, name: string) => session.style('v')!.pintura.nodo.tipos[kind]!.capas.find((c) => c.nombre === name)!.props['color'];
    expect(prop('servicio', 'marca')).toBe('#ed9187');
    expect(prop('tabla', 'marca')).toBe('#92b0ea');
    // tinta #1f2937 towards azul #2563eb by 25%: (33, 56, 100).
    expect(prop('tabla', 'velo')).toBe('#213864');
  });
});

describe('session seam: strict cascade validation', () => {
  it('a before/after towards a missing Layer is an error with a hint', async () => {
    const issues = await openSession(workspaceT(themeT('    type servicio { layer barra rect after rellno }'))).diagnose();

    expect(issues).toHaveLength(1);
    expect(issues[0]).toMatchObject({ code: 'theme-unknown-layer', severity: 'error', file: 'main.dg', fix: expect.objectContaining({ replacement: 'relleno' }) });
    expect(issues[0]!.message).toContain("'rellno'");
  });

  it('a patch to a missing Layer without placement is an error; removing a missing one too', async () => {
    const dsl = themeT('    type servicio { layer barra rect { radius 1 } }\n    type tabla { layer nada none }');

    expect(await codes(workspaceT(dsl))).toEqual(['theme-patch-without-placement', 'theme-unknown-layer']);
  });

  it('adding a new Layer in an extending Theme requires before/after', async () => {
    const child = `theme hijo extends t { node { layer extra rect } }\n`;

    expect(await codes(workspaceT(themeT('') + child))).toEqual(['theme-patch-without-placement']);
  });

  it('an undeclared token is an error with a hint; a non-numeric token too', async () => {
    const issues = await openSession(workspaceT(themeT('    type servicio { layer forma { radius $radia } }', 'tokens { radio 12 }'))).diagnose();
    const nonNumeric = await codes(workspaceT(themeT('    type servicio { layer forma { radius $nombre } }', 'tokens { nombre "x" }')));

    expect(issues.map((i) => i.code)).toEqual(['theme-unknown-token']);
    expect(issues[0]!.hint).toContain("'radio'");
    expect(nonNumeric).toEqual(['theme-invalid-value']);
  });

  it('colors: outside the Palette, alpha or mix out of range and ORIGIN in a Node (also inside mix) are errors', async () => {
    const dsl = themeT(`    layer a solid after forma { color verde }
    layer b solid after forma { color rojo/1.5 }
    layer c solid after forma { color mix(rojo, papel, 2) }
    layer d solid after forma { color ORIGIN }
    layer e solid after forma { color mix(ORIGIN, rojo, 0.5) }`);

    expect(await codes(workspaceT(dsl))).toEqual(['theme-invalid-value', 'theme-invalid-value', 'theme-invalid-value', 'theme-invalid-value', 'unknown-palette-color']);
  });

  it('the issues of a patch carry related to the base Layer', async () => {
    const dsl = themeT('    type servicio { layer relleno { colour rojo } }');
    const [issue] = await openSession(workspaceT(dsl)).diagnose();
    const baseLine = (kindsModel + dsl).split('\n').findIndex((l) => l.includes('layer relleno solid')) + 1;

    expect(issue).toMatchObject({ code: 'theme-unknown-property', related: [{ file: 'main.dg', line: baseLine }] });
  });

  it('a state patch that touches the Slots is an error: hover never relayouts', async () => {
    expect(await codes(workspaceT(themeT('    state hover { slots { title } }')))).toEqual(['theme-state-touches-metrics']);
  });

  it('a state patch that changes the shape to one that defines the box is an error; a paint one is not', async () => {
    expect(await codes(workspaceT(themeT('    state hover { layer forma circle }')))).toEqual(['theme-state-touches-metrics']);
    expect(await codes(workspaceT(themeT('    state hover { layer forma { radius 8 } }')))).toEqual([]);
  });

  it('unknown state, part and kind are reported with a hint', async () => {
    const dsl = themeT('    state hovr { layer borde { width 2 } }\n    type servicio { use resalte }\n    type servico { layer borde { width 2 } }');
    const issues = await openSession(workspaceT(dsl)).diagnose();

    expect(issues.map((i) => i.code).sort()).toEqual(['theme-unknown-part', 'theme-unknown-state', 'unknown-node-type']);
    expect(issues.find((i) => i.code === 'theme-unknown-state')!.fix?.replacement).toBe('hover');
  });

  it('an out-of-range value in a patch is not clamped', async () => {
    expect(await codes(workspaceT(themeT('    type servicio { layer borde { width 99 } }')))).toEqual(['theme-invalid-value']);
  });

  it('a repeated theme or part in the Workspace is a duplicate error with related, never a merge', async () => {
    const files = {
      'a.dg': kindsModel + themeT('') + 'part p { layer borde { width 2 } }\n' + view(),
      'b.dg': themeT('') + 'part p { layer borde { width 3 } }\n',
    };
    const issues = await openSession(files).diagnose();

    expect(issues.map((i) => i.code).sort()).toEqual(['duplicate-part', 'duplicate-theme']);
    for (const issue of issues) expect(issue).toMatchObject({ file: 'b.dg', related: [{ file: 'a.dg' }] });
  });

  it('reports every cascade error at once', async () => {
    const dsl = themeT(`    type servicio { layer barra rect after nada  layer relleno { colour rojo } }
    state hover { slots { title }  layer borde { width 99 } }
    type tabla { layer forma { radius $x } }`);

    expect(await codes(workspaceT(dsl))).toEqual([
      'theme-invalid-value',
      'theme-state-touches-metrics',
      'theme-unknown-layer',
      'theme-unknown-property',
      'theme-unknown-token',
    ]);
  });

  it('a View patch with errors is reported too', async () => {
    expect(await codes(workspaceT(themeT(''), view('  theme t { layer barra rect after nada }\n')))).toEqual(['theme-unknown-layer']);
  });
});
