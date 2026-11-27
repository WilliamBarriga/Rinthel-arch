import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

const pkg = join(import.meta.dirname, '..');

describe('LikeC4 attribution (ADR 0001)', () => {
  it('keeps the MIT license and the LikeC4 copyright in the package', () => {
    const license = readFileSync(join(pkg, 'LICENSE-LIKEC4'), 'utf8');

    expect(license).toContain('MIT License');
    expect(license).toContain('Copyright (c) 2023-2026 Denis Davydkov');
  });

  it('the copied grammar keeps the original copyright notice', () => {
    const grammar = readFileSync(join(pkg, 'src/grammar/diagrams.langium'), 'utf8');

    expect(grammar).toContain('SPDX-License-Identifier: MIT');
    expect(grammar).toContain('Copyright (c) 2023-2026 Denis Davydkov');
  });
});
