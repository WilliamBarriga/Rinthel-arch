import { mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

import { salidaDeValidateSchema } from 'canonico';
import { run } from 'cli';

const WORKSPACE = (marca: string): string => `specification {
  node service
  node table
}

model {
  service shop "Shop" "The store"${marca} {
    service api "API" {
      source { path "src/api" }
    }
    service cart "Cart"
  }
  table orders "Orders" {
    id: uuid pk
    coupon: text fk planned "From the PRD"
  }
  shop.api -> shop.cart "adds" planned
  interaction pay "Pay" planned {
    shop.api -> shop.cart
  }
}

view all {
  type architecture
  include **
}

view paying {
  type sequence
  interaction pay
}
`;

async function validar(raiz: string) {
  const r = await run(['validate', '--workspace', raiz, '--json']);
  return { ...r, salida: salidaDeValidateSchema.parse(JSON.parse(r.stdout)) };
}

function workspace(contenido: string): string {
  const raiz = mkdtempSync(join(tmpdir(), 'validate-planned-'));
  writeFileSync(join(raiz, 'main.dg'), contenido);
  return raiz;
}

describe('validate: planned mark', () => {
  it('planned Edges, Attributes and Interactions validate clean', async () => {
    const { exitCode, salida } = await validar(workspace(WORKSPACE('')));
    expect(salida.issues).toEqual([]);
    expect(exitCode).toBe(0);
  });

  it('a real Node under a planned Group is an error whose fix removes the mark, and the Workspace ends clean', async () => {
    const raiz = workspace(WORKSPACE(' planned'));
    const { exitCode, salida } = await validar(raiz);

    expect(exitCode).toBe(1);
    expect(salida.issues.map((i) => i.code)).toEqual(['real-node-in-planned-group']);
    const [issue] = salida.issues;
    expect(issue).toMatchObject({ severity: 'error', file: 'main.dg', line: 7 });
    expect(issue?.message).toContain("'shop.api'");
    expect(issue?.message).toContain("'shop'");
    expect(issue?.related?.[0]).toMatchObject({ file: 'main.dg', line: 8 });
    expect(issue?.fix?.replacement).toBe('');

    const r = await run(['edit', '--workspace', raiz, '--edits', JSON.stringify([issue?.fix])]);
    expect(r.exitCode, r.stderr).toBe(0);
    expect(readFileSync(join(raiz, 'main.dg'), 'utf8')).toContain('  service shop "Shop" "The store" {\n');
    expect((await validar(raiz)).salida.issues).toEqual([]);
  });

  it('reports the Group once even with several real descendants, naming the first', async () => {
    const texto = WORKSPACE(' planned').replace('service cart "Cart"', 'service cart "Cart" {\n      source { path "src/cart" }\n    }');
    const { salida } = await validar(workspace(texto));
    expect(salida.issues.map((i) => i.code)).toEqual(['real-node-in-planned-group']);
    expect(salida.issues[0]?.message).toContain('2 real Nodes');
  });

  it('warns planned-with-path on a planned Node that also has a Source path, and its fix removes the mark', async () => {
    const texto = WORKSPACE('').replace('service cart "Cart"', 'service cart "Cart" planned {\n      source { path "src/cart" spec "prd#cart" }\n    }');
    const raiz = workspace(texto);
    const { exitCode, salida } = await validar(raiz);

    expect(exitCode).toBe(0);
    expect(salida.issues.map((i) => [i.code, i.severity])).toEqual([['planned-with-path', 'warning']]);
    const [issue] = salida.issues;
    expect(issue?.message).toContain("'shop.cart'");
    expect(issue?.fix?.replacement).toBe('');

    const r = await run(['edit', '--workspace', raiz, '--edits', JSON.stringify([issue?.fix])]);
    expect(r.exitCode, r.stderr).toBe(0);
    expect(readFileSync(join(raiz, 'main.dg'), 'utf8')).toContain('service cart "Cart" {');
    expect((await validar(raiz)).salida.issues).toEqual([]);
  });
});

describe('validate: Source kinds', () => {
  it('the mistaken form `kind "spec" ref "..."` warns unknown-source-kind on both entries; `spec "..."` is clean', async () => {
    const base = (fuente: string) => `specification {\n  node service\n}\n\nmodel {\n  service pay "Pay" planned {\n    ${fuente}\n  }\n}\n`;
    const mal = await validar(workspace(base('source { kind "spec"  ref "prd.md#1" }')));
    expect(mal.exitCode).toBe(0);
    expect(mal.salida.issues.map((i) => [i.code, i.severity, i.message.split("'")[1]])).toEqual([
      ['unknown-source-kind', 'warning', 'kind'],
      ['unknown-source-kind', 'warning', 'ref'],
    ]);

    const bien = await validar(workspace(base('source { spec "prd.md#1" }')));
    expect(bien.salida.issues).toEqual([]);
  });
});
