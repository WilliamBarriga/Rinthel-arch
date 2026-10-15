import { mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
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

describe('inspect buscar', () => {
  it('encuentra Nodos por id parcial y por titulo, con id cualificado, tipo y archivo:linea', async () => {
    const porId = await json(['buscar', 'db']);
    expect(porId.exitCode).toBe(0);
    expect(porId.salida).toMatchObject({
      contractVersion: INSPECT_CONTRACT_VERSION,
      comando: 'buscar',
      resultados: [{ kind: 'nodo', id: 'sistema.db', type: 'dato', title: 'Base de datos', file: 'main.dg', line: 5 }],
    });

    const porTitulo = await json(['buscar', 'pagos']);
    expect(porTitulo.salida).toMatchObject({ resultados: [{ id: 'sistema.api', line: 4 }] });
  });

  it('tambien encuentra Vistas y no distingue mayusculas', async () => {
    const { salida } = await json(['buscar', 'DATOS']);
    expect(salida).toMatchObject({ comando: 'buscar' });
    const resultados = (salida as { resultados: { kind: string; id: string; line: number }[] }).resultados;
    expect(resultados).toContainEqual(expect.objectContaining({ kind: 'vista', id: 'datos', line: 17 }));
    expect(resultados).toContainEqual(expect.objectContaining({ kind: 'nodo', id: 'sistema.db' }));
  });

  it('texto legible por defecto: una linea por resultado', async () => {
    const r = await run(['inspect', 'buscar', 'cola', '--workspace', workspace()]);
    expect(r.exitCode).toBe(0);
    expect(r.stdout).toBe('nodo cola servicio "Cola" main.dg:9\n1 resultado\n');
  });

  it('sin coincidencias sale 0 con lista vacia', async () => {
    const { exitCode, salida } = await json(['buscar', 'zzz']);
    expect(exitCode).toBe(0);
    expect(salida).toMatchObject({ resultados: [] });
  });
});

describe('inspect nodo', () => {
  it('devuelve las Aristas y las Vistas que incluyen al Nodo', async () => {
    const { exitCode, salida } = await json(['nodo', 'sistema.api']);
    expect(exitCode).toBe(0);
    expect(salida).toMatchObject({
      comando: 'nodo',
      nodo: { id: 'sistema.api', type: 'servicio', title: 'API de pagos', file: 'main.dg', line: 4, parent: 'sistema', children: [] },
      aristas: [
        { from: 'sistema.api', to: 'sistema.db', direction: 'out', label: 'lee', file: 'main.dg', line: 10 },
        { from: 'cola', to: 'sistema.api', direction: 'in', file: 'main.dg', line: 11 },
      ],
      vistas: [{ id: 'general', file: 'main.dg', line: 13 }],
    });
  });

  it('lista los hijos, los Atributos y varias Vistas', async () => {
    const { salida } = await json(['nodo', 'sistema.db']);
    expect(salida).toMatchObject({
      nodo: { attributes: [{ name: 'id' }] },
      vistas: [{ id: 'general' }, { id: 'datos' }],
    });
    const padre = await json(['nodo', 'sistema']);
    expect(padre.salida).toMatchObject({ nodo: { children: ['sistema.api', 'sistema.db'] } });
  });

  it('texto legible por defecto', async () => {
    const r = await run(['inspect', 'nodo', 'sistema.api', '--workspace', workspace()]);
    expect(r.stdout).toContain('sistema.api servicio "API de pagos" main.dg:4');
    expect(r.stdout).toContain('-> sistema.db "lee" main.dg:10');
    expect(r.stdout).toContain('<- cola main.dg:11');
    expect(r.stdout).toContain('general main.dg:13');
  });

  it('un Nodo inexistente sale 1 sugiriendo ids cercanos', async () => {
    const r = await run(['inspect', 'nodo', 'sistema.dv', '--workspace', workspace()]);
    expect(r.exitCode).toBe(1);
    expect(r.stdout).toBe('');
    expect(r.stderr).toContain("No existe el Nodo 'sistema.dv'");
    expect(r.stderr).toContain('sistema.db');
  });
});

describe('inspect vista', () => {
  it('lista los Nodos y Aristas visibles de la Vista', async () => {
    const { salida } = await json(['vista', 'datos']);
    expect(salida).toMatchObject({
      comando: 'vista',
      vista: { id: 'datos', type: 'architecture', file: 'main.dg', line: 17, nodos: [{ id: 'sistema.db', type: 'dato', line: 5 }], aristas: [] },
    });
    const general = await json(['vista', 'general']);
    const vista = (general.salida as { vista: { nodos: { id: string }[]; aristas: unknown[] } }).vista;
    expect(vista.nodos.map(({ id }) => id)).toEqual(['sistema', 'sistema.api', 'sistema.db', 'cola']);
    expect(vista.aristas).toHaveLength(2);
  });

  it('una Vista inexistente sale 1', async () => {
    const r = await run(['inspect', 'vista', 'nada', '--workspace', workspace()]);
    expect(r.exitCode).toBe(1);
    expect(r.stderr).toContain("No existe la Vista 'nada'");
  });
});

describe('inspect errores de uso', () => {
  it('sin subcomando, subcomando desconocido, sin argumento o sin --workspace sale 2', async () => {
    const raiz = workspace();
    for (const args of [['inspect', '--workspace', raiz], ['inspect', 'foo', 'x', '--workspace', raiz], ['inspect', 'nodo', '--workspace', raiz], ['inspect', 'nodo', 'a']]) {
      const r = await run(args);
      expect(r.exitCode, args.join(' ')).toBe(2);
      expect(r.stdout).toBe('');
    }
  });

  it('un Workspace con errores de compilacion sale 1 con los issues en stderr', async () => {
    const r = await run(['inspect', 'buscar', 'a', '--workspace', workspace('specification { node s }\nmodel { s a  a -> zz }')]);
    expect(r.exitCode).toBe(1);
    expect(r.stdout).toBe('');
    expect(r.stderr).toContain('E_DANGLING_EDGE');
  });
});
