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
    expect(salidaDeEditSchema.parse(JSON.parse(r.stdout))).toMatchObject({ ok: false, reason: 'stale-hash' });
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
    expect(salidaDeEditSchema.parse(JSON.parse(r.stdout))).toMatchObject({ ok: false, reason: 'invalid' });
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
      ['unknown-file', [edicion('x', { file: 'otro.dg' })]],
      ['invalid-range', [edicion('x', { range: { start: { line: 99, column: 1 }, end: { line: 99, column: 2 } } })]],
      ['overlapping-edits', [edicion('"Y"'), edicion('"Z"')]],
    ];

    for (const [reason, ediciones] of casos) {
      const r = await run(['edit', '--workspace', raiz, '--edits', JSON.stringify(ediciones), '--json']);

      expect(r.exitCode, reason).toBe(1);
      expect(salidaDeEditSchema.parse(JSON.parse(r.stdout)), reason).toMatchObject({ ok: false, reason });
      expect(leer(raiz)).toBe(DG);
    }
  });
});

describe('edit --intent (reorder-lifelines)', () => {
  const SEC = `specification { node servicio }
model {
  servicio cliente
  servicio api
  servicio db
  interaction i {
    cliente -> api "pedir"
    api -> db "leer"
  }
}
view flujo {
  type sequence
  interaction i
}
`;
  const intent = (orden: string[], extra: object = {}) => JSON.stringify({ tipo: 'reorder-lifelines', vista: 'flujo', orden, ...extra });

  it('aplica la Intencion por su contrato JSON y escribe el order', async () => {
    const raiz = workspace(SEC);
    const r = await run(['edit', '--workspace', raiz, '--intent', intent(['db', 'cliente', 'api']), '--json']);
    expect(r.exitCode).toBe(0);
    expect(salidaDeEditSchema.parse(JSON.parse(r.stdout))).toMatchObject({ ok: true, files: ['main.dg'] });
    expect(leer(raiz)).toBe(SEC.replace('  interaction i\n}', '  interaction i\n  order db, cliente, api\n}'));
  });

  it('ignora un hash heredado en el JSON', async () => {
    const raiz = workspace(SEC);
    const r = await run(['edit', '--workspace', raiz, '--intent', intent(['db', 'cliente', 'api'], { hash: '000' })]);
    expect(r.exitCode).toBe(0);
    expect(leer(raiz)).toContain('order db, cliente, api');
  });

  it('con --hash viejo del archivo rechaza con codigo 1 y sin escribir', async () => {
    const raiz = workspace(SEC);
    const r = await run(['edit', '--workspace', raiz, '--intent', intent(['db']), '--hash', 'main.dg=000', '--json']);
    expect(r.exitCode).toBe(1);
    expect(salidaDeEditSchema.parse(JSON.parse(r.stdout))).toMatchObject({ ok: false, reason: 'stale-hash' });
    expect(leer(raiz)).toBe(SEC);
  });

  it('una Intencion mal formada es un fallo de uso', async () => {
    const r = await run(['edit', '--workspace', workspace(SEC), '--intent', '{"tipo":"nada"}']);
    expect(r.exitCode).toBe(2);
  });
});

describe('edit --intent (set-theme)', () => {
  const fijar = (tema?: string) => JSON.stringify({ tipo: 'set-theme', vista: 'general', ...(tema !== undefined && { tema }) });

  it('escribe theme como primera linea de la Vista con un Tema de --theme-path, y sin tema lo quita', async () => {
    const raiz = workspace();
    const temas = mkdtempSync(join(tmpdir(), 'temas-'));
    writeFileSync(join(temas, 'claro.dg'), 'theme claro extends neutral { palette { acento "#0ea5e9" } }\n');

    const r = await run(['edit', '--workspace', raiz, '--theme-path', temas, '--intent', fijar('claro'), '--json']);
    expect(r.exitCode).toBe(0);
    expect(salidaDeEditSchema.parse(JSON.parse(r.stdout))).toMatchObject({ ok: true, files: ['main.dg'] });
    expect(leer(raiz)).toBe(DG.replace('view general {\n', 'view general {\n  theme claro\n'));

    expect((await run(['edit', '--workspace', raiz, '--theme-path', temas, '--intent', fijar()])).exitCode).toBe(0);
    expect(leer(raiz)).toBe(DG);
  });

  it('un Tema no declarado sale con 1 y reason unknown-theme, sin escribir', async () => {
    const raiz = workspace();
    const r = await run(['edit', '--workspace', raiz, '--intent', fijar('neutro'), '--json']);
    expect(r.exitCode).toBe(1);
    expect(salidaDeEditSchema.parse(JSON.parse(r.stdout))).toMatchObject({ ok: false, reason: 'unknown-theme' });
    expect(leer(raiz)).toBe(DG);
  });

  it('--help nombra la Intencion set-theme y su rechazo', async () => {
    const r = await run(['edit', '--help']);
    expect(r.stdout).toContain('"tipo":"set-theme"');
    expect(r.stdout).toContain('unknown-theme');
  });
});

describe('edit: puerta de escritura unica', () => {
  const salidaJson = (r: { stdout: string }) => JSON.parse(r.stdout) as unknown;

  it('los tres modos dan la misma salida de texto y JSON', async () => {
    const pinTexto = await run(['edit', '--workspace', workspace(), ...pin('general', 'a', '30', '40')]);
    expect(pinTexto).toEqual({ exitCode: 0, stdout: '1 archivo(s) editado(s): main.dg\n', stderr: '' });

    const pinJson = await run(['edit', '--workspace', workspace(), ...pin('general', 'b', '5', '6'), '--json']);
    expect(salidaJson(pinJson)).toEqual({
      contractVersion: EDIT_CONTRACT_VERSION,
      ok: true,
      edits: [{ file: 'main.dg', range: { start: { line: 10, column: 1 }, end: { line: 10, column: 1 } }, replacement: '  node b { pin 5,6 }\n' }],
      files: ['main.dg'],
    });

    const rango = { start: { line: 3, column: 14 }, end: { line: 3, column: 17 } };
    const edits = await run(['edit', '--workspace', workspace(), '--edits', JSON.stringify([{ file: 'main.dg', range: rango, replacement: '"Z"' }]), '--json']);
    expect(salidaJson(edits)).toEqual({ contractVersion: EDIT_CONTRACT_VERSION, ok: true, edits: [{ file: 'main.dg', range: rango, replacement: '"Z"' }], files: ['main.dg'] });

    const intent = await run(['edit', '--workspace', workspace(), '--intent', JSON.stringify({ tipo: 'move-pin', vista: 'general', nodo: 'a', x: 1, y: 2 }), '--json']);
    expect(salidaJson(intent)).toEqual({
      contractVersion: EDIT_CONTRACT_VERSION,
      ok: true,
      edits: [{ file: 'main.dg', range: { start: { line: 9, column: 12 }, end: { line: 9, column: 21 } }, replacement: 'pin 1,2' }],
      files: ['main.dg'],
    });

    const rechazo = await run(['edit', '--workspace', workspace(), ...pin('nada', 'a', '1', '2')]);
    expect(rechazo).toEqual({ exitCode: 1, stdout: '', stderr: "Edit rejected (unknown-view): View 'nada' does not exist\n" });
  });

  describe('no escribe archivos de --theme-path: unknown-file', () => {
    const [modelo, vistas] = DG.split('\nview general');
    const conTemas = () => {
      const raiz = workspace(`${modelo as string}\n`);
      const temas = mkdtempSync(join(tmpdir(), 'edit-temas-'));
      writeFileSync(join(temas, 'vistas.dg'), `view general${vistas as string}`);
      return { raiz, temas, vistas: () => readFileSync(join(temas, 'vistas.dg'), 'utf8') };
    };
    const casos: [string, string[]][] = [
      ['flags de Pin', pin('general', 'a', '1', '2')],
      ['--intent', ['--intent', JSON.stringify({ tipo: 'move-pin', vista: 'general', nodo: 'b', x: 1, y: 2 })]],
      ['--edits', ['--edits', JSON.stringify([{ file: 'vistas.dg', range: { start: { line: 1, column: 1 }, end: { line: 1, column: 1 } }, replacement: '\n' }])]],
    ];
    it.each(casos)('%s', async (_modo, args) => {
      const ws = conTemas();
      const antes = ws.vistas();
      const r = await run(['edit', '--workspace', ws.raiz, '--theme-path', ws.temas, ...args, '--json']);
      expect(r.exitCode).toBe(1);
      expect(salidaDeEditSchema.parse(JSON.parse(r.stdout))).toMatchObject({ ok: false, reason: 'unknown-file', file: 'vistas.dg' });
      expect(ws.vistas()).toBe(antes);
    });
  });
});
