import { mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

import { validateOutputSchema } from 'canonical';
import { run } from 'cli';

const WORKSPACE = (mark: string): string => `specification {
  node service
  node table
}

model {
  service shop "Shop" "The store"${mark} {
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

async function validateCommand(root: string) {
  const r = await run(['validate', '--workspace', root, '--json']);
  return { ...r, output: validateOutputSchema.parse(JSON.parse(r.stdout)) };
}

function workspace(contents: string): string {
  const root = mkdtempSync(join(tmpdir(), 'validate-planned-'));
  writeFileSync(join(root, 'main.dg'), contents);
  return root;
}

describe('validate: planned mark', () => {
  it('planned Edges, Attributes and Interactions validate clean', async () => {
    const { exitCode, output } = await validateCommand(workspace(WORKSPACE('')));
    expect(output.issues).toEqual([]);
    expect(exitCode).toBe(0);
  });

  it('a real Node under a planned Group is an error whose fix removes the mark, and the Workspace ends clean', async () => {
    const root = workspace(WORKSPACE(' planned'));
    const { exitCode, output } = await validateCommand(root);

    expect(exitCode).toBe(1);
    expect(output.issues.map((i) => i.code)).toEqual(['real-node-in-planned-group']);
    const [issue] = output.issues;
    expect(issue).toMatchObject({ severity: 'error', file: 'main.dg', line: 7 });
    expect(issue?.message).toContain("'shop.api'");
    expect(issue?.message).toContain("'shop'");
    expect(issue?.related?.[0]).toMatchObject({ file: 'main.dg', line: 8 });
    expect(issue?.fix?.replacement).toBe('');

    const r = await run(['edit', '--workspace', root, '--edits', JSON.stringify([issue?.fix])]);
    expect(r.exitCode, r.stderr).toBe(0);
    expect(readFileSync(join(root, 'main.dg'), 'utf8')).toContain('  service shop "Shop" "The store" {\n');
    expect((await validateCommand(root)).output.issues).toEqual([]);
  });

  it('reports the Group once even with several real descendants, naming the first', async () => {
    const text = WORKSPACE(' planned').replace('service cart "Cart"', 'service cart "Cart" {\n      source { path "src/cart" }\n    }');
    const { output } = await validateCommand(workspace(text));
    expect(output.issues.map((i) => i.code)).toEqual(['real-node-in-planned-group']);
    expect(output.issues[0]?.message).toContain('2 real Nodes');
  });

  it('warns planned-with-path on a planned Node that also has a Source path, and its fix removes the mark', async () => {
    const text = WORKSPACE('').replace('service cart "Cart"', 'service cart "Cart" planned {\n      source { path "src/cart" spec "prd#cart" }\n    }');
    const root = workspace(text);
    const { exitCode, output } = await validateCommand(root);

    expect(exitCode).toBe(0);
    expect(output.issues.map((i) => [i.code, i.severity])).toEqual([['planned-with-path', 'warning']]);
    const [issue] = output.issues;
    expect(issue?.message).toContain("'shop.cart'");
    expect(issue?.fix?.replacement).toBe('');

    const r = await run(['edit', '--workspace', root, '--edits', JSON.stringify([issue?.fix])]);
    expect(r.exitCode, r.stderr).toBe(0);
    expect(readFileSync(join(root, 'main.dg'), 'utf8')).toContain('service cart "Cart" {');
    expect((await validateCommand(root)).output.issues).toEqual([]);
  });
});

describe('validate: Source kinds', () => {
  it('the mistaken form `kind "spec" ref "..."` warns unknown-source-kind on both entries; `spec "..."` is clean', async () => {
    const base = (source: string) => `specification {\n  node service\n}\n\nmodel {\n  service pay "Pay" planned {\n    ${source}\n  }\n}\n`;
    const invalid = await validateCommand(workspace(base('source { kind "spec"  ref "prd.md#1" }')));
    expect(invalid.exitCode).toBe(0);
    expect(invalid.output.issues.map((i) => [i.code, i.severity, i.message.split("'")[1]])).toEqual([
      ['unknown-source-kind', 'warning', 'kind'],
      ['unknown-source-kind', 'warning', 'ref'],
    ]);

    const valid = await validateCommand(workspace(base('source { spec "prd.md#1" }')));
    expect(valid.output.issues).toEqual([]);
  });
});
