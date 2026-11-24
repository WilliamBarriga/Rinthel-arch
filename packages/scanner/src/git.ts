/**
 * `HEAD` commit of the git repo enclosing `root`, read from `.git` files without running `git`: a scanned repo's git
 * config (hooks, fsmonitor) never runs. Handles worktrees (`.git` file and `commondir`) and `packed-refs`.
 */
import { readFileSync, statSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';

export function readCommit(root: string): string | null {
  const gitDir = findGitDir(resolve(root));
  if (gitDir === undefined) return null;
  const head = read(join(gitDir, 'HEAD'))?.trim();
  if (head === undefined) return null;
  if (!head.startsWith('ref:')) return isSha(head) ? head : null;
  const ref = head.slice('ref:'.length).trim();
  const common = read(join(gitDir, 'commondir'))?.trim();
  const dirs = [gitDir, ...(common === undefined ? [] : [resolve(gitDir, common)])];
  for (const dir of dirs) {
    const loose = read(join(dir, ref))?.trim();
    if (loose !== undefined && isSha(loose)) return loose;
  }
  for (const dir of dirs) {
    for (const line of (read(join(dir, 'packed-refs')) ?? '').split('\n')) {
      const [sha, name] = line.trim().split(' ');
      if (name === ref && sha !== undefined && isSha(sha)) return sha;
    }
  }
  return null;
}

function findGitDir(start: string): string | undefined {
  for (let folder = start; ; folder = dirname(folder)) {
    const dotGit = join(folder, '.git');
    try {
      if (statSync(dotGit).isDirectory()) return dotGit;
      const pointer = /^gitdir:\s*(.+)$/m.exec(readFileSync(dotGit, 'utf8'))?.[1]?.trim();
      if (pointer !== undefined) return resolve(folder, pointer);
    } catch {
      // No `.git` here: keep climbing.
    }
    if (dirname(folder) === folder) return undefined;
  }
}

function read(path: string): string | undefined {
  try {
    return readFileSync(path, 'utf8');
  } catch {
    return undefined;
  }
}

const isSha = (text: string): boolean => /^[0-9a-f]{40}(?:[0-9a-f]{24})?$/.test(text);
