import { spawn } from 'node:child_process';
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { createServer } from 'node:net';
import type { ChildProcess } from 'node:child_process';
import { join } from 'node:path';

export interface GalleryDev {
  /** `http://127.0.0.1:<port>/` */
  url: string;
  stop: () => void;
}

/** Free port; needs `pnpm build`. */
export async function startGalleryDev(repo: string, workspace: string, themeFolder?: string): Promise<GalleryDev> {
  const bin = join(repo, 'packages/cli/dist/bin.js');
  if (!existsSync(bin)) throw new Error('The CLI build is missing: run `pnpm build` before `pnpm screenshots`.');
  const child = spawn('node', [bin, 'dev', '--workspace', workspace, ...(themeFolder === undefined ? [] : ['--theme-path', themeFolder]), '--port', '0'], { cwd: repo, stdio: ['ignore', 'pipe', 'pipe'] });
  const url = await new Promise<string>((resolvePromise, reject) => {
    let output = '';
    const onData = (chunk: Buffer): void => {
      output += chunk.toString();
      const match = /listening on (http:\/\/\S+)/.exec(output);
      if (match !== null) resolvePromise(match[1]!);
    };
    child.stdout.on('data', onData);
    child.stderr.on('data', onData);
    child.on('exit', () => reject(new Error(`\`dev\` exited without starting:\n${output.trim()}`)));
  });
  return { url, stop: () => void child.kill() };
}

async function freePort(): Promise<number> {
  return new Promise((resolvePromise, reject) => {
    const server = createServer();
    server.once('error', reject);
    server.listen(0, '127.0.0.1', () => {
      const { port } = server.address() as { port: number };
      server.close(() => resolvePromise(port));
    });
  });
}

/**
 * Server detached from the script (it stays alive when the script ends); returns its origin. It first stops the
 * previous server of the same `root` (its pid is kept in `server.json`).
 */
export async function serveStatic(root: string): Promise<string> {
  const record = join(root, 'server.json');
  if (existsSync(record)) {
    try {
      process.kill((JSON.parse(readFileSync(record, 'utf8')) as { pid: number }).pid);
    } catch {
      // It was no longer alive.
    }
  }
  const port = await freePort();
  const child: ChildProcess = spawn('python3', ['-m', 'http.server', String(port), '--bind', '127.0.0.1', '-d', root], { detached: true, stdio: 'ignore' });
  child.unref();
  writeFileSync(record, JSON.stringify({ pid: child.pid, port }));
  await waitFor(port);
  return `http://localhost:${port}`;
}

async function waitFor(port: number): Promise<void> {
  for (let attempt = 0; attempt < 50; attempt++) {
    try {
      await fetch(`http://127.0.0.1:${port}/`);
      return;
    } catch {
      await new Promise((r) => setTimeout(r, 100));
    }
  }
  throw new Error(`The static server did not answer on port ${port}`);
}
