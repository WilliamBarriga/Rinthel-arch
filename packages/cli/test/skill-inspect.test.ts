import { cpSync, mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

import { EDIT_CONTRACT_VERSION, INSPECT_CONTRACT_VERSION, salidaDeEditJsonSchema, salidaDeInspectJsonSchema } from 'canonico';
import { run } from 'cli';

async function skill(): Promise<string> {
  const raiz = mkdtempSync(join(tmpdir(), 'skill-inspect-'));
  cpSync(join(import.meta.dirname, 'fixtures', 'build-basico'), raiz, { recursive: true });
  const resultado = await run(['skill', '--workspace', raiz]);
  expect(resultado.exitCode).toBe(0);
  return resultado.stdout;
}

describe('skill: inspect y dev', () => {
  it('documenta inspect, dev y el bucle inspect, editar, validate', async () => {
    const texto = await skill();

    for (const comando of ['inspect buscar', 'inspect nodo', 'inspect vista', 'dev --workspace']) expect(texto).toContain(comando);
    expect(texto).toMatch(/inspect[\s\S]*edit[\s\S]*validate/i);
    expect(texto).toContain(`contractVersion ${INSPECT_CONTRACT_VERSION}`);
  });

  it('incluye el esquema JSON de inspect, derivado del esquema Zod', async () => {
    const texto = await skill();

    const bloques = [...texto.matchAll(/```json\n([\s\S]*?)\n```/g)].map((m) => JSON.parse(m[1] ?? 'null') as unknown);
    expect(bloques).toContainEqual(salidaDeInspectJsonSchema());
  });

  it('documenta edit con su contrato y su esquema JSON', async () => {
    const texto = await skill();

    expect(texto).toContain('diagrams edit --workspace');
    expect(texto).toContain(`contractVersion ${EDIT_CONTRACT_VERSION}`);
    const bloques = [...texto.matchAll(/```json\n([\s\S]*?)\n```/g)].map((m) => JSON.parse(m[1] ?? 'null') as unknown);
    expect(bloques).toContainEqual(salidaDeEditJsonSchema());
  });
});
