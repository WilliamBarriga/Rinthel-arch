import { cpSync, existsSync, mkdtempSync, readdirSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { JSDOM, VirtualConsole, requestInterceptor } from 'jsdom';
import { describe, expect, it } from 'vitest';

import { run } from 'cli';

/** Abre el HTML como archivo local, ejecutando sus scripts, y devuelve todo intento de red y los errores. */
async function abrirYObservar(html: string, vista: string): Promise<{ peticiones: string[]; errores: string[]; svg: boolean }> {
  const peticiones: string[] = [];
  const errores: string[] = [];
  const consola = new VirtualConsole();
  consola.on('jsdomError', (e) => errores.push(e.message));
  const bloquear = (nombre: string) => () => {
    peticiones.push(nombre);
    throw new Error(`peticion externa: ${nombre}`);
  };
  const dom = new JSDOM(html, {
    url: `file:///proyecto/.diagrams/html/${vista}.html`,
    runScripts: 'dangerously',
    resources: {
      interceptors: [
        requestInterceptor((peticion) => {
          peticiones.push(peticion.url);
          return new Response('', { status: 404 });
        }),
      ],
    },
    pretendToBeVisual: true,
    virtualConsole: consola,
    beforeParse(window) {
      Object.assign(window, {
        fetch: bloquear('fetch'),
        XMLHttpRequest: bloquear('XMLHttpRequest'),
        WebSocket: bloquear('WebSocket'),
        EventSource: bloquear('EventSource'),
      });
      window.navigator.sendBeacon = bloquear('sendBeacon') as never;
    },
  });
  const limite = Date.now() + 10_000;
  while (dom.window.document.querySelector('svg [data-id]') === null && Date.now() < limite) {
    await new Promise((resolve) => setTimeout(resolve, 20));
  }
  const svg = dom.window.document.querySelector('svg [data-id]') !== null;
  dom.window.close();
  return { peticiones, errores, svg };
}

const VISTAS = ['datos', 'detalle', 'general'];

describe('e2e: CLI sobre un Workspace mediano', () => {
  it('validate, build, export svg/png/html y skill; el HTML no pide recursos externos', async () => {
    const workspace = mkdtempSync(join(tmpdir(), 'e2e-'));
    cpSync(join(import.meta.dirname, 'fixtures', 'mediano'), workspace, { recursive: true });
    const ws = ['--workspace', workspace];

    const validacion = await run(['validate', ...ws, '--json']);
    expect(validacion.exitCode, validacion.stdout).toBe(0);
    expect(JSON.parse(validacion.stdout)).toMatchObject({ ok: true });

    const construccion = await run(['build', ...ws]);
    expect(construccion.exitCode, construccion.stdout).toBe(0);
    expect(readdirSync(join(workspace, '.diagrams', 'geometria')).sort()).toEqual(VISTAS.map((v) => `${v}.json`));

    for (const formato of ['svg', 'png', 'html']) {
      const exportado = await run(['export', ...ws, '--format', formato]);
      expect(exportado.exitCode, exportado.stderr).toBe(0);
      expect(readdirSync(join(workspace, '.diagrams', formato)).sort()).toEqual(VISTAS.map((v) => `${v}.${formato}`));
    }

    for (const vista of VISTAS) {
      const svg = readFileSync(join(workspace, '.diagrams', 'svg', `${vista}.svg`), 'utf8');
      expect(svg).toMatch(/^<svg[\s\S]*<\/svg>\s*$/);
      const png = readFileSync(join(workspace, '.diagrams', 'png', `${vista}.png`));
      expect([...png.subarray(0, 8)]).toEqual([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
      expect(png.length).toBeGreaterThan(1000);

      const html = readFileSync(join(workspace, '.diagrams', 'html', `${vista}.html`), 'utf8');
      expect(html.startsWith('<!doctype html>')).toBe(true);
      // Sin peticiones externas: estatico (el marcado sin los scripts) y en ejecucion (jsdom).
      const marcado = html.replace(/<script\b[\s\S]*?<\/script>/gi, '');
      expect(marcado).not.toMatch(/\s(?:src|href)\s*=\s*["']?(?!data:|#)/i);
      expect(marcado).not.toMatch(/(?:@import|url\()\s*["']?(?!data:|#)/i);
      const pagina = await abrirYObservar(html, vista);
      expect(pagina.peticiones).toEqual([]);
      expect(pagina.errores).toEqual([]);
      expect(pagina.svg).toBe(true);
    }

    const salida = join(workspace, 'skill', 'SKILL.md');
    const skill = await run(['skill', ...ws]);
    expect(skill.exitCode).toBe(0);
    expect(skill.stdout).toContain('servicio');
    expect(skill.stdout).toContain('corporativo');
    expect((await run(['skill', ...ws, '--out', salida])).exitCode).toBe(0);
    expect(existsSync(salida)).toBe(true);
    expect(readFileSync(salida, 'utf8')).toBe(skill.stdout);
  }, 60_000);
});
