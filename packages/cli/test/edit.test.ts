import { mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

import { EDIT_CONTRACT_VERSION, salidaDeEditSchema } from 'canonico';
import { run } from 'cli';
import { hashDeContenido } from 'sesion';

const DG = `specification { node servicio }
model {
  servicio a "A"
  servicio b "B"
}
view general {
  type architecture
  include **
  node a { pin 10,20 }
}
`;

function workspace(texto = DG): string {
  const raiz = mkdtempSync(join(tmpdir(), 'edit-'));
  writeFileSync(join(raiz, 'main.dg'), texto);
  return raiz;
}
const leer = (raiz: string) => readFileSync(join(raiz, 'main.dg'), 'utf8');
const pin = (vista: string, nodo: string, x: string, y: string) => ['--view', vista, '--node', nodo, '--x', x, '--y', y];

describe('edit pin', () => {
  it('reemplaza un Pin existente y escribe solo el DSL', async () => {
    const raiz = workspace();
    const r = await run(['edit', '--workspace', raiz, ...pin('general', 'a', '30', '40'), '--json']);
    expect(r.exitCode).toBe(0);
    const salida = salidaDeEditSchema.parse(JSON.parse(r.stdout));
    expect(salida).toMatchObject({ contractVersion: EDIT_CONTRACT_VERSION, ok: true, files: ['main.dg'] });
    expect(leer(raiz)).toBe(DG.replace('pin 10,20', 'pin 30,40'));
  });

  it('inserta el Pin de un Nodo que no lo tenia', async () => {
    const raiz = workspace();
    const r = await run(['edit', '--workspace', raiz, ...pin('general', 'b', '5', '6')]);
    expect(r.exitCode).toBe(0);
    expect(leer(raiz)).toContain('node b { pin 5,6 }');
  });

  it('rechaza un hash desactualizado con codigo 1 y sin escribir', async () => {
    const raiz = workspace();
    const r = await run(['edit', '--workspace', raiz, ...pin('general', 'a', '1', '2'), '--hash', 'main.dg=000', '--json']);
    expect(r.exitCode).toBe(1);
    expect(salidaDeEditSchema.parse(JSON.parse(r.stdout))).toMatchObject({ ok: false, reason: 'hash-desactualizado' });
    expect(leer(raiz)).toBe(DG);
  });

  it('acepta un hash vigente', async () => {
    const raiz = workspace();
    const r = await run(['edit', '--workspace', raiz, ...pin('general', 'a', '1', '2'), '--hash', `main.dg=${hashDeContenido(DG)}`]);
    expect(r.exitCode).toBe(0);
  });

  it('Vista o Nodo inexistente: codigo 1, texto en stderr sin --json', async () => {
    const raiz = workspace();
    const v = await run(['edit', '--workspace', raiz, ...pin('nada', 'a', '1', '2')]);
    expect(v).toMatchObject({ exitCode: 1, stdout: '' });
    expect(v.stderr).toContain('nada');
    const n = await run(['edit', '--workspace', raiz, ...pin('general', 'zzz', '1', '2')]);
    expect(n.exitCode).toBe(1);
    expect(leer(raiz)).toBe(DG);
  });

  it('fallos de uso: codigo 2', async () => {
    const raiz = workspace();
    expect((await run(['edit', ...pin('general', 'a', '1', '2')])).exitCode).toBe(2);
    expect((await run(['edit', '--workspace', raiz])).exitCode).toBe(2);
    expect((await run(['edit', '--workspace', raiz, ...pin('general', 'a', 'x', '2')])).exitCode).toBe(2);
    expect((await run(['edit', '--workspace', raiz, ...pin('general', 'a', '1', '2'), '--edits', '[]'])).exitCode).toBe(2);
    expect((await run(['edit', '--workspace', join(raiz, 'no-existe'), ...pin('general', 'a', '1', '2')])).exitCode).toBe(2);
  });
});

describe('edit --edits', () => {
  const edicion = (replacement: string, extra = {}) => ({
    file: 'main.dg',
    range: { start: { line: 3, column: 14 }, end: { line: 3, column: 17 } },
    replacement,
    ...extra,
  });

  it('aplica ediciones ya calculadas (p. ej. el fix de un issue)', async () => {
    const raiz = workspace();
    const r = await run(['edit', '--workspace', raiz, '--edits', JSON.stringify([edicion('"Z"')]), '--json']);
    expect(r.exitCode).toBe(0);
    expect(leer(raiz)).toContain('servicio a "Z"');
  });

  it('rechaza la edicion que introduce un error, sin escribir', async () => {
    const raiz = workspace();
    const r = await run(['edit', '--workspace', raiz, '--edits', JSON.stringify([edicion('{{{')]), '--json']);
    expect(r.exitCode).toBe(1);
    expect(salidaDeEditSchema.parse(JSON.parse(r.stdout))).toMatchObject({ ok: false, reason: 'invalida' });
    expect(leer(raiz)).toBe(DG);
  });

  it('respeta el hash de cada edicion y rechaza JSON malformado con codigo 2', async () => {
    const raiz = workspace();
    const r = await run(['edit', '--workspace', raiz, '--edits', JSON.stringify([edicion('"Z"', { hash: 'viejo' })]), '--json']);
    expect(r.exitCode).toBe(1);
    expect(leer(raiz)).toBe(DG);
    expect((await run(['edit', '--workspace', raiz, '--edits', 'no es json'])).exitCode).toBe(2);
    expect((await run(['edit', '--workspace', raiz, '--edits', '[{"file":1}]'])).exitCode).toBe(2);
  });

  it('cada motivo de rechazo restante (archivo, rango, solape) sale con codigo 1, su reason y sin escribir', async () => {
    const raiz = workspace();
    const casos: [string, unknown[]][] = [
      ['archivo-desconocido', [edicion('x', { file: 'otro.dg' })]],
      ['rango-invalido', [edicion('x', { range: { start: { line: 99, column: 1 }, end: { line: 99, column: 2 } } })]],
      ['ediciones-solapadas', [edicion('"Y"'), edicion('"Z"')]],
    ];

    for (const [reason, ediciones] of casos) {
      const r = await run(['edit', '--workspace', raiz, '--edits', JSON.stringify(ediciones), '--json']);

      expect(r.exitCode, reason).toBe(1);
      expect(salidaDeEditSchema.parse(JSON.parse(r.stdout)), reason).toMatchObject({ ok: false, reason });
      expect(leer(raiz)).toBe(DG);
    }
  });
});
