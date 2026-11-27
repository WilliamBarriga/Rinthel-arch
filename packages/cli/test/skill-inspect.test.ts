import { cpSync, mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

import { EDIT_CONTRACT_VERSION, INSPECT_CONTRACT_VERSION, editOutputJsonSchema, inspectOutputJsonSchema } from 'canonical';
import { run } from 'cli';

async function skill(): Promise<string> {
  const root = mkdtempSync(join(tmpdir(), 'skill-inspect-'));
  cpSync(join(import.meta.dirname, 'fixtures', 'build-basic'), root, { recursive: true });
  const result = await run(['skill', '--workspace', root]);
  expect(result.exitCode).toBe(0);
  return result.stdout;
}

describe('skill: inspect and dev', () => {
  it('documents inspect, dev and the inspect, edit, validate loop', async () => {
    const text = await skill();

    for (const command of ['inspect search', 'inspect node', 'inspect view', 'dev --workspace']) expect(text).toContain(command);
    expect(text).toMatch(/inspect[\s\S]*edit[\s\S]*validate/i);
    expect(text).toContain(`contractVersion ${INSPECT_CONTRACT_VERSION}`);
  });

  it('includes the JSON schema of inspect, derived from the Zod schema', async () => {
    const text = await skill();

    const blocks = [...text.matchAll(/```json\n([\s\S]*?)\n```/g)].map((m) => JSON.parse(m[1] ?? 'null') as unknown);
    expect(blocks).toContainEqual(inspectOutputJsonSchema());
  });

  it('documents edit with its contract and its JSON schema', async () => {
    const text = await skill();

    expect(text).toContain('diagrams edit --workspace');
    expect(text).toContain(`contractVersion ${EDIT_CONTRACT_VERSION}`);
    const blocks = [...text.matchAll(/```json\n([\s\S]*?)\n```/g)].map((m) => JSON.parse(m[1] ?? 'null') as unknown);
    expect(blocks).toContainEqual(editOutputJsonSchema());
  });
});
