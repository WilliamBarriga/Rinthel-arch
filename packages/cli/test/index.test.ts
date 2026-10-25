import { describe, expect, it } from 'vitest';

import { run } from 'cli';

describe('cli', () => {
  it('se importa por nombre de paquete y rechaza un comando desconocido con codigo 2', async () => {
    const { exitCode, stdout, stderr } = await run(['inexistente']);
    expect(exitCode).toBe(2);
    expect(stdout).toBe('');
    expect(stderr).toContain('Comando desconocido');
  });
});

describe('cli: ayuda', () => {
  it.each([[[]], [['--help']], [['help']], [['-h']]])('%j imprime el uso general con codigo 0', async (argv) => {
    const { exitCode, stdout, stderr } = await run(argv);
    expect(exitCode).toBe(0);
    expect(stderr).toBe('');
    for (const comando of ['validate', 'build', 'dev', 'inspect', 'edit', 'skill']) expect(stdout).toContain(comando);
  });

  it.each(['validate', 'build', 'dev', 'inspect', 'edit', 'skill'])('%s --help y help %s explican sus opciones sin exigir --workspace', async (comando) => {
    const directa = await run([comando, '--help']);
    const indirecta = await run(['help', comando]);
    expect(directa.exitCode).toBe(0);
    expect(directa.stdout).toContain(`diagrams ${comando}`);
    expect(indirecta.stdout).toBe(directa.stdout);
  });

  it('cada opcion que el CLI acepta aparece en su ayuda', async () => {
    const esperadas: Record<string, string[]> = {
      validate: ['--json', '--strict', '--max-issues', '--theme', '--theme-path'],
      dev: ['--port', '--trust-code', '--theme-path'],
      inspect: ['--tipo', '--estado', '--catalogo', '--json'],
      edit: ['--view', '--node', '--x', '--y', '--edits', '--hash'],
      skill: ['--out'],
    };
    for (const [comando, opciones] of Object.entries(esperadas)) {
      const { stdout } = await run([comando, '--help']);
      for (const opcion of opciones) expect(stdout, `${comando} ${opcion}`).toContain(opcion);
    }
  });
});
