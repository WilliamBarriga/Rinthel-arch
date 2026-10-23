import { cpSync, existsSync, mkdtempSync, mkdirSync, readdirSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createContext, runInContext } from 'node:vm';
import { JSDOM, VirtualConsole, requestInterceptor } from 'jsdom';
import { describe, expect, it } from 'vitest';

import { resolveView } from 'canonico';
import type { FuenteCanonica } from 'canonico';
import { run } from 'cli';

const fixtures = join(import.meta.dirname, 'fixtures');

const PRINCIPAL = `specification {
  node servicio { icon "mi-logo" }
}

theme rotulado extends neutral {
  fonts { body "Erica One, sans-serif" }
}

model {
  servicio api "API"
  servicio db "Base de datos"
  api -> db
}

view general {
  type architecture
  include **
  theme rotulado
  link api -> detalle
}

view detalle {
  type flow
  include **
}
`;

const ICONO = '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24"><circle cx="12" cy="12" r="5"/></svg>';

/** Workspace con un enlace general -> detalle, un icono propio y una fuente, ya construido (`build`). */
async function workspaceConstruido(): Promise<string> {
  const workspace = mkdtempSync(join(tmpdir(), 'html-'));
  cpSync(join(fixtures, 'build-basico'), workspace, { recursive: true });
  cpSync(join(fixtures, 'fuentes'), join(workspace, 'fuentes'), { recursive: true });
  writeFileSync(join(workspace, 'main.dg'), PRINCIPAL);
  mkdirSync(join(workspace, 'iconos'));
  writeFileSync(join(workspace, 'iconos', 'mi-logo.svg'), ICONO);
  expect((await run(['build', '--workspace', workspace])).exitCode).toBe(0);
  return workspace;
}

const leerHtml = (workspace: string, vista: string): string =>
  readFileSync(join(workspace, '.diagrams', 'html', `${vista}.html`), 'utf8');

interface Pagina {
  window: JSDOM['window'];
  /** Todo intento de cargar algo (recurso, fetch, XHR, WebSocket, sendBeacon). */
  peticiones: string[];
  errores: string[];
}

/** Abre el HTML como archivo local, ejecutando sus scripts y registrando cualquier peticion de red. */
function abrir(html: string, vista: string): Pagina {
  const peticiones: string[] = [];
  const errores: string[] = [];
  const consola = new VirtualConsole();
  consola.on('jsdomError', (e) => errores.push(e.message));
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
      const registrar = (nombre: string) => () => {
        peticiones.push(nombre);
        throw new Error(`peticion externa: ${nombre}`);
      };
      Object.assign(window, {
        fetch: registrar('fetch'),
        XMLHttpRequest: registrar('XMLHttpRequest'),
        WebSocket: registrar('WebSocket'),
        EventSource: registrar('EventSource'),
      });
      window.navigator.sendBeacon = registrar('sendBeacon') as never;
      window.addEventListener('error', (evento) => errores.push(evento.message));
    },
  });
  return { window: dom.window, peticiones, errores };
}

const esperar = async (condicion: () => boolean, ms = 10_000): Promise<void> => {
  const limite = Date.now() + ms;
  while (!condicion()) {
    if (Date.now() > limite) throw new Error('tiempo agotado esperando a la pagina');
    await new Promise((resolve) => setTimeout(resolve, 20));
  }
};

const ids = (p: Pagina): (string | null)[] =>
  [...p.window.document.querySelectorAll('svg [data-id]')].map((e) => e.getAttribute('data-id'));

describe('export --format html', () => {
  it('escribe un HTML por Vista en .diagrams/html y es determinista byte a byte', async () => {
    const workspace = await workspaceConstruido();

    const resultado = await run(['export', '--workspace', workspace, '--format', 'html']);

    expect(resultado.exitCode).toBe(0);
    expect(resultado.stdout).toBe('2 HTML escritos en .diagrams/html/\n');
    expect(readdirSync(join(workspace, '.diagrams', 'html')).sort()).toEqual(['detalle.html', 'general.html']);
    const primero = leerHtml(workspace, 'general');
    expect(primero.startsWith('<!doctype html>')).toBe(true);

    await run(['export', '--workspace', workspace, '--format', 'html']);
    expect(leerHtml(workspace, 'general')).toBe(primero);
  });

  it('es un solo archivo sin referencias externas (inspeccion estatica)', async () => {
    const workspace = await workspaceConstruido();
    await run(['export', '--workspace', workspace, '--format', 'html']);

    for (const vista of ['general', 'detalle']) {
      const html = leerHtml(workspace, vista);
      expect(html).not.toMatch(/<link\b|<iframe|<img|<object|<embed|<base\b|<audio|<video|<source/i);
      expect(html).not.toMatch(/<script[^>]*\bsrc\s*=/i);
      expect(html).not.toMatch(/@import/);
      // Fuera de los scripts: los unicos `url(...)` son data URIs (fuentes incrustadas) y ningun
      // atributo con destino apunta a http(s) ni a protocolo relativo.
      const sinScripts = html.replace(/<script\b[\s\S]*?<\/script>/g, '');
      expect([...sinScripts.matchAll(/url\(\s*['"]?([^)'"]*)/g)].every(([, destino]) => destino?.startsWith('data:'))).toBe(true);
      expect(sinScripts).not.toMatch(/\b(?:src|href|action|poster|data)\s*=\s*["']?(?:https?:)?\/\//i);
    }
  });

  it('el export estatico no tiene arrastre de Nodos (onMoveNode ausente): ni cliente de /api/pin ni Nodos que se muevan', async () => {
    const workspace = await workspaceConstruido();
    await run(['export', '--workspace', workspace, '--format', 'html']);
    const html = leerHtml(workspace, 'general');
    expect(html).not.toContain('/api/pin');

    const pagina = abrir(html, 'general');
    await esperar(() => ids(pagina).length > 0);
    const nodo = pagina.window.document.querySelector('svg [data-id="api"]') as Element;
    const antes = nodo.getAttribute('transform');
    const evento = (tipo: string, x: number, y: number) =>
      new pagina.window.MouseEvent(tipo, { bubbles: true, cancelable: true, button: 0, clientX: x, clientY: y });
    nodo.dispatchEvent(evento('mousedown', 100, 100));
    pagina.window.dispatchEvent(evento('mousemove', 160, 130));
    pagina.window.dispatchEvent(evento('mouseup', 160, 130));
    await new Promise((resolve) => setTimeout(resolve, 50));

    expect(nodo.getAttribute('transform')).toBe(antes);
    expect(pagina.peticiones).toEqual([]);
    pagina.window.close();
  });

  it('abre sin servidor, sin peticiones externas, con fuente e icono incrustados', async () => {
    const workspace = await workspaceConstruido();
    await run(['export', '--workspace', workspace, '--format', 'html']);
    const html = leerHtml(workspace, 'general');
    expect(html).toContain("@font-face{font-family:'Erica One';src:url(data:font/ttf;base64,");

    const pagina = abrir(html, 'general');
    await esperar(() => ids(pagina).length > 0);

    expect(ids(pagina).sort()).toEqual(['api', 'db']);
    expect(pagina.window.document.querySelector('[data-icon="mi-logo"] circle')).not.toBeNull();
    expect(pagina.peticiones).toEqual([]);
    expect(pagina.errores).toEqual([]);
    pagina.window.close();
  });

  it('navega a la Vista enlazada dentro del mismo archivo y vuelve con Atras', async () => {
    const workspace = await workspaceConstruido();
    await run(['export', '--workspace', workspace, '--format', 'html']);
    const pagina = abrir(leerHtml(workspace, 'general'), 'general');
    await esperar(() => ids(pagina).length > 0);

    // El clic va a las coordenadas del Nodo: la Seleccion la decide el hit-test del nucleo, no el elemento pulsado.
    const doc = pagina.window.document;
    const svg = doc.querySelector('svg[viewBox]')!;
    const [vx, vy, vw] = svg.getAttribute('viewBox')!.split(' ').map(Number) as [number, number, number, number];
    const k = Number(svg.getAttribute('width')) / vw;
    const [, tx, ty] = /translate\(([-\d.]+) ([-\d.]+)\)/.exec(doc.querySelector('[data-id="api"]')!.getAttribute('transform')!)!;
    const caja = doc.querySelector('[data-id="api"] [data-part="nodo"] > rect')!;
    const [cx, cy] = [Number(tx) + Number(caja.getAttribute('width')) / 2, Number(ty) + Number(caja.getAttribute('height')) / 2];
    svg.dispatchEvent(new pagina.window.MouseEvent('click', { bubbles: true, clientX: (cx - vx) * k, clientY: (cy - vy) * k }));

    await esperar(() => pagina.window.location.hash.includes('p=detalle'));
    expect(pagina.window.location.pathname).toBe('/proyecto/.diagrams/html/general.html');
    await esperar(() => ids(pagina).length > 0);
    expect(ids(pagina).sort()).toEqual(['api', 'db']);
    expect(pagina.window.document.querySelector('[data-crumb="detalle"][aria-current="page"]')).not.toBeNull();

    const atras = pagina.window.document.querySelector('button[aria-label="Atras"]')!;
    atras.dispatchEvent(new pagina.window.MouseEvent('click', { bubbles: true }));
    await esperar(() => !pagina.window.location.hash.includes('p=detalle'));
    expect(pagina.peticiones).toEqual([]);
    pagina.window.close();
  });

  it('expandir un Grupo recalcula el layout con ELK dentro del archivo (sin Worker en jsdom: hilo principal)', async () => {
    const workspace = await workspaceConstruido();
    writeFileSync(
      join(workspace, 'main.dg'),
      `specification { node servicio }
model {
  servicio g "Grupo" {
    servicio h "Hijo"
  }
}
view general {
  type architecture
  include **
  collapsed g
}
`,
    );
    expect((await run(['build', '--workspace', workspace])).exitCode).toBe(0);
    await run(['export', '--workspace', workspace, '--format', 'html']);
    const pagina = abrir(leerHtml(workspace, 'general'), 'general');
    await esperar(() => ids(pagina).length > 0);
    expect(ids(pagina)).toEqual(['g']);

    pagina.window.document.querySelector('[data-toggle="g"]')!.dispatchEvent(new pagina.window.MouseEvent('click', { bubbles: true }));

    await esperar(() => ids(pagina).includes('g.h') || pagina.errores.length > 0);
    expect(pagina.errores).toEqual([]);
    expect(pagina.peticiones).toEqual([]);
    pagina.window.close();
  });

  it('el bundle del Worker sirve el layout sin document ni zod real', async () => {
    const workspace = await workspaceConstruido();
    await run(['export', '--workspace', workspace, '--format', 'html']);
    const html = leerHtml(workspace, 'general');
    const codigo = /<script id="worker" type="text\/plain">([\s\S]*?)<\/script>/.exec(html)![1]!;
    const datos = JSON.parse(/<script id="datos" type="application\/json">([\s\S]*?)<\/script>/.exec(html)![1]!) as {
      fuente: { themes: unknown[] };
    };
    const enviados: unknown[] = [];
    // Como en un Worker: `self` es el propio global, sin `document` ni `window`.
    const contexto = createContext({ setTimeout, clearTimeout, console });
    const self = runInContext('globalThis', contexto) as { onmessage?: (evento: { data: unknown }) => void; postMessage: (m: unknown) => void; self?: unknown };
    self.self = self;
    self.postMessage = (m) => enviados.push(m);
    runInContext(codigo, contexto);
    expect(self.onmessage).toBeTypeOf('function');

    const vista = resolveView(datos.fuente as unknown as FuenteCanonica, 'detalle');
    self.onmessage!({ data: { id: 7, vista, tema: datos.fuente.themes[0] } });
    await esperar(() => enviados.length > 0);

    expect(enviados[0]).toMatchObject({ id: 7 });
    expect(Object.keys((enviados[0] as { geometria?: { nodes: object } }).geometria?.nodes ?? {})).toEqual(['api', 'db']);
  });

  it('la pagina no lleva ELK: va solo en el script del Worker, que ademas va sin zod', async () => {
    const workspace = await workspaceConstruido();
    await run(['export', '--workspace', workspace, '--format', 'html']);
    const html = leerHtml(workspace, 'general');
    const pagina = /<script id="app">([\s\S]*?)<\/script>/.exec(html)![1]!;
    const worker = /<script id="worker" type="text\/plain">([\s\S]*?)<\/script>/.exec(html)![1]!;

    expect(pagina).not.toContain('org.eclipse.elk');
    expect(worker).toContain('org.eclipse.elk');
    expect(worker.length).toBeLessThan(2_000_000);
    expect(worker).not.toContain('Invalid input');
  });

  it('el HTML de otra Vista arranca en esa Vista', async () => {
    const workspace = await workspaceConstruido();
    await run(['export', '--workspace', workspace, '--format', 'html']);
    const pagina = abrir(leerHtml(workspace, 'detalle'), 'detalle');
    await esperar(() => ids(pagina).length > 0);

    expect(pagina.window.document.title).toContain('detalle');
    expect(pagina.window.document.querySelector('[data-icon="mi-logo"]')).not.toBeNull();
    pagina.window.close();
  });

  it('sin salida de build sale con codigo 2', async () => {
    const workspace = mkdtempSync(join(tmpdir(), 'html-'));
    cpSync(join(fixtures, 'build-basico'), workspace, { recursive: true });

    const resultado = await run(['export', '--workspace', workspace, '--format', 'html']);

    expect(resultado.exitCode).toBe(2);
    expect(existsSync(join(workspace, '.diagrams', 'html'))).toBe(false);
  });
});
