import { cpSync, existsSync, mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

import { CODES, validateOutputJsonSchema } from 'canonical';
import { compile } from 'dsl';
import { run } from 'cli';

const fixtures = join(import.meta.dirname, 'fixtures');

function workspace(fixture = 'build-basic'): string {
  const target = mkdtempSync(join(tmpdir(), 'skill-'));
  cpSync(join(fixtures, fixture), target, { recursive: true });
  return target;
}

async function generate(root: string): Promise<string> {
  const result = await run(['skill', '--workspace', root]);
  expect(result.exitCode).toBe(0);
  expect(result.stderr).toBe('');
  return result.stdout;
}

describe('skill', () => {
  it('is a skill with frontmatter and lists the Node kinds, Palette and Themes of the project', async () => {
    const skill = await generate(workspace());

    expect(skill.startsWith('---\nname: diagrams\ndescription: ')).toBe(true);
    expect(skill).toMatch(/\| `servicio` \|/);
    for (const color of ['gray', 'blue', 'green', 'amber', 'red', 'purple']) expect(skill).toContain(`\`${color}\``);
    expect(skill).toContain('`grande`');
    expect(skill).toContain('`neutral`');
  });

  it('lists every issue code with its description', async () => {
    const skill = await generate(workspace());

    for (const code of Object.values(CODES)) expect(skill).toContain(`\`${code}\``);
  });

  it('describes the validate contract: fields, exit codes, fix and the JSON Schema', async () => {
    const skill = await generate(workspace());

    expect(skill).toMatch(/\| 0 \|/);
    expect(skill).toMatch(/\| 1 \|/);
    expect(skill).toMatch(/\| 2 \|/);
    expect(skill).toContain('validate --workspace');
    expect(skill).toContain('diagrams skill --workspace');
    expect(skill).toContain('--json');
    expect(skill).toContain('`fix`');
    const block = /```json\n([\s\S]*?)\n```/.exec(skill)?.[1];
    expect(JSON.parse(block ?? 'null')).toEqual(validateOutputJsonSchema());
  });

  it('the skill syntax covers extend, style, steps and link', async () => {
    const skill = await generate(workspace());

    for (const word of ['extend', 'style', 'steps', 'link']) expect(skill).toContain(`\`${word}`);
  });

  it('the DSL example of the skill compiles without issues', async () => {
    const skill = await generate(workspace());

    const example = /```dg\n([\s\S]*?)\n```/.exec(skill)?.[1];
    expect(example).toBeDefined();
    expect(compile({ 'ejemplo.dg': example as string }).issues).toEqual([]);
  });

  it('regenerating after changing the catalog updates the skill; the same catalog gives the same bytes', async () => {
    const root = workspace();
    const before = await generate(root);
    expect(await generate(root)).toBe(before);
    expect(before).not.toContain('`cola`');

    const main = readFileSync(join(root, 'main.dg'), 'utf8');
    writeFileSync(join(root, 'main.dg'), main.replace('node servicio\n', 'node servicio\n  node cola { description "Cola de mensajes" color amber }\n'));
    const after = await generate(root);

    expect(after).toMatch(/\| `cola` \| Cola de mensajes \|/);
    expect(after).not.toBe(before);
  });

  it('--out writes the skill to the requested file and not to stdout', async () => {
    const root = workspace();
    const output = join(mkdtempSync(join(tmpdir(), 'skill-out-')), 'SKILL.md');

    const result = await run(['skill', '--workspace', root, '--out', output]);

    expect(result.exitCode).toBe(0);
    expect(result.stdout).toContain('SKILL.md');
    expect(readFileSync(output, 'utf8').startsWith('---\nname: diagrams')).toBe(true);
    expect(existsSync(join(root, '.diagrams'))).toBe(false);
  });

  it('a Workspace with errors generates no skill: exits 1 with the issues', async () => {
    const result = await run(['skill', '--workspace', workspace('with-errors')]);

    expect(result.exitCode).toBe(1);
    expect(result.stdout).toContain('error');
    expect(result.stdout).not.toContain('name: diagrams');
  });
});
