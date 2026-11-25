import { mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

import { INSPECT_CONTRACT_VERSION, salidaDeInspectSchema } from 'canonico';
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

function workspace(texto = DG): string {
  const raiz = mkdtempSync(join(tmpdir(), 'inspect-'));
  writeFileSync(join(raiz, 'main.dg'), texto);
  return raiz;
}

async function json(args: string[], raiz = workspace()) {
  const r = await run(['inspect', ...args, '--workspace', raiz, '--json']);
  return { ...r, salida: r.stdout === '' ? undefined : salidaDeInspectSchema.parse(JSON.parse(r.stdout)) };
}

describe('inspect search', () => {
  it('encuentra Nodos por id parcial y por titulo, con id cualificado, tipo y archivo:linea', async () => {
    const porId = await json(['search', 'db']);
    expect(porId.exitCode).toBe(0);
    expect(porId.salida).toMatchObject({
      contractVersion: INSPECT_CONTRACT_VERSION,
      command: 'search',
      results: [{ kind: 'node', id: 'sistema.db', type: 'dato', title: 'Base de datos', file: 'main.dg', line: 5 }],
    });

    const porTitulo = await json(['search', 'pagos']);
    expect(porTitulo.salida).toMatchObject({ results: [{ id: 'sistema.api', line: 4 }] });
  });

  it('tambien encuentra Vistas y no distingue mayusculas', async () => {
    const { salida } = await json(['search', 'DATOS']);
    expect(salida).toMatchObject({ command: 'search' });
    const resultados = (salida as { results: { kind: string; id: string; line: number }[] }).results;
    expect(resultados).toContainEqual(expect.objectContaining({ kind: 'view', id: 'datos', line: 17 }));
    expect(resultados).toContainEqual(expect.objectContaining({ kind: 'node', id: 'sistema.db' }));
  });

  it('texto legible por defecto: una linea por resultado', async () => {
    const r = await run(['inspect', 'search', 'cola', '--workspace', workspace()]);
    expect(r.exitCode).toBe(0);
    expect(r.stdout).toBe('node cola servicio "Cola" main.dg:9\n1 result\n');
  });

  it('also matches descriptions (assumptions, open questions), after the id and title matches', async () => {
    const texto = `specification { node service }
model {
  service open "Open service"
  service billing "Billing" "Open question: who owns refunds?"
  interaction pay "Pay" "Assumption: open banking API" { billing -> open "x" }
}
`;
    const { salida } = await json(['search', 'open question'], workspace(texto));
    expect(salida).toMatchObject({ results: [{ kind: 'node', id: 'billing' }] });

    const todos = await json(['search', 'open'], workspace(texto));
    expect((todos.salida as { results: { kind: string; id: string }[] }).results.map((r) => `${r.kind}:${r.id}`)).toEqual(['node:open', 'node:billing', 'interaction:pay']);
  });

  it('sin coincidencias sale 0 con lista vacia', async () => {
    const { exitCode, salida } = await json(['search', 'zzz']);
    expect(exitCode).toBe(0);
    expect(salida).toMatchObject({ results: [] });
  });
});

describe('inspect node', () => {
  it('devuelve las Aristas y las Vistas que incluyen al Nodo', async () => {
    const { exitCode, salida } = await json(['node', 'sistema.api']);
    expect(exitCode).toBe(0);
    expect(salida).toMatchObject({
      command: 'node',
      node: { id: 'sistema.api', type: 'servicio', title: 'API de pagos', file: 'main.dg', line: 4, parent: 'sistema', children: [] },
      edges: [
        { from: 'sistema.api', to: 'sistema.db', direction: 'out', label: 'lee', file: 'main.dg', line: 10 },
        { from: 'cola', to: 'sistema.api', direction: 'in', file: 'main.dg', line: 11 },
      ],
      views: [{ id: 'general', file: 'main.dg', line: 13 }],
    });
  });

  it('lista los hijos, los Atributos y varias Vistas', async () => {
    const { salida } = await json(['node', 'sistema.db']);
    expect(salida).toMatchObject({
      node: { attributes: [{ name: 'id' }] },
      views: [{ id: 'general' }, { id: 'datos' }],
    });
    const padre = await json(['node', 'sistema']);
    expect(padre.salida).toMatchObject({ node: { children: ['sistema.api', 'sistema.db'] } });
  });

  it('texto legible por defecto', async () => {
    const r = await run(['inspect', 'node', 'sistema.api', '--workspace', workspace()]);
    expect(r.stdout).toContain('sistema.api servicio "API de pagos" main.dg:4');
    expect(r.stdout).toContain('-> sistema.db "lee" main.dg:10');
    expect(r.stdout).toContain('<- cola main.dg:11');
    expect(r.stdout).toContain('general main.dg:13');
  });

  it('un Nodo inexistente sale 1 sugiriendo ids cercanos', async () => {
    const r = await run(['inspect', 'node', 'sistema.dv', '--workspace', workspace()]);
    expect(r.exitCode).toBe(1);
    expect(r.stdout).toBe('');
    expect(r.stderr).toContain("No such Node 'sistema.dv'");
    expect(r.stderr).toContain('sistema.db');
  });
});

describe('inspect view', () => {
  it('lista los Nodos y Aristas visibles de la Vista', async () => {
    const { salida } = await json(['view', 'datos']);
    expect(salida).toMatchObject({
      command: 'view',
      view: { id: 'datos', type: 'architecture', file: 'main.dg', line: 17, nodes: [{ id: 'sistema.db', type: 'dato', line: 5 }], edges: [] },
    });
    const general = await json(['view', 'general']);
    const vista = (general.salida as { view: { nodes: { id: string }[]; edges: unknown[] } }).view;
    expect(vista.nodes.map(({ id }) => id)).toEqual(['sistema', 'sistema.api', 'sistema.db', 'cola']);
    expect(vista.edges).toHaveLength(2);
  });

  it('una View not found sale 1', async () => {
    const r = await run(['inspect', 'view', 'nada', '--workspace', workspace()]);
    expect(r.exitCode).toBe(1);
    expect(r.stderr).toContain("No such View 'nada'");
  });
});

describe('inspect --theme-path', () => {
  it('acepta --theme-path como validate y build', async () => {
    const temas = join(import.meta.dirname, 'fixtures', 'temas-extra');
    const r = await run(['inspect', 'search', 'db', '--workspace', workspace(), '--theme-path', temas]);
    expect(r.exitCode).toBe(0);
    expect(r.stdout).toContain('sistema.db');
  });
});

describe('inspect view: sitio de Aristas elevadas', () => {
  it('una Arista elevada por un Grupo colapsado apunta a una Arista del Modelo que fusiona, no a la primera', async () => {
    const texto = `specification { node servicio }
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
    const { salida } = await json(['view', 'v'], workspace(texto));
    const aristas = (salida as { view: { edges: { from: string; to: string; line: number }[] } }).view.edges;
    const elevada = aristas.find(({ to }) => to === 'grupo');
    expect(elevada?.line).toBe(9);
  });
});

describe('inspect errores de uso', () => {
  it('sin subcomando, subcomando desconocido, sin argumento o sin --workspace sale 2', async () => {
    const raiz = workspace();
    for (const args of [['inspect', '--workspace', raiz], ['inspect', 'foo', 'x', '--workspace', raiz], ['inspect', 'node', '--workspace', raiz], ['inspect', 'node', 'a']]) {
      const r = await run(args);
      expect(r.exitCode, args.join(' ')).toBe(2);
      expect(r.stdout).toBe('');
    }
  });

  it('un Workspace con errores de compilacion sale 1 con los issues en stderr', async () => {
    const r = await run(['inspect', 'search', 'a', '--workspace', workspace('specification { node s }\nmodel { s a  a -> zz }')]);
    expect(r.exitCode).toBe(1);
    expect(r.stdout).toBe('');
    expect(r.stderr).toContain('dangling-edge');
  });
});

describe('inspect rendimiento', () => {
  it('buscar sobre examples/rinthel-arch responde en tiempo comparable a validate', async () => {
    const raiz = resolve(import.meta.dirname, '../../../examples/rinthel-arch');
    const medir = async (args: string[]): Promise<{ ms: number; exitCode: number }> => {
      const t0 = performance.now();
      const r = await run(args);
      return { ms: performance.now() - t0, exitCode: r.exitCode };
    };
    await medir(['validate', '--workspace', raiz]); // calienta modulos y caches de arranque
    const validate = Math.min((await medir(['validate', '--workspace', raiz])).ms, (await medir(['validate', '--workspace', raiz])).ms);
    const inspect = await medir(['inspect', 'search', 'a', '--workspace', raiz]);

    expect(inspect.exitCode).toBe(0);
    // Holgado: inspect no paga layout, asi que no debe pasar de ~3x validate (mas un margen fijo contra ruido).
    expect(inspect.ms).toBeLessThan(validate * 3 + 500);
  }, 60000);
});
