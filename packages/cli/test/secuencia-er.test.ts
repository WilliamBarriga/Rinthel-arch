import { existsSync, mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

import { salidaDeInspectSchema } from 'canonico';
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

function workspace(texto = DG): string {
  const dir = mkdtempSync(join(tmpdir(), 'dg-sec-er-'));
  writeFileSync(join(dir, 'main.dg'), texto);
  return dir;
}

describe('CLI con secuencia y ER', () => {
  it('validate --json informa un codigo nuevo de secuencia', async () => {
    const r = await run(['validate', '--workspace', workspace(DG.replace('api -> db', 'api -> dbb')), '--json']);
    expect(r.exitCode).toBe(1);
    expect((JSON.parse(r.stdout) as { issues: { code: string }[] }).issues.map((i) => i.code)).toContain('E_UNKNOWN_LIFELINE');
  });

  it('validate --json informa un codigo nuevo de ER', async () => {
    const r = await run(['validate', '--workspace', workspace(DG.replace('"0..*"', '"0..n"')), '--json']);
    expect((JSON.parse(r.stdout) as { issues: { code: string }[] }).issues.map((i) => i.code)).toContain('E_ER_CARDINALITY');
  });

  it('build escribe geometria grafo (ER) y secuencia', async () => {
    const dir = workspace();
    const r = await run(['build', '--workspace', dir]);
    expect(r.exitCode).toBe(0);
    const leer = (v: string) => JSON.parse(readFileSync(join(dir, '.diagrams', 'geometria', `${v}.json`), 'utf8')) as { geometry: { kind: string; lifelines?: Record<string, unknown>; nodes: Record<string, unknown> } };
    expect(leer('er').geometry.kind).toBe('grafo');
    const sec = leer('flujo').geometry;
    expect(sec.kind).toBe('secuencia');
    expect(Object.keys(sec.lifelines ?? {}).sort()).toEqual(['api', 'cliente', 'db']);
    expect(existsSync(join(dir, '.diagrams', 'canonico.json'))).toBe(true);
  });

  it('inspect interaccion da id, titulo, items, Lifelines y Vistas', async () => {
    const r = await run(['inspect', 'interaccion', 'checkout', '--workspace', workspace(), '--json']);
    expect(r.exitCode).toBe(0);
    const salida = salidaDeInspectSchema.parse(JSON.parse(r.stdout));
    if (salida.comando !== 'interaccion') throw new Error('comando');
    expect(salida.interaccion).toMatchObject({ id: 'checkout', title: 'Checkout', items: 4, mensajes: 4, lifelines: ['cliente', 'api', 'db'] });
    expect(salida.interaccion.vistas.map((v) => v.id)).toEqual(['flujo']);
  });

  it('inspect interaccion en texto y con id inexistente sugiere', async () => {
    const texto = await run(['inspect', 'interaccion', 'checkout', '--workspace', workspace()]);
    expect(texto.stdout).toContain('checkout "Checkout" 4 items');
    expect(texto.stdout).toContain('Lifelines: cliente, api, db');
    const malo = await run(['inspect', 'interaccion', 'chekout', '--workspace', workspace()]);
    expect(malo.exitCode).toBe(1);
    expect(malo.stderr).toContain('checkout');
  });

  it('inspect buscar encuentra Interacciones y vista muestra su Interaccion', async () => {
    const b = await run(['inspect', 'buscar', 'check', '--workspace', workspace(), '--json']);
    const sb = salidaDeInspectSchema.parse(JSON.parse(b.stdout));
    if (sb.comando !== 'buscar') throw new Error('comando');
    expect(sb.resultados.map((x) => `${x.kind}:${x.id}`)).toContain('interaccion:checkout');
    const v = await run(['inspect', 'vista', 'flujo', '--workspace', workspace(), '--json']);
    const sv = salidaDeInspectSchema.parse(JSON.parse(v.stdout));
    if (sv.comando !== 'vista') throw new Error('comando');
    expect(sv.vista.type).toBe('sequence');
    expect(sv.vista.interaction).toBe('checkout');
    expect(sv.vista.nodos.map((n) => n.id)).toEqual(['cliente', 'api', 'db']);
  });

  it('skill documenta interaccion, secuencia y ER', async () => {
    const r = await run(['skill', '--workspace', workspace()]);
    expect(r.stdout).toContain('inspect interaccion');
    expect(r.stdout).toContain('E_ER_CARDINALITY');
    expect(r.stdout).toContain('sequence');
  });
});
