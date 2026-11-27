import { readFileSync } from 'node:fs';

import { describe, expect, it } from 'vitest';

import { catalogReference } from 'theme';

describe('docs/theme-catalog.md', () => {
  it('matches the catalog; if it fails, run `pnpm docs:catalog`', () => {
    const written = readFileSync(new URL('../docs/theme-catalog.md', import.meta.url), 'utf8');

    expect(written).toBe(catalogReference());
  });
});
