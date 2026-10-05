import { cpSync, existsSync, mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

import { CODIGOS, salidaDeValidateJsonSchema } from 'canonico';
import { compile } from 'dsl';
import { run } from 'cli';

const fixtures = join(import.meta.dirname, 'fixtures');

function workspace(fixture = 'build-basico'): string {
  const destino = mkdtempSync(join(tmpdir(), 'skill-'));
  cpSync(join(fixtures, fixture), destino, { recursive: true });
  return destino;
}

async function generar(raiz: string): Promise<string> {
  const resultado = await run(['skill', '--workspace', raiz]);
  expect(resultado.exitCode).toBe(0);
  expect(resultado.stderr).toBe('');
  return resultado.stdout;
}

describe('skill', () => {
  it('es un skill con frontmatter y lista Tipos de nodo, Paleta y Temas del proyecto', async () => {
    const skill = await generar(workspace());

    expect(skill.startsWith('---\nname: diagrams\ndescription: ')).toBe(true);
    expect(skill).toMatch(/\| `servicio` \|/);
    for (const color of ['gray', 'blue', 'green', 'amber', 'red', 'purple']) expect(skill).toContain(`\`${color}\``);
    expect(skill).toContain('`grande`');
    expect(skill).toContain('`neutral`');
  });

  it('lista todos los codigos de issue con su descripcion', async () => {
    const skill = await generar(workspace());

    for (const codigo of Object.values(CODIGOS)) expect(skill).toContain(`\`${codigo}\``);
  });

  it('describe el contrato de validate: campos, codigos de salida, fix y el JSON Schema', async () => {
    const skill = await generar(workspace());

    expect(skill).toMatch(/\| 0 \|/);
    expect(skill).toMatch(/\| 1 \|/);
    expect(skill).toMatch(/\| 2 \|/);
    expect(skill).toContain('validate --workspace');
    expect(skill).toContain('--json');
    expect(skill).toContain('`fix`');
    const bloque = /```json\n([\s\S]*?)\n```/.exec(skill)?.[1];
    expect(JSON.parse(bloque ?? 'null')).toEqual(salidaDeValidateJsonSchema());
  });

  it('el ejemplo de DSL del skill compila sin issues', async () => {
    const skill = await generar(workspace());

    const ejemplo = /```dg\n([\s\S]*?)\n```/.exec(skill)?.[1];
    expect(ejemplo).toBeDefined();
    expect(compile({ 'ejemplo.dg': ejemplo as string }).issues).toEqual([]);
  });

  it('regenerar tras cambiar el catalogo actualiza el skill; el mismo catalogo da los mismos bytes', async () => {
    const raiz = workspace();
    const antes = await generar(raiz);
    expect(await generar(raiz)).toBe(antes);
    expect(antes).not.toContain('`cola`');

    const principal = readFileSync(join(raiz, 'main.dg'), 'utf8');
    writeFileSync(join(raiz, 'main.dg'), principal.replace('node servicio\n', 'node servicio\n  node cola { description "Cola de mensajes" color amber }\n'));
    const despues = await generar(raiz);

    expect(despues).toMatch(/\| `cola` \| Cola de mensajes \|/);
    expect(despues).not.toBe(antes);
  });

  it('--out escribe el skill en el archivo pedido y no en stdout', async () => {
    const raiz = workspace();
    const salida = join(mkdtempSync(join(tmpdir(), 'skill-out-')), 'SKILL.md');

    const resultado = await run(['skill', '--workspace', raiz, '--out', salida]);

    expect(resultado.exitCode).toBe(0);
    expect(resultado.stdout).toContain('SKILL.md');
    expect(readFileSync(salida, 'utf8').startsWith('---\nname: diagrams')).toBe(true);
    expect(existsSync(join(raiz, '.diagrams'))).toBe(false);
  });

  it('un Workspace con errores no genera skill: sale 1 con los issues', async () => {
    const resultado = await run(['skill', '--workspace', workspace('con-errores')]);

    expect(resultado.exitCode).toBe(1);
    expect(resultado.stdout).toContain('error');
    expect(resultado.stdout).not.toContain('name: diagrams');
  });
});
