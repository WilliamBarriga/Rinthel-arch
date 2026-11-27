import { mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

import { INSPECT_CONTRACT_VERSION, inspectOutputSchema } from 'canonical';
import { run } from 'cli';

const DG = `specification { node servicio  node dato }
model {
  servicio sistema "Sistema" {
    servicio api "API de pagos"
    dato db "Base de datos" {
      attrs { id: uuid }
    }
  }
  servicio cola "Cola"
  sistema.api -> sistema.db "lee"
  cola -> sistema.api
}
view general {
  type architecture
  include **
}
view datos {
  type architecture
  include sistema.db
}
`;

function workspace(text = DG): string {
  const root = mkdtempSync(join(tmpdir(), 'inspect-'));
  writeFileSync(join(root, 'main.dg'), text);
  return root;
}

async function json(args: string[], root = workspace()) {
  const r = await run(['inspect', ...args, '--workspace', root, '--json']);
  return { ...r, output: r.stdout === '' ? undefined : inspectOutputSchema.parse(JSON.parse(r.stdout)) };
}

describe('inspect search', () => {
  it('finds Nodes by partial id and by title, with qualified id, kind and file:line', async () => {
    const byId = await json(['search', 'db']);
    expect(byId.exitCode).toBe(0);
    expect(byId.output).toMatchObject({
      contractVersion: INSPECT_CONTRACT_VERSION,
      command: 'search',
      results: [{ kind: 'node', id: 'sistema.db', type: 'dato', title: 'Base de datos', file: 'main.dg', line: 5 }],
    });

    const byTitle = await json(['search', 'pagos']);
    expect(byTitle.output).toMatchObject({ results: [{ id: 'sistema.api', line: 4 }] });
  });

  it('also finds Views and is case-insensitive', async () => {
    const { output } = await json(['search', 'DATOS']);
    expect(output).toMatchObject({ command: 'search' });
    const results = (output as { results: { kind: string; id: string; line: number }[] }).results;
    expect(results).toContainEqual(expect.objectContaining({ kind: 'view', id: 'datos', line: 17 }));
    expect(results).toContainEqual(expect.objectContaining({ kind: 'node', id: 'sistema.db' }));
  });

  it('readable text by default: one line per result', async () => {
    const r = await run(['inspect', 'search', 'cola', '--workspace', workspace()]);
    expect(r.exitCode).toBe(0);
    expect(r.stdout).toBe('node cola servicio "Cola" main.dg:9\n1 result\n');
  });

  it('also matches descriptions (assumptions, open questions), after the id and title matches', async () => {
    const text = `specification { node service }
model {
  service open "Open service"
  service billing "Billing" "Open question: who owns refunds?"
  interaction pay "Pay" "Assumption: open banking API" { billing -> open "x" }
}
`;
    const { output } = await json(['search', 'open question'], workspace(text));
    expect(output).toMatchObject({ results: [{ kind: 'node', id: 'billing' }] });

    const all = await json(['search', 'open'], workspace(text));
    expect((all.output as { results: { kind: string; id: string }[] }).results.map((r) => `${r.kind}:${r.id}`)).toEqual(['node:open', 'node:billing', 'interaction:pay']);
  });

  it('without matches it exits 0 with an empty list', async () => {
    const { exitCode, output } = await json(['search', 'zzz']);
    expect(exitCode).toBe(0);
    expect(output).toMatchObject({ results: [] });
  });
});

describe('inspect node', () => {
  it('returns the Edges and the Views that include the Node', async () => {
    const { exitCode, output } = await json(['node', 'sistema.api']);
    expect(exitCode).toBe(0);
    expect(output).toMatchObject({
      command: 'node',
      node: { id: 'sistema.api', type: 'servicio', title: 'API de pagos', file: 'main.dg', line: 4, parent: 'sistema', children: [] },
      edges: [
        { from: 'sistema.api', to: 'sistema.db', direction: 'out', label: 'lee', file: 'main.dg', line: 10 },
        { from: 'cola', to: 'sistema.api', direction: 'in', file: 'main.dg', line: 11 },
      ],
      views: [{ id: 'general', file: 'main.dg', line: 13 }],
    });
  });

  it('lists the children, the Attributes and several Views', async () => {
    const { output } = await json(['node', 'sistema.db']);
    expect(output).toMatchObject({
      node: { attributes: [{ name: 'id' }] },
      views: [{ id: 'general' }, { id: 'datos' }],
    });
    const parent = await json(['node', 'sistema']);
    expect(parent.output).toMatchObject({ node: { children: ['sistema.api', 'sistema.db'] } });
  });

  it('readable text by default', async () => {
    const r = await run(['inspect', 'node', 'sistema.api', '--workspace', workspace()]);
    expect(r.stdout).toContain('sistema.api servicio "API de pagos" main.dg:4');
    expect(r.stdout).toContain('-> sistema.db "lee" main.dg:10');
    expect(r.stdout).toContain('<- cola main.dg:11');
    expect(r.stdout).toContain('general main.dg:13');
  });

  it('a missing Node exits 1 suggesting close ids', async () => {
    const r = await run(['inspect', 'node', 'sistema.dv', '--workspace', workspace()]);
    expect(r.exitCode).toBe(1);
    expect(r.stdout).toBe('');
    expect(r.stderr).toContain("No such Node 'sistema.dv'");
    expect(r.stderr).toContain('sistema.db');
  });
});

describe('inspect view', () => {
  it('lists the visible Nodes and Edges of the View', async () => {
    const { output } = await json(['view', 'datos']);
    expect(output).toMatchObject({
      command: 'view',
      view: { id: 'datos', type: 'architecture', file: 'main.dg', line: 17, nodes: [{ id: 'sistema.db', type: 'dato', line: 5 }], edges: [] },
    });
    const general = await json(['view', 'general']);
    const view = (general.output as { view: { nodes: { id: string }[]; edges: unknown[] } }).view;
    expect(view.nodes.map(({ id }) => id)).toEqual(['sistema', 'sistema.api', 'sistema.db', 'cola']);
    expect(view.edges).toHaveLength(2);
  });

  it('a View not found exits 1', async () => {
    const r = await run(['inspect', 'view', 'nada', '--workspace', workspace()]);
    expect(r.exitCode).toBe(1);
    expect(r.stderr).toContain("No such View 'nada'");
  });
});

describe('inspect --theme-path', () => {
  it('accepts --theme-path like validate and build', async () => {
    const themes = join(import.meta.dirname, 'fixtures', 'extra-themes');
    const r = await run(['inspect', 'search', 'db', '--workspace', workspace(), '--theme-path', themes]);
    expect(r.exitCode).toBe(0);
    expect(r.stdout).toContain('sistema.db');
  });
});

describe('inspect view: site of lifted Edges', () => {
  it('an Edge lifted by a collapsed Group points to a Model Edge it merges, not to the first one', async () => {
    const text = `specification { node servicio }
model {
  servicio otro "Otro"
  servicio grupo "Grupo" {
    servicio a "A"
    servicio b "B"
  }
  otro -> otro
  otro -> grupo.a
}
view v {
  type architecture
  include **
  collapsed grupo
}
`;
    const { output } = await json(['view', 'v'], workspace(text));
    const edges = (output as { view: { edges: { from: string; to: string; line: number }[] } }).view.edges;
    const lifted = edges.find(({ to }) => to === 'grupo');
    expect(lifted?.line).toBe(9);
  });
});

describe('inspect usage errors', () => {
  it('no subcommand, unknown subcommand, no argument or no --workspace exits 2', async () => {
    const root = workspace();
    for (const args of [['inspect', '--workspace', root], ['inspect', 'foo', 'x', '--workspace', root], ['inspect', 'node', '--workspace', root], ['inspect', 'node', 'a']]) {
      const r = await run(args);
      expect(r.exitCode, args.join(' ')).toBe(2);
      expect(r.stdout).toBe('');
    }
  });

  it('a Workspace with compile errors exits 1 with the issues on stderr', async () => {
    const r = await run(['inspect', 'search', 'a', '--workspace', workspace('specification { node s }\nmodel { s a  a -> zz }')]);
    expect(r.exitCode).toBe(1);
    expect(r.stdout).toBe('');
    expect(r.stderr).toContain('dangling-edge');
  });
});

describe('inspect performance', () => {
  it('search over examples/rinthel-arch answers in a time comparable to validate', async () => {
    const root = resolve(import.meta.dirname, '../../../examples/rinthel-arch');
    const measure = async (args: string[]): Promise<{ ms: number; exitCode: number }> => {
      const t0 = performance.now();
      const r = await run(args);
      return { ms: performance.now() - t0, exitCode: r.exitCode };
    };
    await measure(['validate', '--workspace', root]); // warms up modules and startup caches
    const validate = Math.min((await measure(['validate', '--workspace', root])).ms, (await measure(['validate', '--workspace', root])).ms);
    const inspect = await measure(['inspect', 'search', 'a', '--workspace', root]);

    expect(inspect.exitCode).toBe(0);
    // Loose: inspect does not pay for layout, so it must not exceed ~3x validate (plus a fixed margin against noise).
    expect(inspect.ms).toBeLessThan(validate * 3 + 500);
  }, 60000);
});
