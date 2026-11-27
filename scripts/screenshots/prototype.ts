/**
 * `preparePrototype(cacheRoot) -> { folder, page }`: extracts the prototype branch with `git archive` (no
 * worktrees), builds it and generates its HTML; it is cached per commit and never writes inside the repo.
 * Errors: it throws with the command that failed; offline it only fails if dependencies are missing from the pnpm cache.
 */
import { execFileSync } from 'node:child_process';
import { existsSync, mkdirSync } from 'node:fs';
import { join } from 'node:path';

export const PROTOTYPE_BRANCH = 'prototype/render-hibrido';

/** Prototype variant equivalent to each gallery Theme. */
export const THEME_VARIANT: Readonly<Record<string, string>> = {
  'soft-card': 'A',
  'glass-chip': 'D',
  neobrutalist: 'G',
  blueprint: 'H',
  'soft-light': 'I',
  'crt-terminal': 'J',
  synthwave: 'K',
  editorial: 'L',
  bauhaus: 'M',
  'sticky-notes': 'N',
  keycaps: 'O',
  'metro-map': 'P',
  pcb: 'Q',
  'pixel-art': 'R',
};

export interface PreparedPrototype {
  /** One per commit. */
  folder: string;
  /** Relative to `folder`. */
  page: string;
}

const PAGE = 'prototype-estetica/out/hibrido.html';

function exec(command: string, args: string[], cwd: string, input?: Buffer): void {
  try {
    execFileSync(command, args, { cwd, stdio: [input === undefined ? 'ignore' : 'pipe', 'ignore', 'pipe'], ...(input === undefined ? {} : { input }) });
  } catch (error) {
    const detail = (error as { stderr?: Buffer }).stderr?.toString().trim() ?? String(error);
    throw new Error(`\`${command} ${args.join(' ')}\` failed in ${cwd}:\n${detail}`, { cause: error });
  }
}

export function preparePrototype(cacheRoot: string, repo: string): PreparedPrototype {
  const commit = execFileSync('git', ['rev-parse', '--verify', PROTOTYPE_BRANCH], { cwd: repo }).toString().trim();
  const folder = join(cacheRoot, `prototype-${commit.slice(0, 12)}`);
  if (existsSync(join(folder, PAGE))) return { folder, page: PAGE };

  mkdirSync(folder, { recursive: true });
  const tar = execFileSync('git', ['archive', commit], { cwd: repo, maxBuffer: 1 << 30 });
  exec('tar', ['-x', '-C', folder], repo, tar);
  exec('pnpm', ['install', '--frozen-lockfile', '--ignore-scripts', '--prefer-offline'], folder);
  exec('pnpm', ['-r', 'build'], folder);
  // The prototype reads the Canonical form from `.diagrams/canonico.json`.
  exec('node', ['packages/cli/dist/bin.js', 'build', '--workspace', 'examples/rinthel-arch'], folder);
  exec('node', ['prototype-estetica/hibrido.ts'], folder);
  return { folder, page: PAGE };
}
