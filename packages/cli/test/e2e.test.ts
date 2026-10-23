import { cpSync, existsSync, mkdtempSync, readdirSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

import { run } from 'cli';

const VISTAS = ['datos', 'detalle', 'general'];

describe('e2e: CLI sobre un Workspace mediano', () => {
  it('validate, build y skill', async () => {
    const workspace = mkdtempSync(join(tmpdir(), 'e2e-'));
    cpSync(join(import.meta.dirname, 'fixtures', 'mediano'), workspace, { recursive: true });
    const ws = ['--workspace', workspace];

    const validacion = await run(['validate', ...ws, '--json']);
    expect(validacion.exitCode, validacion.stdout).toBe(0);
    expect(JSON.parse(validacion.stdout)).toMatchObject({ ok: true });

    const construccion = await run(['build', ...ws]);
    expect(construccion.exitCode, construccion.stdout).toBe(0);
    expect(readdirSync(join(workspace, '.diagrams', 'geometria')).sort()).toEqual(VISTAS.map((v) => `${v}.json`));

    const salida = join(workspace, 'skill', 'SKILL.md');
    const skill = await run(['skill', ...ws]);
    expect(skill.exitCode).toBe(0);
    expect(skill.stdout).toContain('servicio');
    expect(skill.stdout).toContain('corporativo');
    expect((await run(['skill', ...ws, '--out', salida])).exitCode).toBe(0);
    expect(existsSync(salida)).toBe(true);
    expect(readFileSync(salida, 'utf8')).toBe(skill.stdout);
  }, 60_000);
});
