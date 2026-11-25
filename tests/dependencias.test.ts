import { mkdirSync, readdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import { afterAll, describe, expect, it } from 'vitest';

import { CADENA, NUCLEO, SUBPATHS_PERMITIDOS, revisarWorkspace } from '../scripts/check-dependencies';

const raizDelRepo = resolve(fileURLToPath(new URL('.', import.meta.url)), '..');
const temporales: string[] = [];

afterAll(() => {
  for (const carpeta of temporales) {
    rmSync(carpeta, { force: true, recursive: true });
  }
});

function manifiesto(nombre: string, extra: Record<string, unknown> = {}): string {
  return JSON.stringify(
    {
      name: nombre,
      version: '0.0.0',
      private: true,
      type: 'module',
      exports: { '.': { types: './dist/index.d.ts', import: './dist/index.js' } },
      ...extra,
    },
    null,
    2,
  );
}

function crearWorkspace(archivos: Record<string, string>): string {
  const raiz = mkdtempSync(join(tmpdir(), 'check-deps-'));
  temporales.push(raiz);
  for (const [ruta, contenido] of Object.entries(archivos)) {
    const destino = join(raiz, ruta);
    mkdirSync(dirname(destino), { recursive: true });
    writeFileSync(destino, contenido);
  }
  return raiz;
}

describe('revisarWorkspace', () => {
  it('usa la cadena de dependencias de ADR 0004', () => {
    expect(CADENA).toEqual(['canonico', 'tema', 'dsl', 'layout', 'sesion', 'render', 'shell', 'estudio', 'cli']);
  });

  it('estudio queda fuera del nucleo puro (usa DOM, fetch y EventSource)', () => {
    expect(NUCLEO).not.toContain('estudio');
  });

  it('falla si un paquete importa de uno posterior en la cadena', () => {
    const raiz = crearWorkspace({
      'packages/canonico/package.json': manifiesto('canonico'),
      'packages/canonico/src/index.ts': "import { algo } from 'dsl';\nexport const propio = algo;\n",
      'packages/dsl/package.json': manifiesto('dsl'),
      'packages/dsl/src/index.ts': 'export const algo = 1;\n',
    });

    expect(revisarWorkspace(raiz)).toContainEqual(
      expect.objectContaining({ paquete: 'canonico', regla: 'orden' }),
    );
  });

  it('falla si un paquete importa un archivo interno de otro paquete', () => {
    const raiz = crearWorkspace({
      'packages/canonico/package.json': manifiesto('canonico'),
      'packages/canonico/src/index.ts': 'export const tipo = 1;\n',
      'packages/canonico/src/tipos.ts': 'export const interno = 2;\n',
      'packages/layout/package.json': manifiesto('layout'),
      'packages/layout/src/index.ts':
        "import { interno } from 'canonico/src/tipos';\nexport const propio = interno;\n",
    });

    expect(revisarWorkspace(raiz)).toContainEqual(
      expect.objectContaining({ paquete: 'layout', regla: 'interno' }),
    );
  });

  it('falla si un import relativo cruza de un paquete a otro', () => {
    const raiz = crearWorkspace({
      'packages/render/package.json': manifiesto('render'),
      'packages/render/src/index.ts': 'export const algo = 1;\n',
      'packages/shell/package.json': manifiesto('shell'),
      'packages/shell/src/vista.ts': "export { algo } from '../../render/src/index';\n",
    });

    expect(revisarWorkspace(raiz)).toContainEqual(
      expect.objectContaining({ paquete: 'shell', regla: 'interno' }),
    );
  });

  it('falla si exports expone algo mas alla de la entrada raiz', () => {
    const raiz = crearWorkspace({
      'packages/canonico/package.json': manifiesto('canonico', {
        exports: {
          '.': { types: './dist/index.d.ts', import: './dist/index.js' },
          './interno': './dist/interno.js',
        },
      }),
      'packages/canonico/src/index.ts': 'export const algo = 1;\n',
    });

    expect(revisarWorkspace(raiz)).toContainEqual(
      expect.objectContaining({ paquete: 'canonico', regla: 'exports' }),
    );
  });

  it('acepta en estudio los subpaths del protocolo y del contrato, y rechaza cualquier otro', () => {
    const raiz = crearWorkspace({
      'packages/estudio/package.json': manifiesto('estudio', {
        exports: {
          '.': { types: './dist/index.d.ts', import: './dist/index.js' },
          './protocolo': './dist/protocolo.js',
          './contrato': './dist/contrato.js',
          './interno': './dist/interno.js',
        },
      }),
      'packages/estudio/src/index.ts': 'export const algo = 1;\n',
      'packages/cli/package.json': manifiesto('cli', { dependencies: { estudio: 'workspace:*' } }),
      'packages/cli/src/index.ts': "import type { Algo } from 'estudio/protocolo';\nexport type Propio = Algo;\n",
    });

    const violaciones = revisarWorkspace(raiz);

    expect(violaciones).toEqual([expect.objectContaining({ paquete: 'estudio', regla: 'exports', mensaje: expect.stringContaining('./interno') })]);
  });

  it('falla si un paquete no declara exports', () => {
    const raiz = crearWorkspace({
      'packages/canonico/package.json': JSON.stringify({
        name: 'canonico',
        version: '0.0.0',
        private: true,
        type: 'module',
      }),
      'packages/canonico/src/index.ts': 'export const algo = 1;\n',
    });

    expect(revisarWorkspace(raiz)).toContainEqual(
      expect.objectContaining({ paquete: 'canonico', regla: 'exports' }),
    );
  });

  it('falla si un paquete importa otro del workspace sin declararlo', () => {
    const raiz = crearWorkspace({
      'packages/canonico/package.json': manifiesto('canonico'),
      'packages/canonico/src/index.ts': 'export const algo = 1;\n',
      'packages/dsl/package.json': manifiesto('dsl'),
      'packages/dsl/src/index.ts': "import { algo } from 'canonico';\nexport const propio = algo;\n",
    });

    expect(revisarWorkspace(raiz)).toContainEqual(
      expect.objectContaining({ paquete: 'dsl', regla: 'declaracion' }),
    );
  });

  it('falla si un paquete no esta en la cadena declarada', () => {
    const raiz = crearWorkspace({
      'packages/extra/package.json': manifiesto('extra'),
      'packages/extra/src/index.ts': 'export const algo = 1;\n',
    });

    expect(revisarWorkspace(raiz)).toContainEqual(
      expect.objectContaining({ paquete: 'extra', regla: 'cadena' }),
    );
  });

  it('scanner sits outside the chain: only cli imports it and it imports no workspace package', () => {
    const raiz = crearWorkspace({
      'packages/canonico/package.json': manifiesto('canonico', { dependencies: { scanner: 'workspace:*' } }),
      'packages/canonico/src/index.ts': "import { scan } from 'scanner';\nexport const s = scan;\n",
      'packages/scanner/package.json': manifiesto('scanner', { dependencies: { canonico: 'workspace:*' } }),
      'packages/scanner/src/index.ts': "import { algo } from 'canonico';\nexport const scan = algo;\n",
      'packages/cli/package.json': manifiesto('cli', { dependencies: { scanner: 'workspace:*' } }),
      'packages/cli/src/index.ts': "import { scan } from 'scanner';\nexport const s = scan;\n",
    });

    expect(revisarWorkspace(raiz).map((v) => [v.paquete, v.regla])).toEqual([
      ['canonico', 'aislado'],
      ['scanner', 'aislado'],
    ]);
  });

  it('acepta un import legal por nombre, declarado y hacia un paquete anterior', () => {
    const raiz = crearWorkspace({
      'packages/canonico/package.json': manifiesto('canonico'),
      'packages/canonico/src/index.ts': 'export const algo = 1;\n',
      'packages/dsl/package.json': manifiesto('dsl', { dependencies: { canonico: 'workspace:*' } }),
      'packages/dsl/src/index.ts': "import { algo } from 'canonico';\nexport const propio = algo;\n",
    });

    expect(revisarWorkspace(raiz)).toEqual([]);
  });

  it('ignora los import que solo aparecen en comentarios', () => {
    const raiz = crearWorkspace({
      'packages/canonico/package.json': manifiesto('canonico'),
      'packages/canonico/src/index.ts':
        "// un dia importare de 'dsl'\n" +
        "/* y tambien from 'layout' */\n" +
        "export const paquete = 'canonico';\n",
    });

    expect(revisarWorkspace(raiz)).toEqual([]);
  });

  it('las pruebas de un paquete importan las ayudas compartidas de tests/ayudas; el codigo fuente no', () => {
    const raiz = crearWorkspace({
      'tests/ayudas/lienzo.ts': 'export const ayuda = 1;\n',
      'packages/shell/package.json': manifiesto('shell'),
      'packages/shell/src/index.ts': "import { ayuda } from '../../../tests/ayudas/lienzo';\nexport const propio = ayuda;\n",
      'packages/shell/test/ayudas.ts': "import { ayuda } from '../../../tests/ayudas/lienzo';\nexport const otra = ayuda;\n",
      'packages/shell/test/otra.test.ts': "import { x } from '../../../tests/dependencias.test';\nexport const y = x;\n",
    });

    expect(revisarWorkspace(raiz).map((v) => [v.archivo, v.regla])).toEqual([
      ['packages/shell/src/index.ts', 'interno'],
      ['packages/shell/test/otra.test.ts', 'interno'],
    ]);
  });

  it('falla si un paquete reexporta nombres de otro paquete, tambien en bloques de varias lineas', () => {
    const raiz = crearWorkspace({
      'packages/canonico/package.json': manifiesto('canonico'),
      'packages/canonico/src/index.ts': 'export const algo = 1;\nexport type Caja = { x: number };\n',
      'packages/layout/package.json': manifiesto('layout', { dependencies: { canonico: 'workspace:*' } }),
      'packages/layout/src/index.ts': "export { algo } from 'canonico';\n",
      'packages/layout/src/tipos.ts': "export type {\n  Caja,\n} from 'canonico';\n",
      'packages/layout/src/todo.ts': "export * from 'canonico';\n",
    });

    const reexportes = revisarWorkspace(raiz).filter((v) => v.regla === 'reexporte');
    expect(reexportes.map((v) => [v.paquete, v.archivo])).toEqual([
      ['layout', 'packages/layout/src/index.ts'],
      ['layout', 'packages/layout/src/tipos.ts'],
      ['layout', 'packages/layout/src/todo.ts'],
    ]);
  });

  it('acepta reexportes propios y los de las excepciones: estudio/protocolo y la fachada de shell', () => {
    const raiz = crearWorkspace({
      'packages/canonico/package.json': manifiesto('canonico'),
      'packages/canonico/src/index.ts': "export { algo } from './algo';\n",
      'packages/canonico/src/algo.ts': 'export const algo = 1;\n',
      'packages/shell/package.json': manifiesto('shell', { dependencies: { canonico: 'workspace:*' } }),
      'packages/shell/src/index.ts': "export { algo } from 'canonico';\n",
      'packages/estudio/package.json': manifiesto('estudio', {
        dependencies: { canonico: 'workspace:*' },
        exports: { '.': './dist/index.js', './protocolo': './dist/protocolo.js' },
      }),
      'packages/estudio/src/index.ts': 'export const app = 1;\n',
      'packages/estudio/src/protocolo.ts': "export type { algo } from 'canonico';\n",
    });

    expect(revisarWorkspace(raiz)).toEqual([]);
  });

  it('scripts/ y bench/ solo usan interfaces declaradas de los paquetes', () => {
    const raiz = crearWorkspace({
      'packages/cli/package.json': manifiesto('cli'),
      'packages/cli/src/index.ts': 'export const run = 1;\n',
      'packages/cli/test/chromium.ts': 'export const ruta = 1;\n',
      'packages/estudio/package.json': manifiesto('estudio', {
        exports: { '.': './dist/index.js', './protocolo': './dist/protocolo.js' },
      }),
      'packages/estudio/src/index.ts': 'export const app = 1;\n',
      'packages/estudio/scripts/empaquetar.ts': 'export const construir = 1;\n',
      'tests/ayudas/chromium.ts': 'export const ruta = 1;\n',
      'scripts/capturas.ts':
        "import { run } from 'cli';\nimport type { X } from 'estudio/protocolo';\nimport { ruta } from '../tests/ayudas/chromium.ts';\nimport { ruta as otra } from '../packages/cli/test/chromium.ts';\nexport const y = [run, ruta, otra] as unknown as X;\n",
      'scripts/capturas/servidores.ts': "import { app } from 'estudio/src/index';\nexport const s = app;\n",
      'bench/escenario.ts': "import { construir } from '../packages/estudio/scripts/empaquetar.ts';\nexport const b = construir;\n",
    });

    expect(revisarWorkspace(raiz).map((v) => [v.paquete, v.archivo, v.regla])).toEqual([
      ['(raiz)', 'scripts/capturas.ts', 'interno'],
      ['(raiz)', 'scripts/capturas/servidores.ts', 'interno'],
      ['(raiz)', 'bench/escenario.ts', 'interno'],
    ]);
  });

  it('este workspace no tiene violaciones', () => {
    expect(revisarWorkspace(raizDelRepo)).toEqual([]);
  });
});

describe('manifiestos de este workspace', () => {
  it('cada paquete declara exports con la entrada raiz y solo los subpaths que permite el chequeo', () => {
    for (const nombre of CADENA) {
      const ruta = resolve(raizDelRepo, 'packages', nombre, 'package.json');
      const manifiestoLeido = JSON.parse(readFileSync(ruta, 'utf8')) as {
        exports: Record<string, unknown>;
      };
      const permitidos = ['.', ...((SUBPATHS_PERMITIDOS as Record<string, readonly string[]>)[nombre] ?? [])];
      expect(Object.keys(manifiestoLeido.exports)[0], nombre).toBe('.');
      for (const clave of Object.keys(manifiestoLeido.exports)) expect(permitidos, `${nombre} ${clave}`).toContain(clave);
    }
  });

  it('cada package.json.name coincide con el nombre de su carpeta en packages/', () => {
    const carpetas = readdirSync(resolve(raizDelRepo, 'packages')).sort();
    for (const carpeta of carpetas) {
      if (carpeta.startsWith('.')) continue;
      const ruta = resolve(raizDelRepo, 'packages', carpeta, 'package.json');
      const manifiesto = JSON.parse(readFileSync(ruta, 'utf8')) as { name?: string };
      expect(manifiesto.name ?? carpeta, `${carpeta}/package.json.name`).toEqual(carpeta);
    }
  });

  it('falla si el nucleo importa Node o usa reloj, y deja pasar tests y adaptadores', () => {
    const raiz = crearWorkspace({
      'packages/canonico/package.json': manifiesto('canonico'),
      'packages/canonico/src/index.ts':
        "import { readFileSync } from 'node:fs';\nexport const t = Date.now();\n",
      'packages/canonico/test/a.test.ts': "import 'node:fs';\nexport const t = Date.now();\n",
      'packages/layout/package.json': manifiesto('layout', {
        dependencies: { canonico: 'workspace:*' },
      }),
      'packages/layout/src/index.ts': "import 'node:fs';\nexport const t = Date.now();\n",
    });

    const pureza = revisarWorkspace(raiz).filter((v) => v.regla === 'pureza');

    expect(pureza.map((v) => `${v.paquete}:${v.archivo}`)).toEqual([
      'canonico:packages/canonico/src/index.ts',
      'canonico:packages/canonico/src/index.ts',
    ]);
  });

  it('el paquete tema esta en el nucleo puro y solo puede importar de canonico', () => {
    const raiz = crearWorkspace({
      'packages/canonico/package.json': manifiesto('canonico'),
      'packages/canonico/src/index.ts': 'export const a = 1;\n',
      'packages/tema/package.json': manifiesto('tema', { dependencies: { canonico: 'workspace:*' } }),
      'packages/tema/src/index.ts': "import { a } from 'canonico';\nexport const t = a + Math.random();\n",
      'packages/dsl/package.json': manifiesto('dsl'),
      'packages/dsl/src/index.ts': "import { t } from 'tema';\nexport const d = t;\n",
    });

    const violaciones = revisarWorkspace(raiz);

    expect(violaciones).toContainEqual(expect.objectContaining({ paquete: 'tema', regla: 'pureza' }));
    expect(violaciones).toContainEqual(expect.objectContaining({ paquete: 'dsl', regla: 'declaracion' }));
    expect(violaciones.filter((v) => v.regla === 'orden')).toEqual([]);
  });

  it('el workspace real cumple la regla de pureza', () => {
    expect(revisarWorkspace(raizDelRepo).filter((v) => v.regla === 'pureza')).toEqual([]);
  });
});
