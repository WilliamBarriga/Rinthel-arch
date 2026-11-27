import { existsSync, readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

const REPO = resolve(import.meta.dirname, '..');
const README = ['README.md', 'README.es.md'];

/** Local paths of the Markdown images `![...](path)`, in order. */
function images(text: string): string[] {
  return [...text.matchAll(/!\[[^\]]*\]\(([^)\s]+)\)/g)].map((m) => m[1]!).filter((path) => !/^https?:/.test(path));
}

describe.each(README)('%s', (file) => {
  const text = readFileSync(resolve(REPO, file), 'utf8');

  it('every local image it cites exists', () => {
    const missing = images(text).filter((path) => !existsSync(resolve(REPO, dirname(file), path)));
    expect(missing).toEqual([]);
  });

  it('opens with the GIF of the agent in the Dev UI', () => {
    expect(images(text)[0]).toBe('docs/img/dev-ui/agent-imports.gif');
  });

  it('the Themes section shows the mosaic linked to the gallery', () => {
    expect(text).toMatch(/\[!\[[^\]]*\]\(docs\/img\/theme-mosaic\.png\)\]\(docs\/gallery\.md\)/);
  });
});
