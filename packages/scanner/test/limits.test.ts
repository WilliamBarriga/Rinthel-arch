import { execFileSync } from 'node:child_process';
import { existsSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

import { describe, expect, it } from 'vitest';

import { DEFAULT_MAX_FILES, scan, serializeDraft } from 'scanner';

import { MONOREPO, json, makeRepo } from './repos';

describe('scan: languages without import support', () => {
  it('gives units from pyproject.toml, go.mod and Cargo.toml and declares their languages in limits', async () => {
    const draft = await scan(
      makeRepo({
        'services/billing/pyproject.toml': '[build-system]\nrequires = ["hatchling"]\n\n[project]\nname = "billing"\nversion = "1.0"\n',
        'services/billing/billing/app.py': 'import os\nfrom billing import models\n',
        'services/billing/billing/models.py': '',
        'services/legacy/pyproject.toml': '[tool.poetry]\nname = "legacy"\n',
        'services/gateway/go.mod': 'module github.com/acme/gateway\n\ngo 1.22\n',
        'services/gateway/main.go': 'package main\n',
        'crates/core/Cargo.toml': '[package]\nname = "core"\nversion = "0.1.0"\n',
        'crates/core/src/lib.rs': '',
        'crates/cli/Cargo.toml': '[package]\nname = "acme-cli"\n\n[[bin]]\nname = "acme"\n',
        'Cargo.toml': '[workspace]\nmembers = ["crates/*"]\n',
      }),
    );

    expect(draft.units.map(({ id, name, kind, languages }) => [id, name, kind, languages])).toEqual([
      ['.', '.', 'module', []],
      ['crates/cli', 'acme-cli', 'app', []],
      ['crates/core', 'core', 'package', ['rust']],
      ['services/billing', 'billing', 'package', ['python']],
      ['services/gateway', 'github.com/acme/gateway', 'module', ['go']],
      ['services/legacy', 'legacy', 'package', []],
    ].map(([id, name, ...rest]) => (id === '.' ? [id, expect.any(String), ...rest] : [id, name, ...rest])));
    expect(draft.dependencies).toEqual([]);
    expect(draft.limits.languagesWithoutImports).toEqual([
      { language: 'go', files: 1 },
      { language: 'python', files: 2 },
      { language: 'rust', files: 1 },
    ]);
  });
});

describe('scan: determinism', () => {
  it('two runs on the same commit produce byte-identical drafts, with the commit read from .git', async () => {
    const root = makeRepo(MONOREPO);
    const git = (...args: string[]) => execFileSync('git', args, { cwd: root, encoding: 'utf8' }).trim();
    git('init', '-q');
    git('-c', 'user.email=t@t', '-c', 'user.name=t', 'add', '.');
    git('-c', 'user.email=t@t', '-c', 'user.name=t', 'commit', '-qm', 'fixture');
    const head = git('rev-parse', 'HEAD');

    const first = serializeDraft(await scan(root));
    const second = serializeDraft(await scan(root));

    expect(second).toBe(first);
    expect(JSON.parse(first).commit).toBe(head);
    expect(first.endsWith('}\n')).toBe(true);
  });

  it('outside a git repo the commit is null', async () => {
    expect((await scan(makeRepo({ 'a.ts': '' }))).commit).toBeNull();
  });
});

describe('scan: what it reads', () => {
  it('always skips dependencies, build output, virtualenvs and vendored code, and honors nested .gitignore files', async () => {
    const draft = await scan(
      makeRepo({
        'package.json': json({ name: 'app' }),
        '.gitignore': 'generated/\n*.log\n',
        'src/index.ts': "import x from 'left-pad';\n",
        'src/.gitignore': 'secret.ts\n',
        'src/secret.ts': "import y from 'hidden';\n",
        'debug.log': '',
        'generated/api.ts': "import z from 'hidden';\n",
        'node_modules/left-pad/package.json': json({ name: 'left-pad' }),
        'node_modules/left-pad/index.js': '',
        'dist/index.js': "require('hidden');\n",
        'build/out.js': "require('hidden');\n",
        '.venv/lib/site.py': '',
        'vendor/lib/package.json': json({ name: 'vendored' }),
        'vendor/lib/x.js': "require('hidden');\n",
      }),
    );

    expect(draft.units.map(({ id }) => id)).toEqual(['.']);
    expect(draft.limits.files).toBe(4);
    expect(draft.externals.map(({ id }) => id)).toEqual(['npm:left-pad']);
  });

  it('--max-files stops the listing and marks limits.truncated without failing', async () => {
    const files: Record<string, string> = { 'package.json': json({ name: 'big' }) };
    for (let i = 0; i < 10; i++) files[`src/f${i}.ts`] = "import 'react';\n";
    const root = makeRepo(files);

    const capped = await scan(root, { maxFiles: 4 });
    const whole = await scan(root, { maxFiles: 11 });

    expect(capped.limits).toMatchObject({ maxFiles: 4, files: 4, truncated: true });
    expect(capped.externals[0]?.weight).toBe(3);
    expect(whole.limits).toMatchObject({ maxFiles: 11, files: 11, truncated: false });
    expect((await scan(root)).limits.maxFiles).toBe(DEFAULT_MAX_FILES);
  });

  it('never runs project code: scripts, imported modules and git hooks stay untouched', async () => {
    const marker = (name: string) => `require('node:fs').writeFileSync(${JSON.stringify(name)}, 'ran')`;
    const root = makeRepo({});
    const ran = (name: string) => join(root, `ran-${name}`);
    writeFileSync(join(root, 'package.json'), json({ name: 'evil', scripts: { preinstall: marker(ran('script')), prepare: marker(ran('script')) } }));
    writeFileSync(join(root, 'index.js'), `${marker(ran('module'))};\nrequire('./other');\n`);
    writeFileSync(join(root, 'other.js'), `${marker(ran('module'))};\n`);
    writeFileSync(join(root, 'setup.py'), `open(${JSON.stringify(ran('python'))}, 'w').write('ran')\n`);
    execFileSync('git', ['init', '-q'], { cwd: root });
    execFileSync('git', ['config', 'core.fsmonitor', `touch ${ran('fsmonitor')}`], { cwd: root });

    const draft = await scan(root);

    expect(draft.units.map(({ name }) => name)).toEqual(['evil']);
    for (const name of ['script', 'module', 'python', 'fsmonitor']) expect(existsSync(ran(name)), name).toBe(false);
  });
});

describe('scan: TS/JS imports', () => {
  it('reads import-equals, re-exports and declaration files; aliases and URLs count as unresolved', async () => {
    const draft = await scan(
      makeRepo({
        'package.json': json({ name: 'app', workspaces: ['lib'] }),
        'lib/package.json': json({ name: 'lib', main: 'index.ts' }),
        'lib/index.ts': 'export const one = 1;\n',
        'src/a.ts': "import lib = require('lib');\nexport * from '../lib/index.js';\nimport x from '@/alias';\nimport y from 'https://esm.sh/x';\n",
        'src/types.d.ts': "import type { One } from 'lib';\n",
        'src/missing.ts': "import z from '../lib/gone';\n",
      }),
    );

    expect(draft.dependencies).toEqual([
      expect.objectContaining({
        id: '.->lib',
        weight: 4,
        examples: [
          { file: 'src/a.ts', line: 1 },
          { file: 'src/a.ts', line: 2 },
          { file: 'src/missing.ts', line: 1 },
        ],
        confidence: 'extracted',
      }),
    ]);
    expect(draft.limits.unresolvedImports).toBe(2);
  });

  it('a dependency known only through paths that do not exist is inferred', async () => {
    const draft = await scan(makeRepo({ 'package.json': json({ name: 'app' }), 'src/a.ts': "import z from '../lib/gone';\n", 'lib/package.json': json({ name: 'lib' }) }));

    expect(draft.dependencies).toEqual([expect.objectContaining({ id: '.->lib', confidence: 'inferred' })]);
  });
});
