import { cpSync, existsSync, mkdtempSync, readdirSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

import { run } from 'cli';

const VIEWS = ['datos', 'detalle', 'general'];

describe('e2e: CLI over a medium Workspace', () => {
  it('validate, build and skill', async () => {
    const workspace = mkdtempSync(join(tmpdir(), 'e2e-'));
    cpSync(join(import.meta.dirname, 'fixtures', 'medium'), workspace, { recursive: true });
    const ws = ['--workspace', workspace];

    const validation = await run(['validate', ...ws, '--json']);
    expect(validation.exitCode, validation.stdout).toBe(0);
    expect(JSON.parse(validation.stdout)).toMatchObject({ ok: true });

    const construction = await run(['build', ...ws]);
    expect(construction.exitCode, construction.stdout).toBe(0);
    expect(readdirSync(join(workspace, '.diagrams', 'geometria')).sort()).toEqual(VIEWS.map((v) => `${v}.json`));

    const output = join(workspace, 'skill', 'SKILL.md');
    const skill = await run(['skill', ...ws]);
    expect(skill.exitCode).toBe(0);
    expect(skill.stdout).toContain('servicio');
    expect(skill.stdout).toContain('corporativo');
    expect((await run(['skill', ...ws, '--out', output])).exitCode).toBe(0);
    expect(existsSync(output)).toBe(true);
    expect(readFileSync(output, 'utf8')).toBe(skill.stdout);
  }, 60_000);
});
