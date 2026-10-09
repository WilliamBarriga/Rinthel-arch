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
