import { mkdirSync, readdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import { afterAll, describe, expect, it } from 'vitest';

import { CHAIN, CORE, ALLOWED_SUBPATHS, checkWorkspace } from '../scripts/check-dependencies';

const repoRoot = resolve(fileURLToPath(new URL('.', import.meta.url)), '..');
const temporaries: string[] = [];

afterAll(() => {
  for (const folder of temporaries) {
    rmSync(folder, { force: true, recursive: true });
  }
});

function manifest(name: string, extra: Record<string, unknown> = {}): string {
  return JSON.stringify(
    {
      name,
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

function createWorkspace(files: Record<string, string>): string {
  const root = mkdtempSync(join(tmpdir(), 'check-deps-'));
  temporaries.push(root);
  for (const [path, content] of Object.entries(files)) {
    const target = join(root, path);
    mkdirSync(dirname(target), { recursive: true });
    writeFileSync(target, content);
  }
  return root;
}

describe('checkWorkspace', () => {
  it('uses the dependency chain of ADR 0004', () => {
    expect(CHAIN).toEqual(['canonical', 'theme', 'dsl', 'layout', 'session', 'render', 'shell', 'dev-ui', 'cli']);
  });

  it('dev-ui stays outside the pure core (it uses DOM, fetch and EventSource)', () => {
    expect(CORE).not.toContain('dev-ui');
  });

  it('fails if a package imports from a later one in the chain', () => {
    const root = createWorkspace({
      'packages/canonical/package.json': manifest('canonical'),
      'packages/canonical/src/index.ts': "import { thing } from 'dsl';\nexport const own = thing;\n",
      'packages/dsl/package.json': manifest('dsl'),
      'packages/dsl/src/index.ts': 'export const thing = 1;\n',
    });

    expect(checkWorkspace(root)).toContainEqual(
      expect.objectContaining({ package: 'canonical', rule: 'order' }),
    );
  });

  it('fails if a package imports an internal file of another package', () => {
    const root = createWorkspace({
      'packages/canonical/package.json': manifest('canonical'),
      'packages/canonical/src/index.ts': 'export const kind = 1;\n',
      'packages/canonical/src/types.ts': 'export const internal = 2;\n',
      'packages/layout/package.json': manifest('layout'),
      'packages/layout/src/index.ts':
        "import { internal } from 'canonical/src/types';\nexport const own = internal;\n",
    });

    expect(checkWorkspace(root)).toContainEqual(
      expect.objectContaining({ package: 'layout', rule: 'internal' }),
    );
  });

  it('fails if a relative import crosses from one package to another', () => {
    const root = createWorkspace({
      'packages/render/package.json': manifest('render'),
      'packages/render/src/index.ts': 'export const thing = 1;\n',
      'packages/shell/package.json': manifest('shell'),
      'packages/shell/src/view.ts': "export { thing } from '../../render/src/index';\n",
    });

    expect(checkWorkspace(root)).toContainEqual(
      expect.objectContaining({ package: 'shell', rule: 'internal' }),
    );
  });

  it('fails if exports exposes anything beyond the root entry', () => {
    const root = createWorkspace({
      'packages/canonical/package.json': manifest('canonical', {
        exports: {
          '.': { types: './dist/index.d.ts', import: './dist/index.js' },
          './internal': './dist/internal.js',
        },
      }),
      'packages/canonical/src/index.ts': 'export const thing = 1;\n',
    });

    expect(checkWorkspace(root)).toContainEqual(
      expect.objectContaining({ package: 'canonical', rule: 'exports' }),
    );
  });

  it('accepts in dev-ui the protocol and contract subpaths, and rejects any other', () => {
    const root = createWorkspace({
      'packages/dev-ui/package.json': manifest('dev-ui', {
        exports: {
          '.': { types: './dist/index.d.ts', import: './dist/index.js' },
          './protocol': './dist/protocol.js',
          './contract': './dist/contract.js',
          './internal': './dist/internal.js',
        },
      }),
      'packages/dev-ui/src/index.ts': 'export const thing = 1;\n',
      'packages/cli/package.json': manifest('cli', { dependencies: { 'dev-ui': 'workspace:*' } }),
      'packages/cli/src/index.ts': "import type { Thing } from 'dev-ui/protocol';\nexport type Own = Thing;\n",
    });

    const violations = checkWorkspace(root);

    expect(violations).toEqual([expect.objectContaining({ package: 'dev-ui', rule: 'exports', message: expect.stringContaining('./internal') })]);
  });

  it('fails if a package does not declare exports', () => {
    const root = createWorkspace({
      'packages/canonical/package.json': JSON.stringify({
        name: 'canonical',
        version: '0.0.0',
        private: true,
        type: 'module',
      }),
      'packages/canonical/src/index.ts': 'export const thing = 1;\n',
    });

    expect(checkWorkspace(root)).toContainEqual(
      expect.objectContaining({ package: 'canonical', rule: 'exports' }),
    );
  });

  it('fails if a package imports another workspace package without declaring it', () => {
    const root = createWorkspace({
      'packages/canonical/package.json': manifest('canonical'),
      'packages/canonical/src/index.ts': 'export const thing = 1;\n',
      'packages/dsl/package.json': manifest('dsl'),
      'packages/dsl/src/index.ts': "import { thing } from 'canonical';\nexport const own = thing;\n",
    });

    expect(checkWorkspace(root)).toContainEqual(
      expect.objectContaining({ package: 'dsl', rule: 'declaration' }),
    );
  });

  it('fails if a package is not in the declared chain', () => {
    const root = createWorkspace({
      'packages/extra/package.json': manifest('extra'),
      'packages/extra/src/index.ts': 'export const thing = 1;\n',
    });

    expect(checkWorkspace(root)).toContainEqual(
      expect.objectContaining({ package: 'extra', rule: 'chain' }),
    );
  });

  it('scanner sits outside the chain: only cli imports it and it imports no workspace package', () => {
    const root = createWorkspace({
      'packages/canonical/package.json': manifest('canonical', { dependencies: { scanner: 'workspace:*' } }),
      'packages/canonical/src/index.ts': "import { scan } from 'scanner';\nexport const s = scan;\n",
      'packages/scanner/package.json': manifest('scanner', { dependencies: { canonical: 'workspace:*' } }),
      'packages/scanner/src/index.ts': "import { thing } from 'canonical';\nexport const scan = thing;\n",
      'packages/cli/package.json': manifest('cli', { dependencies: { scanner: 'workspace:*' } }),
      'packages/cli/src/index.ts': "import { scan } from 'scanner';\nexport const s = scan;\n",
    });

    expect(checkWorkspace(root).map((v) => [v.package, v.rule])).toEqual([
      ['canonical', 'isolated'],
      ['scanner', 'isolated'],
    ]);
  });

  it('accepts a legal import by name, declared and towards an earlier package', () => {
    const root = createWorkspace({
      'packages/canonical/package.json': manifest('canonical'),
      'packages/canonical/src/index.ts': 'export const thing = 1;\n',
      'packages/dsl/package.json': manifest('dsl', { dependencies: { canonical: 'workspace:*' } }),
      'packages/dsl/src/index.ts': "import { thing } from 'canonical';\nexport const own = thing;\n",
    });

    expect(checkWorkspace(root)).toEqual([]);
  });

  it('ignores imports that only appear in comments', () => {
    const root = createWorkspace({
      'packages/canonical/package.json': manifest('canonical'),
      'packages/canonical/src/index.ts':
        "// one day I will import from 'dsl'\n" +
        "/* and also from 'layout' */\n" +
        "export const pkg = 'canonical';\n",
    });

    expect(checkWorkspace(root)).toEqual([]);
  });

  it("a package's tests import the shared helpers of tests/helpers; the source code does not", () => {
    const root = createWorkspace({
      'tests/helpers/canvas.ts': 'export const helper = 1;\n',
      'packages/shell/package.json': manifest('shell'),
      'packages/shell/src/index.ts': "import { helper } from '../../../tests/helpers/canvas';\nexport const own = helper;\n",
      'packages/shell/test/helpers.ts': "import { helper } from '../../../tests/helpers/canvas';\nexport const other = helper;\n",
      'packages/shell/test/other.test.ts': "import { x } from '../../../tests/dependencies.test';\nexport const y = x;\n",
    });

    expect(checkWorkspace(root).map((v) => [v.file, v.rule])).toEqual([
      ['packages/shell/src/index.ts', 'internal'],
      ['packages/shell/test/other.test.ts', 'internal'],
    ]);
  });

  it('fails if a package re-exports names from another package, also in multi-line blocks', () => {
    const root = createWorkspace({
      'packages/canonical/package.json': manifest('canonical'),
      'packages/canonical/src/index.ts': 'export const thing = 1;\nexport type Box = { x: number };\n',
      'packages/layout/package.json': manifest('layout', { dependencies: { canonical: 'workspace:*' } }),
      'packages/layout/src/index.ts': "export { thing } from 'canonical';\n",
      'packages/layout/src/types.ts': "export type {\n  Box,\n} from 'canonical';\n",
      'packages/layout/src/all.ts': "export * from 'canonical';\n",
    });

    const reexports = checkWorkspace(root).filter((v) => v.rule === 'reexport');
    expect(reexports.map((v) => [v.package, v.file])).toEqual([
      ['layout', 'packages/layout/src/all.ts'],
      ['layout', 'packages/layout/src/index.ts'],
      ['layout', 'packages/layout/src/types.ts'],
    ]);
  });

  it('accepts own re-exports and those of the exceptions: dev-ui/protocol and the shell facade', () => {
    const root = createWorkspace({
      'packages/canonical/package.json': manifest('canonical'),
      'packages/canonical/src/index.ts': "export { thing } from './thing';\n",
      'packages/canonical/src/thing.ts': 'export const thing = 1;\n',
      'packages/shell/package.json': manifest('shell', { dependencies: { canonical: 'workspace:*' } }),
      'packages/shell/src/index.ts': "export { thing } from 'canonical';\n",
      'packages/dev-ui/package.json': manifest('dev-ui', {
        dependencies: { canonical: 'workspace:*' },
        exports: { '.': './dist/index.js', './protocol': './dist/protocol.js' },
      }),
      'packages/dev-ui/src/index.ts': 'export const app = 1;\n',
      'packages/dev-ui/src/protocol.ts': "export type { thing } from 'canonical';\n",
    });

    expect(checkWorkspace(root)).toEqual([]);
  });

  it('scripts/ and bench/ only use the declared interfaces of the packages', () => {
    const root = createWorkspace({
      'packages/cli/package.json': manifest('cli'),
      'packages/cli/src/index.ts': 'export const run = 1;\n',
      'packages/cli/test/chromium.ts': 'export const path = 1;\n',
      'packages/dev-ui/package.json': manifest('dev-ui', {
        exports: { '.': './dist/index.js', './protocol': './dist/protocol.js' },
      }),
      'packages/dev-ui/src/index.ts': 'export const app = 1;\n',
      'packages/dev-ui/scripts/bundle.ts': 'export const build = 1;\n',
      'tests/helpers/chromium.ts': 'export const path = 1;\n',
      'scripts/screenshots.ts':
        "import { run } from 'cli';\nimport type { X } from 'dev-ui/protocol';\nimport { path } from '../tests/helpers/chromium.ts';\nimport { path as other } from '../packages/cli/test/chromium.ts';\nexport const y = [run, path, other] as unknown as X;\n",
      'scripts/screenshots/servers.ts': "import { app } from 'dev-ui/src/index';\nexport const s = app;\n",
      'bench/scenario.ts': "import { build } from '../packages/dev-ui/scripts/bundle.ts';\nexport const b = build;\n",
    });

    expect(checkWorkspace(root).map((v) => [v.package, v.file, v.rule])).toEqual([
      ['(root)', 'scripts/screenshots.ts', 'internal'],
      ['(root)', 'scripts/screenshots/servers.ts', 'internal'],
      ['(root)', 'bench/scenario.ts', 'internal'],
    ]);
  });

  it('this workspace has no violations', () => {
    expect(checkWorkspace(repoRoot)).toEqual([]);
  });
});

describe('manifests of this workspace', () => {
  it('each package declares exports with the root entry and only the subpaths the check allows', () => {
    for (const name of CHAIN) {
      const path = resolve(repoRoot, 'packages', name, 'package.json');
      const read = JSON.parse(readFileSync(path, 'utf8')) as {
        exports: Record<string, unknown>;
      };
      const allowed = ['.', ...((ALLOWED_SUBPATHS as Record<string, readonly string[]>)[name] ?? [])];
      expect(Object.keys(read.exports)[0], name).toBe('.');
      for (const key of Object.keys(read.exports)) expect(allowed, `${name} ${key}`).toContain(key);
    }
  });

  it('each package.json.name matches the name of its folder in packages/', () => {
    const folders = readdirSync(resolve(repoRoot, 'packages')).sort();
    for (const folder of folders) {
      if (folder.startsWith('.')) continue;
      const path = resolve(repoRoot, 'packages', folder, 'package.json');
      const read = JSON.parse(readFileSync(path, 'utf8')) as { name?: string };
      expect(read.name ?? folder, `${folder}/package.json.name`).toEqual(folder);
    }
  });

  it('fails if the core imports Node or uses the clock, and lets tests and adapters through', () => {
    const root = createWorkspace({
      'packages/canonical/package.json': manifest('canonical'),
      'packages/canonical/src/index.ts':
        "import { readFileSync } from 'node:fs';\nexport const t = Date.now();\n",
      'packages/canonical/test/a.test.ts': "import 'node:fs';\nexport const t = Date.now();\n",
      'packages/layout/package.json': manifest('layout', {
        dependencies: { canonical: 'workspace:*' },
      }),
      'packages/layout/src/index.ts': "import 'node:fs';\nexport const t = Date.now();\n",
    });

    const purity = checkWorkspace(root).filter((v) => v.rule === 'purity');

    expect(purity.map((v) => `${v.package}:${v.file}`)).toEqual([
      'canonical:packages/canonical/src/index.ts',
      'canonical:packages/canonical/src/index.ts',
    ]);
  });

  it('the theme package is in the pure core and may only import from canonical', () => {
    const root = createWorkspace({
      'packages/canonical/package.json': manifest('canonical'),
      'packages/canonical/src/index.ts': 'export const a = 1;\n',
      'packages/theme/package.json': manifest('theme', { dependencies: { canonical: 'workspace:*' } }),
      'packages/theme/src/index.ts': "import { a } from 'canonical';\nexport const t = a + Math.random();\n",
      'packages/dsl/package.json': manifest('dsl'),
      'packages/dsl/src/index.ts': "import { t } from 'theme';\nexport const d = t;\n",
    });

    const violations = checkWorkspace(root);

    expect(violations).toContainEqual(expect.objectContaining({ package: 'theme', rule: 'purity' }));
    expect(violations).toContainEqual(expect.objectContaining({ package: 'dsl', rule: 'declaration' }));
    expect(violations.filter((v) => v.rule === 'order')).toEqual([]);
  });

  it('the real workspace meets the purity rule', () => {
    expect(checkWorkspace(repoRoot).filter((v) => v.rule === 'purity')).toEqual([]);
  });
});
