/**
 * Publishes the live demo (`pnpm demo:publish`): builds the repo, exports `examples/rinthel-arch` with
 * `diagrams export` and commits it as `index.html` plus an empty `.nojekyll` to the orphan branch `gh-pages`, then
 * pushes that branch. GitHub Pages serves it with "Deploy from a branch" (`gh-pages`, `/ (root)`); the repo has no
 * workflow file. The commit is written with git plumbing (a temporary index), so the checked-out branch, the working
 * tree and the index are never touched.
 *
 * Usage: `node scripts/publish-demo.ts [--dry-run] [--skip-build] [--workspace <dir>] [--repo <git repo>] [--remote <name>]`
 * - `--dry-run`: build and commit the `gh-pages` branch locally, do not push.
 * - `--skip-build`: reuse the current `pnpm build` output.
 * A run whose export is identical to the tip of `gh-pages` adds no commit.
 */
import { execFileSync } from 'node:child_process';
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, relative, resolve } from 'node:path';
import { parseArgs } from 'node:util';
import { gzipSync } from 'node:zlib';

const ROOT = resolve(import.meta.dirname, '..');
const BIN = join(ROOT, 'packages/cli/dist/bin.js');
const BRANCH = 'gh-pages';
const MB = 1024 * 1024;

const { values } = parseArgs({
  args: process.argv.slice(2),
  options: {
    'dry-run': { type: 'boolean', default: false },
    'skip-build': { type: 'boolean', default: false },
    workspace: { type: 'string', default: join(ROOT, 'examples/rinthel-arch') },
    repo: { type: 'string', default: ROOT },
    remote: { type: 'string', default: 'origin' },
  },
});
const repo = resolve(values.repo);
const workspace = resolve(values.workspace);

function git(args: string[], input?: string, env?: NodeJS.ProcessEnv): string {
  return execFileSync('git', ['-C', repo, ...args], { encoding: 'utf8', input, env: { ...process.env, ...env } }).trim();
}

function revision(ref: string): string | undefined {
  try {
    return git(['rev-parse', '--verify', '--quiet', `${ref}^{commit}`]);
  } catch {
    return undefined;
  }
}

if (!values['skip-build']) execFileSync('pnpm', ['build'], { cwd: ROOT, stdio: 'inherit' });

const out = mkdtempSync(join(tmpdir(), 'rinthel-demo-'));
try {
  const html = join(out, 'index.html');
  execFileSync(process.execPath, [BIN, 'export', '--workspace', workspace, '--out', html], { stdio: 'inherit', env: { ...process.env, DIAGRAMS_ACTIVITY: '0' } });
  const bytes = readFileSync(html);
  console.log(`index.html: ${(bytes.length / MB).toFixed(2)} MB raw, ${(gzipSync(bytes, { level: 9 }).length / MB).toFixed(2)} MB gzip`);

  // The tree of the branch: index.html and an empty .nojekyll (GitHub then deploys the files as they are, no Jekyll).
  const htmlBlob = git(['hash-object', '-w', html]);
  writeFileSync(join(out, '.nojekyll'), '');
  const nojekyllBlob = git(['hash-object', '-w', join(out, '.nojekyll')]);
  const tree = git(['mktree'], `100644 blob ${nojekyllBlob}\t.nojekyll\n100644 blob ${htmlBlob}\tindex.html\n`);

  if (!values['dry-run']) {
    try {
      git(['fetch', '--quiet', values.remote, `+refs/heads/${BRANCH}:refs/remotes/${values.remote}/${BRANCH}`]);
    } catch {
      // No remote gh-pages yet: the first publish starts the orphan branch.
    }
  }
  const parent = revision(`refs/heads/${BRANCH}`) ?? revision(`refs/remotes/${values.remote}/${BRANCH}`);
  if (parent !== undefined && git(['rev-parse', `${parent}^{tree}`]) === tree) {
    console.log(`${BRANCH} already has this export (${parent.slice(0, 12)}); no new commit.`);
  } else {
    const source = revision('HEAD');
    const where = relative(ROOT, workspace) || '.';
    const message = `Live demo: ${where}${source === undefined ? '' : ` at ${source.slice(0, 12)}`}`;
    const commit = git(['commit-tree', tree, ...(parent === undefined ? [] : ['-p', parent]), '-m', message]);
    git(['update-ref', `refs/heads/${BRANCH}`, commit, ...(parent !== undefined && revision(`refs/heads/${BRANCH}`) !== undefined ? [parent] : [])]);
    console.log(`${BRANCH} -> ${commit.slice(0, 12)} (${parent === undefined ? 'orphan, first commit' : `on ${parent.slice(0, 12)}`}): ${message}`);
  }

  if (values['dry-run']) {
    console.log(`Dry run: nothing pushed. To publish: git push ${values.remote} ${BRANCH}`);
  } else {
    execFileSync('git', ['-C', repo, 'push', values.remote, `refs/heads/${BRANCH}:refs/heads/${BRANCH}`], { stdio: 'inherit' });
    console.log(`Pushed ${BRANCH}. GitHub Pages deploys it from the branch (Settings > Pages: Deploy from a branch, ${BRANCH}, / (root)).`);
  }
} finally {
  rmSync(out, { recursive: true, force: true });
}
