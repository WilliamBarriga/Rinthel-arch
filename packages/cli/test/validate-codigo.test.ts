import { cpSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';

import { salidaDeInspectSchema, salidaDeValidateSchema } from 'canonico';
import { run } from 'cli';

const FIXTURE = resolve(__dirname, 'fixtures/tema-codigo');
const copias: string[] = [];

function copia(): string {
  const raiz = mkdtempSync(join(tmpdir(), 'rinthel-tema-codigo-'));
  copias.push(raiz);
  cpSync(FIXTURE, raiz, { recursive: true });
  return raiz;
}
afterEach(() => {
  for (const carpeta of copias.splice(0)) rmSync(carpeta, { recursive: true, force: true });
});

async function validar(raiz: string) {
  const r = await run(['validate', '--workspace', raiz, '--json']);
  return { ...r, salida: salidaDeValidateSchema.parse(JSON.parse(r.stdout)) };
}

describe('validate: Tema con codigo', () => {
  it('un Tema con codigo valido emite solo el warning de confianza', async () => {
    const { exitCode, salida } = await validar(FIXTURE);

    expect(exitCode).toBe(0);
    expect(salida.issues.map((i) => i.code)).toEqual(['W_THEME_WITH_CODE']);
    expect(salida.issues[0]).toMatchObject({ severity: 'warning', file: 'main.dg', message: expect.stringContaining('Aurora') });
  });

  it('--strict trata el warning de codigo como fallo', async () => {
    const r = await run(['validate', '--workspace', FIXTURE, '--strict', '--json']);
    expect(r.exitCode).toBe(1);
  });

  it('un componente que ningun .tsx exporta es un error', async () => {
    const raiz = copia();
    writeFileSync(join(raiz, 'componentes', 'aurora.tsx'), 'export function Otra() { return null; }\n');

    const { exitCode, salida } = await validar(raiz);

    expect(exitCode).toBe(1);
    expect(salida.issues.map((i) => i.code)).toEqual(['E_THEME_COMPONENT_MISSING', 'W_THEME_WITH_CODE']);
  });

  it('un error de compilacion del .tsx aparece como issue con file y line', async () => {
    const raiz = copia();
    writeFileSync(join(raiz, 'componentes', 'aurora.tsx'), 'export function Aurora() {\n  const x = ;\n  return x;\n}\n');

    const { exitCode, salida } = await validar(raiz);

    expect(exitCode).toBe(1);
    const compilacion = salida.issues.find((i) => i.code === 'E_THEME_CODE_COMPILE');
    expect(compilacion).toMatchObject({ severity: 'error', file: 'componentes/aurora.tsx', line: 2 });
  });

  it('inspect tema marca el Tema con codigo y lista sus componentes', async () => {
    const r = await run(['inspect', 'tema', 'neon', '--workspace', FIXTURE, '--json']);

    const salida = salidaDeInspectSchema.parse(JSON.parse(r.stdout));
    expect(salida.comando === 'tema' && salida.tema).toMatchObject({ temaConCodigo: true, componentes: ['Aurora'] });
  });
});
