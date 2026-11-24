/**
 * Lists the repo's files in a stable order: folders and files sorted by code unit, depth first. Honors every
 * `.gitignore` from the root down (each one against paths relative to its folder; no negation across files) and
 * always skips `EXCLUDED_FOLDERS`. Stops at `maxFiles` and says so.
 */
import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';

import ignore from 'ignore';
import type { Ignore } from 'ignore';

/** Dependencies, build output, virtualenvs, vendored code and tool state; never part of the project's own code. */
export const EXCLUDED_FOLDERS: ReadonlySet<string> = new Set([
  '.git',
  '.rinthel',
  '.diagrams',
  '.venv',
  'venv',
  '__pycache__',
  'node_modules',
  'dist',
  'build',
  'vendor',
  'third_party',
]);

export interface FileListing {
  /** Paths relative to the root, `/`-separated, in walk order. */
  files: string[];
  truncated: boolean;
}

interface Rules {
  base: string;
  rules: Ignore;
}

export const byCodeUnit = (a: string, b: string): number => (a < b ? -1 : a > b ? 1 : 0);

export function listFiles(root: string, maxFiles: number): FileListing {
  const files: string[] = [];
  let truncated = false;

  const visit = (folder: string, inherited: readonly Rules[]): void => {
    const rules = [...inherited];
    const own = readGitignore(join(root, folder));
    if (own !== undefined) rules.push({ base: folder, rules: own });
    const entries = readdirSync(join(root, folder), { withFileTypes: true }).sort((a, b) => byCodeUnit(a.name, b.name));
    for (const entry of entries) {
      if (truncated) return;
      const path = folder === '' ? entry.name : `${folder}/${entry.name}`;
      if (entry.isDirectory()) {
        if (EXCLUDED_FOLDERS.has(entry.name) || isIgnored(rules, `${path}/`)) continue;
        visit(path, rules);
      } else if (entry.isFile() && !isIgnored(rules, path)) {
        if (files.length >= maxFiles) {
          truncated = true;
          return;
        }
        files.push(path);
      }
    }
  };
  visit('', []);
  return { files, truncated };
}

function readGitignore(folder: string): Ignore | undefined {
  let text: string;
  try {
    text = readFileSync(join(folder, '.gitignore'), 'utf8');
  } catch {
    return undefined;
  }
  return ignore().add(text);
}

function isIgnored(rules: readonly Rules[], path: string): boolean {
  return rules.some(({ base, rules: own }) => {
    const relative = base === '' ? path : path.startsWith(`${base}/`) ? path.slice(base.length + 1) : undefined;
    return relative !== undefined && relative !== '' && own.ignores(relative);
  });
}
