/**
 * `scripts/publish-demo.ts --dry-run`: builds the orphan `gh-pages` branch of a repo locally (exported `index.html`
 * plus `.nojekyll`) without touching the checked-out branch or pushing. Needs `pnpm build` first (`pnpm test` does it).
 */
import { execFileSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';

import { afterAll, describe, expect, it } from 'vitest';

const SCRIPT = resolve(import.meta.dirname, '../scripts/publish-demo.ts');
const TMP = mkdtempSync(join(tmpdir(), 'publish-demo-'));
const REPO = join(TMP, 'repo');
const WORKSPACE = join(TMP, 'workspace');

const git = (...args: string[]): string => execFileSync('git', ['-C', REPO, ...args], { encoding: 'utf8', maxBuffer: 64 * 1024 * 1024 }).trim();
const publish = (...args: string[]): string =>
  execFileSync(process.execPath, [SCRIPT, '--repo', REPO, '--workspace', WORKSPACE, '--skip-build', ...args], { encoding: 'utf8', env: { ...process.env, DIAGRAMS_ACTIVIDAD: '0' } });

execFileSync('git', ['init', '-q', '-b', 'main', REPO]);
git('config', 'user.email', 'test@example.com');
git('config', 'user.name', 'Test');
writeFileSync(join(REPO, 'README.md'), 'hello\n');
git('add', 'README.md');
git('commit', '-q', '-m', 'first');
mkdirSync(WORKSPACE);
writeFileSync(join(WORKSPACE, 'main.dg'), 'specification { node s }\nmodel { s a  s b  a -> b }\nview overview { type architecture include ** }\n');

afterAll(() => rmSync(TMP, { recursive: true, force: true }));

describe('publish-demo --dry-run', () => {
  it('commits index.html and .nojekyll to an orphan gh-pages branch, leaving the current branch alone and pushing nothing', () => {
    const head = git('rev-parse', 'HEAD');

    const out = publish('--dry-run');

    expect(git('ls-tree', '--name-only', 'gh-pages').split('\n').sort()).toEqual(['.nojekyll', 'index.html']);
    expect(git('show', 'gh-pages:index.html')).toContain('<!doctype html>');
    expect(git('rev-list', '--count', 'gh-pages')).toBe('1');
    expect(git('rev-parse', 'HEAD')).toBe(head);
    expect(git('branch', '--show-current')).toBe('main');
    expect(git('status', '--porcelain')).toBe('');
    expect(out).toContain('git push origin gh-pages');
  }, 60_000);

  it('a second run with the same export adds no commit', () => {
    const before = git('rev-parse', 'gh-pages');

    publish('--dry-run');

    expect(git('rev-parse', 'gh-pages')).toBe(before);
  }, 60_000);
});
