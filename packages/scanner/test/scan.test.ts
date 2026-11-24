import { describe, expect, it } from 'vitest';

import { SCAN_DRAFT_SCHEMA, scan } from 'scanner';

import { MONOREPO, makeRepo } from './repos';

describe('scan: workspace monorepo', () => {
  it('gives one unit per manifest, with parent from the path and a mechanical kind', async () => {
    const draft = await scan(makeRepo(MONOREPO));

    expect(draft.schema).toBe(SCAN_DRAFT_SCHEMA);
    expect(draft.root).toBe('.');
    expect(draft.units).toEqual([
      { id: '.', name: 'acme', kind: 'module', parent: null, languages: [], files: 1, source: { file: 'package.json', line: 1 }, confidence: 'extracted' },
      { id: 'apps/web', name: 'web', kind: 'app', parent: '.', languages: ['javascript', 'typescript'], files: 4, source: { file: 'apps/web/package.json', line: 1 }, confidence: 'extracted' },
      { id: 'packages/api', name: '@acme/api', kind: 'package', parent: '.', languages: ['typescript'], files: 3, source: { file: 'packages/api/package.json', line: 1 }, confidence: 'extracted' },
      { id: 'packages/ui', name: '@acme/ui', kind: 'package', parent: '.', languages: ['typescript'], files: 2, source: { file: 'packages/ui/package.json', line: 1 }, confidence: 'extracted' },
    ]);
  });

  it('aggregates TS/JS imports between units with weight and examples, and skips imports inside a unit', async () => {
    const draft = await scan(makeRepo(MONOREPO));

    expect(draft.dependencies).toEqual([
      {
        id: 'apps/web->packages/api',
        from: 'apps/web',
        to: 'packages/api',
        kind: 'import',
        weight: 2,
        examples: [
          { file: 'apps/web/src/legacy.js', line: 1 },
          { file: 'apps/web/src/main.tsx', line: 3 },
        ],
        source: { file: 'apps/web/src/legacy.js', line: 1 },
        confidence: 'extracted',
      },
      {
        id: 'apps/web->packages/ui',
        from: 'apps/web',
        to: 'packages/ui',
        kind: 'import',
        weight: 2,
        examples: [
          { file: 'apps/web/src/main.tsx', line: 2 },
          { file: 'apps/web/src/main.tsx', line: 6 },
        ],
        source: { file: 'apps/web/src/main.tsx', line: 2 },
        confidence: 'extracted',
      },
    ]);
  });

  it('lists externals with their importers; undeclared ones are inferred and Node builtins are left out', async () => {
    const draft = await scan(makeRepo(MONOREPO));

    expect(draft.externals).toEqual([
      {
        id: 'npm:pg',
        name: 'pg',
        ecosystem: 'npm',
        importedBy: ['packages/api'],
        weight: 1,
        examples: [{ file: 'packages/api/src/db.ts', line: 2 }],
        source: { file: 'packages/api/src/db.ts', line: 2 },
        confidence: 'inferred',
      },
      {
        id: 'npm:react',
        name: 'react',
        ecosystem: 'npm',
        importedBy: ['apps/web', 'packages/ui'],
        weight: 2,
        examples: [
          { file: 'apps/web/src/main.tsx', line: 1 },
          { file: 'packages/ui/src/index.tsx', line: 1 },
        ],
        source: { file: 'apps/web/src/main.tsx', line: 1 },
        confidence: 'extracted',
      },
      {
        id: 'npm:stripe',
        name: 'stripe',
        ecosystem: 'npm',
        importedBy: ['packages/api'],
        weight: 1,
        examples: [{ file: 'packages/api/src/index.ts', line: 1 }],
        source: { file: 'packages/api/src/index.ts', line: 1 },
        confidence: 'extracted',
      },
    ]);
    expect(draft.tables).toEqual([]);
  });
});
