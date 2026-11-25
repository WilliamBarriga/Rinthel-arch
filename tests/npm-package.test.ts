/**
 * Packed-package smoke test: builds the `rinthel-arch` npm package (`npm/`), packs it with `npm pack`, installs the
 * tarball in an empty folder and runs `validate`, `scan` (TS and Python), `export` and `dev` from the installed bin on
 * this Node (22+).
 * Needs `pnpm build` first (`pnpm test` does it) and esbuild in the npm cache or the registry.
 */
import { execFileSync, spawn } from 'node:child_process';
import type { ChildProcess } from 'node:child_process';
import { mkdirSync, mkdtempSync, readFileSync, readdirSync, rmSync, statSync, writeFileSync } from 'node:fs';
import { get } from 'node:http';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';

import { afterAll, beforeAll, describe, expect, it } from 'vitest';

const REPO = resolve(import.meta.dirname, '..');
const TMP = mkdtempSync(join(tmpdir(), 'rinthel-npm-'));
const APP = join(TMP, 'app');
const BIN = join(APP, 'node_modules', '.bin', 'diagrams');
const processes: ChildProcess[] = [];
let tarball = '';

function writeFiles(root: string, files: Record<string, string>): string {
  for (const [path, content] of Object.entries(files)) {
    mkdirSync(dirname(join(root, path)), { recursive: true });
    writeFileSync(join(root, path), content);
  }
  return root;
}

/** Runs the installed `diagrams` bin with this Node; returns its stdout (stderr too on failure) and exit code. */
function runBin(args: string[]): { stdout: string; exitCode: number } {
  try {
    return { stdout: execFileSync(process.execPath, [BIN, ...args], { encoding: 'utf8', env: { ...process.env, DIAGRAMS_ACTIVITY: '0' } }), exitCode: 0 };
  } catch (error) {
    const failure = error as { stdout: string; stderr: string; status: number };
    return { stdout: `${failure.stdout}${failure.stderr}`, exitCode: failure.status };
  }
}

function fetchText(url: string): Promise<{ status: number; body: string }> {
  return new Promise((done, fail) => {
    get(url, (res) => {
      let body = '';
      res.setEncoding('utf8');
      res.on('data', (t: string) => (body += t));
      res.on('end', () => done({ status: res.statusCode ?? 0, body }));
    }).on('error', fail);
  });
}

beforeAll(() => {
  execFileSync(process.execPath, [join(REPO, 'scripts', 'build-npm-package.ts')], { cwd: REPO, stdio: 'pipe' });
  const output = execFileSync('npm', ['pack', '--json', '--pack-destination', TMP], { cwd: join(REPO, 'npm'), encoding: 'utf8' });
  tarball = join(TMP, (JSON.parse(output) as { filename: string }[])[0]!.filename);
  mkdirSync(APP);
  execFileSync('npm', ['install', '--no-audit', '--no-fund', '--prefer-offline', tarball], { cwd: APP, stdio: 'pipe' });
}, 300_000);

afterAll(() => {
  for (const child of processes) child.kill();
  rmSync(TMP, { recursive: true, force: true });
});

describe('the rinthel-arch npm package', () => {
  it('runs on Node 22 or later', () => {
    expect(Number(process.versions.node.split('.')[0])).toBeGreaterThanOrEqual(22);
  });

  it('installs both bins, diagrams and rinthel-arch', () => {
    const bins = readdirSync(join(APP, 'node_modules', '.bin'));
    expect(bins).toEqual(expect.arrayContaining(['diagrams', 'rinthel-arch']));
  });

  it('carries the licenses and the third-party notice, with the elkjs source offer', () => {
    const installed = join(APP, 'node_modules', 'rinthel-arch');
    expect(readdirSync(installed)).toEqual(expect.arrayContaining(['LICENSE', 'LICENSE-LIKEC4', 'THIRD-PARTY-NOTICES.md', 'README.md']));
    const notices = readFileSync(join(installed, 'THIRD-PARTY-NOTICES.md'), 'utf8');
    expect(notices).toContain('## elkjs');
    expect(notices).toContain('Eclipse Public License - v 2.0');
    expect(notices).toContain('https://github.com/kieler/elkjs');
    expect(notices).toContain('## react');
  });

  it('ships the skills tree that the pi field points at (a Pi package)', () => {
    const installed = join(APP, 'node_modules', 'rinthel-arch');
    const manifest = JSON.parse(readFileSync(join(installed, 'package.json'), 'utf8')) as { keywords: string[]; pi: { skills: string[] } };
    expect(manifest.keywords).toContain('pi-package');
    for (const path of manifest.pi.skills) {
      const skills = readdirSync(join(installed, path));
      expect(skills).toEqual(expect.arrayContaining(['rinthel-diagramas', 'rinthel-temas']));
      for (const skill of skills) expect(statSync(join(installed, path, skill, 'SKILL.md')).isFile()).toBe(true);
    }
  });

  it('ships ELK once for the browser and once for Node, not three times', () => {
    const chunks = join(APP, 'node_modules', 'rinthel-arch', 'dist', 'estudio', 'trozos');
    expect(readdirSync(chunks).filter((t) => t.startsWith('elk'))).toEqual([]);
  });

  it('validate compiles a Workspace', () => {
    const ws = writeFiles(join(TMP, 'ws'), { 'main.dg': 'specification {\n  node service\n}\n\nmodel {\n  service api "API"\n  service db "DB"\n  api -> db "reads"\n}\n' });

    const { stdout, exitCode } = runBin(['validate', '--workspace', ws, '--json']);

    expect(exitCode, stdout).toBe(0);
    expect(JSON.parse(stdout)).toMatchObject({ ok: true });
  });

  it('scan reads TS imports with the packaged tree-sitter .wasm', () => {
    const repo = writeFiles(join(TMP, 'repo'), {
      'package.json': JSON.stringify({ name: 'mono', private: true, workspaces: ['packages/*'] }),
      'packages/a/package.json': JSON.stringify({ name: 'a', dependencies: { b: '*' } }),
      'packages/a/index.ts': "import { b } from 'b';\nexport const a = b;\n",
      'packages/b/package.json': JSON.stringify({ name: 'b' }),
      'packages/b/index.ts': 'export const b = 1;\n',
    });

    const { stdout, exitCode } = runBin(['scan', repo, '--json']);

    expect(exitCode, stdout).toBe(0);
    const summary = JSON.parse(stdout) as { counts: { dependencies: number }; limits: { languagesWithoutImports: unknown[] } };
    expect(summary.counts.dependencies).toBeGreaterThan(0);
    expect(summary.limits.languagesWithoutImports).toEqual([]);
  });

  it('scan reads Python imports and SQLAlchemy tables with the packaged Python grammar', () => {
    const repo = writeFiles(join(TMP, 'py'), {
      'pyproject.toml': '[project]\nname = "svc"\ndependencies = ["sqlalchemy"]\n',
      'svc/__init__.py': '',
      'svc/models.py': [
        'from sqlalchemy import Column, ForeignKey, Integer',
        'from sqlalchemy.orm import DeclarativeBase',
        '',
        'class Base(DeclarativeBase):',
        '    pass',
        '',
        'class User(Base):',
        '    __tablename__ = "users"',
        '    id = Column(Integer, primary_key=True)',
        '',
        'class Order(Base):',
        '    __tablename__ = "orders"',
        '    id = Column(Integer, primary_key=True)',
        '    user_id = Column(Integer, ForeignKey("users.id"), nullable=False)',
        '',
      ].join('\n'),
      'worker/pyproject.toml': '[project]\nname = "worker"\ndependencies = ["svc"]\n',
      'worker/main.py': 'import os\nfrom svc.models import User\n',
    });

    const { stdout, exitCode } = runBin(['scan', repo, '--json']);

    expect(exitCode, stdout).toBe(0);
    const summary = JSON.parse(stdout) as {
      counts: { dependencies: number };
      limits: { languagesWithoutImports: unknown[] };
      externals: { id: string }[];
      tables: { id: string; relations: number }[];
    };
    expect(summary.limits.languagesWithoutImports).toEqual([]);
    expect(summary.externals.map(({ id }) => id)).toEqual(['pypi:sqlalchemy']);
    expect(summary.counts.dependencies).toBe(1);
    expect(summary.tables).toMatchObject([
      { id: 'orders', relations: 1 },
      { id: 'users', relations: 0 },
    ]);
  });

  it('export writes one self-contained HTML file', () => {
    const out = join(TMP, 'export', 'diagrams.html');

    const { stdout, exitCode } = runBin(['export', '--workspace', join(TMP, 'ws'), '--out', out]);

    expect(exitCode, stdout).toBe(0);
    const html = readFileSync(out, 'utf8');
    expect(html.startsWith('<!doctype html>') || html.startsWith('<!DOCTYPE html>')).toBe(true);
    expect(html).not.toMatch(/<script[^>]+src="https?:/);
    expect(html.length).toBeGreaterThan(100_000);
  });

  it('dev serves the Dev UI page and its assets', async () => {
    const ws = join(TMP, 'ws');
    const dev = spawn(process.execPath, [BIN, 'dev', '--workspace', ws, '--port', '0'], { env: { ...process.env, DIAGRAMS_ACTIVITY: '0' } });
    processes.push(dev);
    const url = await new Promise<string>((done, fail) => {
      let output = '';
      dev.stdout.on('data', (t: Buffer) => {
        output += t.toString();
        const found = /http:\/\/127\.0\.0\.1:\d+\//.exec(output)?.[0];
        if (found !== undefined) done(found);
      });
      dev.on('exit', (code) => fail(new Error(`dev exited with ${code}: ${output}`)));
    });

    const page = await fetchText(url);
    expect(page.status).toBe(200);
    const script = /<script type="module" src="\/([^"]+)"/.exec(page.body)?.[1];
    expect(script).toBeDefined();
    const js = await fetchText(`${url}${script}`);
    expect(js.status).toBe(200);
    expect(js.body.length).toBeGreaterThan(1000);
  }, 60_000);

  it('records the tarball size', () => {
    const bytes = statSync(tarball).size;
    console.info(`rinthel-arch tarball: ${(bytes / 1024 / 1024).toFixed(2)} MB (${bytes} bytes)`);
    expect(bytes).toBeLessThan(5 * 1024 * 1024);
  });
});
