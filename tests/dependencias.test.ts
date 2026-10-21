import { mkdirSync, readdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import { afterAll, describe, expect, it } from 'vitest';

import { CADENA, revisarWorkspace } from '../scripts/check-dependencies';

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
    expect(CADENA).toEqual(['canonico', 'dsl', 'layout', 'sesion', 'render', 'shell', 'cli']);
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

  it('este workspace no tiene violaciones', () => {
    expect(revisarWorkspace(raizDelRepo)).toEqual([]);
  });
});

describe('manifiestos de este workspace', () => {
  it('cada paquete declara exports con solo la entrada raiz', () => {
    const nombres = ['canonico', 'dsl', 'layout', 'sesion', 'render', 'shell', 'cli'];
    for (const nombre of nombres) {
      const ruta = resolve(raizDelRepo, 'packages', nombre, 'package.json');
      const manifiestoLeido = JSON.parse(readFileSync(ruta, 'utf8')) as {
        exports: Record<string, unknown>;
      };
      expect(Object.keys(manifiestoLeido.exports), nombre).toEqual(['.']);
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

  it('el workspace real cumple la regla de pureza', () => {
    expect(revisarWorkspace(raizDelRepo).filter((v) => v.regla === 'pureza')).toEqual([]);
  });
});
