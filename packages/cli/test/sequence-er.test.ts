import { existsSync, mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

import { inspectOutputSchema } from 'canonical';
import { run } from 'cli';

const DG = `specification { node servicio  node entidad }
model {
  servicio cliente "Cliente"
  servicio api "API"
  servicio db "Base"
  entidad pedido "Pedido" { attrs { id: uuid pk } }
  entidad linea "Linea" { attrs { id: uuid pk  pedido_id: uuid fk } }
  pedido "1" -> "0..*" linea "tiene"
  interaction checkout "Checkout" {
    cliente -> api "pedir"
    alt "hay stock" {
      api -> db "reservar"
    } else "sin stock" {
      api -> cliente "agotado"
    }
    note over api "revisar"
    reply api -> cliente "ok"
  }
}
view flujo { type sequence
 interaction checkout }
view er { type er
 include ** }
`;

function workspace(text = DG): string {
  const dir = mkdtempSync(join(tmpdir(), 'dg-seq-er-'));
  writeFileSync(join(dir, 'main.dg'), text);
  return dir;
}

describe('CLI with sequence and ER', () => {
  it('validate --json reports a new sequence code', async () => {
    const r = await run(['validate', '--workspace', workspace(DG.replace('api -> db', 'api -> dbb')), '--json']);
    expect(r.exitCode).toBe(1);
    expect((JSON.parse(r.stdout) as { issues: { code: string }[] }).issues.map((i) => i.code)).toContain('unknown-lifeline');
  });

  it('validate --json reports a new ER code', async () => {
    const r = await run(['validate', '--workspace', workspace(DG.replace('"0..*"', '"0..n"')), '--json']);
    expect((JSON.parse(r.stdout) as { issues: { code: string }[] }).issues.map((i) => i.code)).toContain('er-cardinality');
  });

  it('build writes graph (ER) and sequence geometry', async () => {
    const dir = workspace();
    const r = await run(['build', '--workspace', dir]);
    expect(r.exitCode).toBe(0);
    const read = (v: string) => JSON.parse(readFileSync(join(dir, '.diagrams', 'geometria', `${v}.json`), 'utf8')) as { geometry: { kind: string; lifelines?: Record<string, unknown>; nodes: Record<string, unknown> } };
    expect(read('er').geometry.kind).toBe('grafo');
    const seq = read('flujo').geometry;
    expect(seq.kind).toBe('secuencia');
    expect(Object.keys(seq.lifelines ?? {}).sort()).toEqual(['api', 'cliente', 'db']);
    expect(existsSync(join(dir, '.diagrams', 'canonico.json'))).toBe(true);
  });

  it('inspect interaction gives id, title, items, Lifelines and Views', async () => {
    const r = await run(['inspect', 'interaction', 'checkout', '--workspace', workspace(), '--json']);
    expect(r.exitCode).toBe(0);
    const output = inspectOutputSchema.parse(JSON.parse(r.stdout));
    if (output.command !== 'interaction') throw new Error('command');
    expect(output.interaction).toMatchObject({ id: 'checkout', title: 'Checkout', items: 4, messages: 4, lifelines: ['cliente', 'api', 'db'] });
    expect(output.interaction.views.map((v) => v.id)).toEqual(['flujo']);
  });

  it('inspect interaction in text, and with a missing id it suggests', async () => {
    const text = await run(['inspect', 'interaction', 'checkout', '--workspace', workspace()]);
    expect(text.stdout).toContain('checkout "Checkout" 4 items');
    expect(text.stdout).toContain('Lifelines: cliente, api, db');
    const bad = await run(['inspect', 'interaction', 'chekout', '--workspace', workspace()]);
    expect(bad.exitCode).toBe(1);
    expect(bad.stderr).toContain('checkout');
  });

  it('inspect search finds Interactions and view shows its Interaction', async () => {
    const b = await run(['inspect', 'search', 'check', '--workspace', workspace(), '--json']);
    const sb = inspectOutputSchema.parse(JSON.parse(b.stdout));
    if (sb.command !== 'search') throw new Error('command');
    expect(sb.results.map((x) => `${x.kind}:${x.id}`)).toContain('interaction:checkout');
    const v = await run(['inspect', 'view', 'flujo', '--workspace', workspace(), '--json']);
    const sv = inspectOutputSchema.parse(JSON.parse(v.stdout));
    if (sv.command !== 'view') throw new Error('command');
    expect(sv.view.type).toBe('sequence');
    expect(sv.view.interaction).toBe('checkout');
    expect(sv.view.nodes.map((n) => n.id)).toEqual(['cliente', 'api', 'db']);
  });

  it('skill documents interaction, sequence and ER', async () => {
    const r = await run(['skill', '--workspace', workspace()]);
    expect(r.stdout).toContain('inspect interaction');
    expect(r.stdout).toContain('er-cardinality');
    expect(r.stdout).toContain('sequence');
  });
});
