import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';

import { afterAll } from 'vitest';

const created: string[] = [];

afterAll(() => {
  for (const folder of created) rmSync(folder, { force: true, recursive: true });
});

/** Writes a fixture repo into a fresh temporary folder and returns its path. */
export function makeRepo(files: Readonly<Record<string, string>>): string {
  const root = mkdtempSync(join(tmpdir(), 'scanner-'));
  created.push(root);
  for (const [path, content] of Object.entries(files)) {
    const target = join(root, path);
    mkdirSync(dirname(target), { recursive: true });
    writeFileSync(target, content);
  }
  return root;
}

export const json = (value: unknown): string => `${JSON.stringify(value, null, 2)}\n`;

/** A workspace monorepo: two packages and an app, with internal, external and relative imports. */
export const MONOREPO: Readonly<Record<string, string>> = {
  'package.json': json({ name: 'acme', private: true, workspaces: ['packages/*', 'apps/*'] }),
  'packages/api/package.json': json({ name: '@acme/api', main: 'src/index.ts', dependencies: { stripe: '^1.0.0' } }),
  'packages/api/src/index.ts': "import Stripe from 'stripe';\nimport { db } from './db';\nexport { db };\nexport const s = new Stripe();\n",
  'packages/api/src/db.ts': "import { readFileSync } from 'node:fs';\nimport pg from 'pg';\nexport const db = pg(readFileSync);\n",
  'packages/ui/package.json': json({ name: '@acme/ui', exports: { '.': './src/index.tsx' }, dependencies: { react: '^19.0.0' } }),
  'packages/ui/src/index.tsx': "import * as React from 'react';\nexport const Button = () => <button />;\n",
  'apps/web/package.json': json({ name: 'web', private: true, dependencies: { react: '^19.0.0', '@acme/ui': 'workspace:*', '@acme/api': 'workspace:*' } }),
  'apps/web/src/main.tsx': [
    "import React from 'react';",
    "import { Button } from '@acme/ui';",
    "import { db } from '@acme/api';",
    "import type { Props } from './props.js';",
    'export const App = (p: Props) => <Button />;',
    "const lazy = () => import('@acme/ui');",
    '',
  ].join('\n'),
  'apps/web/src/props.ts': 'export interface Props { a: string }\n',
  'apps/web/src/legacy.js': "const api = require('@acme/api');\nmodule.exports = api;\n",
};
