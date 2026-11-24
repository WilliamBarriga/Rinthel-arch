/** Build de los estaticos del navegador y rutas que `cli` sirve bajo `/_estudio/`. */
import { mkdtempSync, readFileSync, readdirSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, sep } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';

import { construirEstudio } from '../src/construir';
import { RUTA_DEL_ESTUDIO, activosDelEstudio } from '../src/index';

const carpetas: string[] = [];
afterEach(() => {
  for (const carpeta of carpetas.splice(0)) rmSync(carpeta, { recursive: true, force: true });
});

function temporal(): string {
  const carpeta = mkdtempSync(join(tmpdir(), 'rinthel-estudio-'));
  carpetas.push(carpeta);
  return carpeta;
}

describe('construirEstudio', () => {
  it('escribe el HTML, el JS de pagina (modulo) con sus trozos, el JS del worker y el CSS; el HTML los pide bajo /_estudio/', async () => {
    const salida = temporal();

    await construirEstudio({ salida });

    expect(readdirSync(salida).sort()).toEqual(['estilo.css', 'exportado.js', 'index.html', 'pagina.js', 'trozos', 'worker.js']);
    const html = readFileSync(join(salida, 'index.html'), 'utf8');
    expect(html).toContain(`<script type="module" src="${RUTA_DEL_ESTUDIO}pagina.js"></script>`);
    expect(html).toContain(`<link rel="stylesheet" href="${RUTA_DEL_ESTUDIO}estilo.css">`);
    const pagina = readFileSync(join(salida, 'pagina.js'), 'utf8');
    expect(pagina.includes('EventSource') && pagina.includes(RUTA_DEL_ESTUDIO) && pagina.includes('worker.js')).toBe(true);
    expect(readFileSync(join(salida, 'worker.js'), 'utf8').length).toBeGreaterThan(1000);
    expect(readFileSync(join(salida, 'estilo.css'), 'utf8')).toContain('#raiz');
  }, 60_000);

  it('CodeMirror va en un trozo que se carga al abrir Codigo, no en la pagina', async () => {
    const salida = temporal();

    await construirEstudio({ salida });

    const pagina = readFileSync(join(salida, 'pagina.js'), 'utf8');
    const trozos = readdirSync(join(salida, 'trozos')).map((t) => readFileSync(join(salida, 'trozos', t), 'utf8'));
    expect(pagina.includes('cm-scroller')).toBe(false);
    expect(trozos.some((t) => t.includes('cm-scroller'))).toBe(true);
    expect(pagina).toContain('./trozos/');
  }, 60_000);

  it('the export page is one script without the editor or its own ELK (ELK goes once, in the Worker)', async () => {
    const salida = temporal();

    await construirEstudio({ salida });

    const exportada = readFileSync(join(salida, 'exportado.js'), 'utf8');
    expect(exportada).not.toMatch(/^\s*import\b|\bimport\(/m);
    expect(exportada.includes('cm-scroller')).toBe(false);
    expect(exportada.includes('org.eclipse.elk')).toBe(false);
    expect(readFileSync(join(salida, 'worker.js'), 'utf8')).toContain('org.eclipse.elk');
  }, 60_000);

  it('el paso de CSS es conectable: recibe la entrada y su salida es la hoja servida', async () => {
    const salida = temporal();
    const entradas: string[] = [];

    await construirEstudio({
      salida,
      css: async (entrada) => {
        entradas.push(entrada);
        return '/* hoja propia */';
      },
    });

    expect(entradas).toEqual([expect.stringMatching(/estilo\.css$/)]);
    expect(readFileSync(join(salida, 'estilo.css'), 'utf8')).toBe('/* hoja propia */');
  }, 60_000);
});

describe('activosDelEstudio', () => {
  it('da el HTML de / y, por nombre bajo /_estudio/, los mismos archivos que produce el build, dentro de dist/', () => {
    const { indice, archivos } = activosDelEstudio();

    expect(indice.endsWith(`${sep}dist${sep}estudio${sep}index.html`)).toBe(true);
    const trozos = readdirSync(join(indice, '..', 'trozos')).map((t) => `trozos/${t}`);
    expect(trozos.length).toBeGreaterThan(0);
    expect(Object.keys(archivos).sort()).toEqual(['estilo.css', 'pagina.js', ...trozos, 'worker.js'].sort());
    for (const [nombre, ruta] of Object.entries(archivos)) expect(ruta).toBe(join(indice, '..', ...nombre.split('/')));
  });
});
