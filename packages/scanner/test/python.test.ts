import { describe, expect, it } from 'vitest';

import { scan } from 'scanner';

import { makeRepo } from './repos';

const pyproject = (name: string, dependencies: string[] = []): string =>
  `[project]\nname = "${name}"\ndependencies = [\n${dependencies.map((d) => `  "${d}",`).join('\n')}\n]\n`;

const REPO: Readonly<Record<string, string>> = {
  'services/api/pyproject.toml': pyproject('acme-api', ['requests>=2', 'Acme_Core[extra]==1.0']),
  'services/api/acme_api/__init__.py': '',
  'services/api/acme_api/main.py': [
    'import os',
    'import requests',
    'import numpy as np',
    'from acme_core.models import User',
    'from . import helpers',
    'from __future__ import annotations',
    '# import commented',
    '',
  ].join('\n'),
  'services/api/acme_api/helpers.py': 'from .. import missing\nfrom acme_api import main\n',
  'libs/core/pyproject.toml': pyproject('acme-core'),
  'libs/core/src/acme_core/__init__.py': '',
  'libs/core/src/acme_core/models.py': 'import sys\nfrom collections import abc\n',
};

describe('scan: Python imports', () => {
  it('links units through manifest names (PEP 503), and lists third-party packages as externals', async () => {
    const draft = await scan(makeRepo(REPO));

    expect(draft.dependencies).toEqual([
      {
        id: 'services/api->libs/core',
        from: 'services/api',
        to: 'libs/core',
        kind: 'import',
        weight: 1,
        examples: [{ file: 'services/api/acme_api/main.py', line: 4 }],
        source: { file: 'services/api/acme_api/main.py', line: 4 },
        confidence: 'extracted',
      },
    ]);
    expect(draft.externals.map(({ id, importedBy, confidence }) => [id, importedBy, confidence])).toEqual([
      ['pypi:numpy', ['services/api'], 'inferred'],
      ['pypi:requests', ['services/api'], 'extracted'],
    ]);
  });

  it('drops stdlib and __future__, and leaves python out of languagesWithoutImports', async () => {
    const draft = await scan(makeRepo(REPO));

    expect(draft.externals.map((e) => e.name)).not.toContain('os');
    expect(draft.limits.languagesWithoutImports).toEqual([]);
  });

  it('resolves relative and package-local imports to files, and others by manifest name', async () => {
    const draft = await scan(
      makeRepo({
        'svc/pyproject.toml': pyproject('svc'),
        'svc/app/__init__.py': 'from .util import f\nfrom app.util import g\nfrom .nothing import q\nimport shared.deep.mod\n',
        'svc/app/util.py': '',
        'shared/pyproject.toml': pyproject('Shared'),
        'shared/shared/__init__.py': '',
      }),
    );

    expect(draft.dependencies.map(({ id, weight }) => [id, weight])).toEqual([['svc->shared', 1]]);
    expect(draft.externals).toEqual([]);
    expect(draft.limits.unresolvedImports).toBe(0);
  });

  it('produces byte-identical output across runs', async () => {
    const root = makeRepo(REPO);
    expect(JSON.stringify(await scan(root))).toBe(JSON.stringify(await scan(root)));
  });
});
