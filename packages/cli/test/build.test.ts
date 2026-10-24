import { cpSync, existsSync, mkdtempSync, readdirSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

import { fuenteCanonicaSchema } from 'canonico';
import { run } from 'cli';

const fixtures = join(import.meta.dirname, 'fixtures');

/** Copia una fixture a una carpeta temporal para que `build` escriba sin ensuciar el repo. */
function copiarFixture(nombre: string): string {
  const destino = mkdtempSync(join(tmpdir(), 'build-'));
  cpSync(join(fixtures, nombre), destino, { recursive: true });
  return destino;
}

const leerJson = (ruta: string): unknown => JSON.parse(readFileSync(ruta, 'utf8'));

describe('build', () => {
  it('escribe la Fuente canonica y una geometria por Vista en .diagrams/', async () => {
    const workspace = copiarFixture('build-basico');

    const resultado = await run(['build', '--workspace', workspace]);

    expect(resultado.exitCode).toBe(0);
    expect(resultado.stderr).toBe('');
    const fuente = fuenteCanonicaSchema.parse(leerJson(join(workspace, '.diagrams', 'canonico.json')));
    expect(fuente.views.map((vista) => vista.id)).toEqual(['general', 'detalle']);
    expect(readdirSync(join(workspace, '.diagrams', 'geometria')).sort()).toEqual([
      'detalle.json',
      'general.json',
    ]);
    const general = leerJson(join(workspace, '.diagrams', 'geometria', 'general.json')) as {
      view: string;
      geometry: { nodes: Record<string, unknown>; edges: Record<string, unknown>; width: number };
    };
    expect(general.view).toBe('general');
    expect(Object.keys(general.geometry.nodes).sort()).toEqual(['api', 'db']);
    expect(Object.keys(general.geometry.edges)).toEqual(['api -> db']);
    expect(general.geometry.width).toBeGreaterThan(0);
  });

  it('con errores de validacion sale con 1 y no escribe nada', async () => {
    const workspace = copiarFixture('con-errores');

    const resultado = await run(['build', '--workspace', workspace]);

    expect(resultado.exitCode).toBe(1);
    expect(resultado.stdout).toContain('error');
    expect(existsSync(join(workspace, '.diagrams'))).toBe(false);
  });

  it('una Vista con theme propio usa ese Tema y el resto el global', async () => {
    const workspace = copiarFixture('build-basico');
    const temaDe = (vista: string): unknown =>
      (leerJson(join(workspace, '.diagrams', 'geometria', `${vista}.json`)) as { theme: string }).theme;

    await run(['build', '--workspace', workspace]);
    expect([temaDe('general'), temaDe('detalle')]).toEqual(['neutral', 'grande']);

    await run(['build', '--workspace', workspace, '--theme', 'grande']);
    expect([temaDe('general'), temaDe('detalle')]).toEqual(['grande', 'grande']);
  });

  it('el Tema de la Vista cambia la geometria (fuente mayor, cajas mayores)', async () => {
    const workspace = copiarFixture('build-basico');
    await run(['build', '--workspace', workspace]);
    const altura = (vista: string): number =>
      (leerJson(join(workspace, '.diagrams', 'geometria', `${vista}.json`)) as { geometry: { height: number } }).geometry.height;

    expect(altura('detalle')).toBeGreaterThan(altura('general'));
  });

  it('--theme con un Tema inexistente es un fallo de uso y no escribe', async () => {
    const workspace = copiarFixture('build-basico');

    const resultado = await run(['build', '--workspace', workspace, '--theme', 'nada']);

    expect(resultado.exitCode).toBe(2);
    expect(resultado.stderr).toContain("'nada'");
    expect(resultado.stderr).toContain('neutral, neutral-dark, alto-contraste, grande');
    expect(existsSync(join(workspace, '.diagrams'))).toBe(false);
  });

  it('--theme-path aporta Temas antes del Workspace; los Temas del Workspace siguen disponibles', async () => {
    const workspace = copiarFixture('build-basico');
    const temas = join(fixtures, 'temas-extra');

    const resultado = await run(['build', '--workspace', workspace, '--theme-path', temas, '--theme', 'corporativo']);

    expect(resultado.exitCode).toBe(0);
    const fuente = fuenteCanonicaSchema.parse(leerJson(join(workspace, '.diagrams', 'canonico.json')));
    expect(fuente.themes.map((tema) => tema.name)).toContain('corporativo');
    const general = leerJson(join(workspace, '.diagrams', 'geometria', 'general.json')) as { theme: string };
    expect(general.theme).toBe('corporativo');
  });

  it('si el Workspace y --theme-path comparten ruta, gana el Workspace', async () => {
    const workspace = copiarFixture('build-basico');
    writeFileSync(join(workspace, 'temas.dg'), '');

    const resultado = await run([
      'build', '--workspace', workspace, '--theme-path', join(fixtures, 'temas-extra'), '--theme', 'corporativo',
    ]);

    expect(resultado.exitCode).toBe(2);
    expect(resultado.stderr).toContain("'corporativo'");
  });

  it('reconstruir reemplaza la salida: no quedan Vistas borradas', async () => {
    const workspace = copiarFixture('build-basico');
    await run(['build', '--workspace', workspace]);
    const fuente = readFileSync(join(workspace, 'main.dg'), 'utf8');
    writeFileSync(join(workspace, 'main.dg'), fuente.replace(/view detalle[\s\S]*$/, ''));

    await run(['build', '--workspace', workspace]);

    expect(readdirSync(join(workspace, '.diagrams', 'geometria'))).toEqual(['general.json']);
  });

  it('un par de Pins solapados sale como W_OVERLAPPING_PINS con posicion y related', async () => {
    const workspace = mkdtempSync(join(tmpdir(), 'build-'));
    writeFileSync(
      join(workspace, 'main.dg'),
      `specification { node servicio }
model { servicio a  servicio b }
view v {
  type architecture
  include **
  node a { pin 0,0 }
  node b { pin 10,10 }
}
`,
    );

    const resultado = await run(['build', '--workspace', workspace, '--json']);

    expect(resultado.exitCode).toBe(0);
    const { issues } = JSON.parse(resultado.stdout) as { issues: Record<string, unknown>[] };
    expect(issues).toEqual([
      expect.objectContaining({
        code: 'W_OVERLAPPING_PINS',
        severity: 'warning',
        file: 'main.dg',
        line: 6,
        column: 8,
        related: [{ file: 'main.dg', line: 7, column: 8, message: "Pin de 'b'" }],
      }),
    ]);
    expect(existsSync(join(workspace, '.diagrams', 'canonico.json'))).toBe(true);
  });

  it('con --strict los Pins solapados hacen fallar el build', async () => {
    const workspace = mkdtempSync(join(tmpdir(), 'build-'));
    writeFileSync(
      join(workspace, 'main.dg'),
      'specification { node s } model { s a  s b } view v { type flow include ** node a { pin 0,0 } node b { pin 0,0 } }',
    );

    const resultado = await run(['build', '--workspace', workspace, '--strict']);

    expect(resultado.exitCode).toBe(1);
    expect(existsSync(join(workspace, '.diagrams'))).toBe(false);
  });
});
