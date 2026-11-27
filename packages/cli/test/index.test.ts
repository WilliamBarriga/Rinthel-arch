import { describe, expect, it } from 'vitest';

import { run } from 'cli';

describe('cli', () => {
  it('is imported by package name and rejects an unknown command with code 2', async () => {
    const { exitCode, stdout, stderr } = await run(['inexistente']);
    expect(exitCode).toBe(2);
    expect(stdout).toBe('');
    expect(stderr).toContain('Unknown command');
  });
});

describe('cli: help', () => {
  it.each([[[]], [['--help']], [['help']], [['-h']]])('%j prints the general usage with code 0', async (argv) => {
    const { exitCode, stdout, stderr } = await run(argv);
    expect(exitCode).toBe(0);
    expect(stderr).toBe('');
    for (const command of ['validate', 'build', 'dev', 'inspect', 'edit', 'skill', 'scan']) expect(stdout).toContain(command);
  });

  it.each(['validate', 'build', 'dev', 'inspect', 'edit', 'skill', 'scan'])('%s --help and help %s explain their options without requiring --workspace', async (command) => {
    const direct = await run([command, '--help']);
    const indirect = await run(['help', command]);
    expect(direct.exitCode).toBe(0);
    expect(direct.stdout).toContain(`diagrams ${command}`);
    expect(indirect.stdout).toBe(direct.stdout);
  });

  it('every option the CLI accepts appears in its help', async () => {
    const expectedOnes: Record<string, string[]> = {
      validate: ['--json', '--strict', '--max-issues', '--theme', '--theme-path'],
      dev: ['--port', '--trust-code', '--theme-path'],
      inspect: ['--kind', '--state', '--diagram', '--catalog', '--json'],
      edit: ['--view', '--node', '--x', '--y', '--edits', '--hash'],
      skill: ['--out'],
      scan: ['--out', '--json', '--depth', '--max-files'],
    };
    for (const [command, options] of Object.entries(expectedOnes)) {
      const { stdout } = await run([command, '--help']);
      for (const option of options) expect(stdout, `${command} ${option}`).toContain(option);
    }
  });
});
