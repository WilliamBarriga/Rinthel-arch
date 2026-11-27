import { mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

import { run } from 'cli';

function workspace(text: string): string {
  const dir = mkdtempSync(join(tmpdir(), 'dg-sequence-'));
  writeFileSync(join(dir, 'main.dg'), text);
  return dir;
}

const model = (interaction: string) => `specification { node servicio }
model {
  servicio cliente
  servicio api
  ${interaction}
}
view v { type sequence
 interaction checkout }
`;

describe('validate: sequence Views', () => {
  it('a valid Interaction exits with code 0', async () => {
    const result = await run(['validate', '--workspace', workspace(model('interaction checkout { cliente -> api "pedir"\n reply api -> cliente "ok" }')), '--json']);
    expect(result.exitCode).toBe(0);
  });

  it('an unknown endpoint is unknown-lifeline with its correction, never a syntax error', async () => {
    const result = await run(['validate', '--workspace', workspace(model('interaction checkout { cliente -> apii }')), '--json']);
    expect(result.exitCode).toBe(1);
    const { issues } = JSON.parse(result.stdout) as { issues: { code: string; fix?: { replacement: string } }[] };
    expect(issues.map((i) => i.code)).toEqual(['unknown-lifeline']);
    expect(issues[0]!.fix?.replacement).toBe('api');
  });

  it('a reply without sync is a warning that fails only with --strict', async () => {
    const dir = workspace(model('interaction checkout { reply api -> cliente }'));
    expect((await run(['validate', '--workspace', dir])).exitCode).toBe(0);
    expect((await run(['validate', '--workspace', dir, '--strict'])).exitCode).toBe(1);
  });

  describe('Notes and ref', () => {
    const issuesOf = async (text: string) => {
      const result = await run(['validate', '--workspace', workspace(text), '--json']);
      return { exitCode: result.exitCode, issues: (JSON.parse(result.stdout) as { issues: { code: string; severity: string; hint?: string; fix?: { replacement: string } }[] }).issues };
    };

    it('a ref to a missing Interaction is unknown-interaction with a typo fix', async () => {
      const { exitCode, issues } = await issuesOf(model('interaction login { cliente -> api }\n interaction checkout { cliente -> api "pedir"\n ref logn }'));
      expect(exitCode).toBe(1);
      const unknown = issues.filter((i) => i.code === 'unknown-interaction');
      expect(unknown).toHaveLength(1);
      expect(unknown[0]!.fix?.replacement).toBe('login');
    });

    it('a ref to an Interaction that no sequence View projects is ref-without-view with a hint', async () => {
      const { exitCode, issues } = await issuesOf(model('interaction login { cliente -> api }\n interaction checkout { cliente -> api "pedir"\n ref login }'));
      expect(exitCode).toBe(0);
      expect(issues.map((i) => i.code)).toEqual(['ref-without-view']);
      expect(issues[0]!.severity).toBe('warning');
      expect(issues[0]!.hint).toContain('View');
    });

    it('a cyclic ref to the projected Interaction itself gives no issue', async () => {
      const { exitCode, issues } = await issuesOf(model('interaction checkout { cliente -> api "pedir"\n ref checkout }'));
      expect(exitCode).toBe(0);
      expect(issues).toEqual([]);
    });

    it('a Note over an unknown Node is unknown-lifeline', async () => {
      const { issues } = await issuesOf(model('interaction checkout { cliente -> api "pedir"\n note over cliente, apii "x" }'));
      expect(issues.map((i) => i.code)).toEqual(['unknown-lifeline']);
      expect(issues[0]!.fix?.replacement).toBe('api');
    });
  });
});
