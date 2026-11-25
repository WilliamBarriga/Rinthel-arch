import { existsSync, mkdirSync, mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

import { ACTIVIDAD_CONTRACT_VERSION, eventoDeActividadSchema } from 'canonico';
import type { EventoDeActividad } from 'canonico';
import { run } from 'cli';

const DG = `specification { node servicio }
model {
  servicio a "A"
  servicio b "B"
  a -> b
}
view general {
  type architecture
  include **
}
`;

const CON_ERRORES = `specification { node servicio }
model {
  servicio a "A"
  a -> nadie
}
view general {
  type architecture
  include **
}
`;

function workspace(texto = DG): string {
  const raiz = mkdtempSync(join(tmpdir(), 'actividad-'));
  writeFileSync(join(raiz, 'main.dg'), texto);
  return raiz;
}

const registro = (raiz: string) => join(raiz, '.diagrams', 'activity.jsonl');

function eventos(raiz: string): EventoDeActividad[] {
  if (!existsSync(registro(raiz))) return [];
  return readFileSync(registro(raiz), 'utf8')
    .split('\n')
    .filter((linea) => linea !== '')
    .map((linea) => eventoDeActividadSchema.parse(JSON.parse(linea)));
}

/** Activo: el entorno de las pruebas del paquete lo apaga por defecto. */
const activo = { entorno: {} };

describe('Registro de actividad', () => {
  it('validate deja un Evento con su resumen y sin stdout ni stderr', async () => {
    const raiz = workspace();
    const r = await run(['validate', '--workspace', raiz, '--json'], activo);
    expect(r.exitCode).toBe(0);

    const [evento, ...resto] = eventos(raiz);
    expect(resto).toEqual([]);
    expect(evento).toMatchObject({
      contractVersion: ACTIVIDAD_CONTRACT_VERSION,
      pid: process.pid,
      command: 'validate',
      args: ['--workspace', raiz, '--json'],
      exitCode: 0,
      summary: { errors: 0, warnings: 0 },
    });
    expect(evento?.durationMs).toBeGreaterThanOrEqual(0);
    expect(Number.isNaN(Date.parse(evento?.ts ?? ''))).toBe(false);
    expect(evento).not.toHaveProperty('agente');
    expect(evento).not.toHaveProperty('objetivo');
    expect(JSON.stringify(evento)).not.toContain('stdout');
  });

  it('registra tambien la salida 1 (con resumen) y el fallo de uso 2', async () => {
    const raiz = workspace(CON_ERRORES);
    expect((await run(['build', '--workspace', raiz], activo)).exitCode).toBe(1);
    expect((await run(['validate', '--workspace', raiz, '--max-issues', '0'], activo)).exitCode).toBe(2);

    const [build, uso] = eventos(raiz);
    expect(build).toMatchObject({ command: 'build', exitCode: 1 });
    expect(build?.summary?.errors).toBeGreaterThan(0);
    expect(uso).toMatchObject({ command: 'validate', exitCode: 2, args: ['--workspace', raiz, '--max-issues', '0'] });
    expect(uso).not.toHaveProperty('resumen');
  });

  it('skill, la ayuda y un --workspace que falta o no resuelve no registran', async () => {
    const raiz = workspace();
    await run(['skill', '--workspace', raiz], activo);
    await run(['validate', '--help'], activo);
    await run(['help', 'build'], activo);
    expect(eventos(raiz)).toEqual([]);
    expect((await run(['validate'], activo)).exitCode).toBe(2);
    const inexistente = join(raiz, 'no-existe');
    expect((await run(['validate', '--workspace', inexistente], activo)).exitCode).toBe(2);
    expect(existsSync(join(inexistente, '.diagrams'))).toBe(false);
    expect(existsSync(join(raiz, '.diagrams'))).toBe(false);
  });

  it('DIAGRAMS_ACTIVITY=0 lo apaga y DIAGRAMS_AGENT llega a agente', async () => {
    const raiz = workspace();
    await run(['validate', '--workspace', raiz], { entorno: { DIAGRAMS_ACTIVITY: '0' } });
    expect(eventos(raiz)).toEqual([]);
    await run(['validate', '--workspace', raiz], { entorno: { DIAGRAMS_AGENT: 'revisor' } });
    expect(eventos(raiz).map((e) => e.agent)).toEqual(['revisor']);
  });

  it('inspect lleva en objetivo la Vista, el Nodo o el Tema que nombra; buscar no', async () => {
    const raiz = workspace();
    await run(['inspect', 'view', 'general', '--workspace', raiz], activo);
    await run(['inspect', 'node', 'zzz', '--workspace', raiz], activo);
    await run(['inspect', 'theme', 'neutral', '--workspace', raiz], activo);
    await run(['inspect', 'search', 'a', '--workspace', raiz], activo);

    expect(eventos(raiz).map(({ exitCode, target }) => ({ exitCode, target }))).toEqual([
      { exitCode: 0, target: { view: 'general' } },
      { exitCode: 1, target: { node: 'zzz' } },
      { exitCode: 0, target: { theme: 'neutral' } },
      { exitCode: 0, target: undefined },
    ]);
  });

  it('edit lleva la Vista y el Nodo de la Intencion y los archivos que escribio', async () => {
    const raiz = workspace();
    const pin = ['--view', 'general', '--node', 'a', '--x', '1', '--y', '2'];
    expect((await run(['edit', '--workspace', raiz, ...pin], activo)).exitCode).toBe(0);
    const orden = JSON.stringify({ type: 'reorder-lifelines', view: 'nada', order: ['a'] });
    expect((await run(['edit', '--workspace', raiz, '--intent', orden], activo)).exitCode).toBe(1);
    const ediciones = JSON.stringify([
      { file: 'main.dg', range: { start: { line: 1, column: 1 }, end: { line: 1, column: 1 } }, replacement: '// hola\n' },
    ]);
    expect((await run(['edit', '--workspace', raiz, '--edits', ediciones], activo)).exitCode).toBe(0);

    expect(eventos(raiz).map(({ exitCode, target }) => ({ exitCode, target }))).toEqual([
      { exitCode: 0, target: { view: 'general', node: 'a', files: ['main.dg'] } },
      { exitCode: 1, target: { view: 'nada' } },
      { exitCode: 0, target: { files: ['main.dg'] } },
    ]);
  });

  it('un fallo al escribir el registro no cambia stdout, stderr ni el codigo', async () => {
    const raiz = workspace();
    const esperado = await run(['validate', '--workspace', raiz, '--json'], { entorno: { DIAGRAMS_ACTIVITY: '0' } });
    writeFileSync(join(raiz, '.diagrams'), 'no soy una carpeta');
    expect(await run(['validate', '--workspace', raiz, '--json'], activo)).toEqual(esperado);
  });

  it('al pasar 1 MB rota a actividad.1.jsonl', async () => {
    const raiz = workspace();
    mkdirSync(join(raiz, '.diagrams'));
    const viejo = `${'x'.repeat(1024 * 1024)}\n`;
    writeFileSync(registro(raiz), viejo);
    await run(['validate', '--workspace', raiz], activo);
    expect(readFileSync(join(raiz, '.diagrams', 'actividad.1.jsonl'), 'utf8')).toBe(viejo);
    expect(eventos(raiz).map((e) => e.command)).toEqual(['validate']);
  });

  it('build reemplaza canonico.json y geometria/ y conserva el registro', async () => {
    const raiz = workspace();
    await run(['validate', '--workspace', raiz], activo);
    await run(['build', '--workspace', raiz], activo);
    expect(existsSync(join(raiz, '.diagrams', 'geometria', 'general.json'))).toBe(true);
    writeFileSync(join(raiz, 'main.dg'), CON_ERRORES);
    await run(['build', '--workspace', raiz], activo);

    expect(existsSync(join(raiz, '.diagrams', 'canonico.json'))).toBe(false);
    expect(existsSync(join(raiz, '.diagrams', 'geometria'))).toBe(false);
    expect(eventos(raiz).map((e) => [e.command, e.exitCode])).toEqual([['validate', 0], ['build', 0], ['build', 1]]);
  });
});
