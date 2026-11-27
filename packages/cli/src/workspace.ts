import { createHash } from 'node:crypto';
import { mkdirSync, readdirSync, readFileSync, realpathSync, renameSync, rmSync, statSync, writeFileSync } from 'node:fs';
import { dirname, isAbsolute, join, relative, resolve, sep } from 'node:path';

import { isFontFile, fontMimeType } from 'canonical';
import type { WorkspaceFiles } from 'dsl';

/** Name of the output folder derived from the Workspace (build and Activity log). */
export const OUTPUT_FOLDER = '.diagrams';

/** `<root>/.diagrams` */
export const outputFolder = (root: string): string => join(root, OUTPUT_FOLDER);

const EXTENSION = '.dg';
const IGNORED_FOLDERS = new Set(['node_modules', 'dist']);

/**
 * Relative path with `/` -> what `read` gets from each file it `accepts`. Skips hidden folders
 * (`.diagrams/`), `node_modules`, `dist` and those it `skips`; goes no deeper than `depth` folders under `root`.
 */
function walk(
  root: string,
  accepts: (name: string) => boolean,
  read: (path: string) => string,
  { depth: depth = Infinity, skips: skips = () => false }: { depth?: number; skips?: (name: string) => boolean } = {},
): Record<string, string> {
  const files: Record<string, string> = {};
  const visit = (folder: string, level: number): void => {
    for (const input of readdirSync(folder, { withFileTypes: true })) {
      if (input.name.startsWith('.') || IGNORED_FOLDERS.has(input.name)) continue;
      const path = join(folder, input.name);
      if (input.isDirectory()) {
        if (level < depth && !skips(input.name)) visit(path, level + 1);
      } else if (accepts(input.name)) files[relative(root, path).split(sep).join('/')] = read(path);
    }
  };
  visit(root, 0);
  return files;
}

/** `.dg` and `.svg` (icon) files under `root`. Throws if the root does not exist or is not a folder. */
export function readWorkspace(root: string): WorkspaceFiles {
  if (!statSync(root).isDirectory()) throw new Error(`'${root}' is not a folder`);
  return walk(root, (name) => name.endsWith(EXTENSION) || name.endsWith('.svg'), (path) => readFileSync(path, 'utf8'));
}

/** Relative paths with `/` of every file under `root` (to check the naming conventions). */
export function readPaths(root: string): string[] {
  return Object.keys(walk(root, () => true, () => ''));
}

/**
 * Relative `/` paths of the `.dg` files under `root`, at most `depth` folders down, skipping the folders that
 * `walk` skips and those `skips` names (how `scan` looks for a Workspace).
 */
export function dgPaths(root: string, depth: number, skips: (name: string) => boolean): string[] {
  return Object.keys(walk(root, (name) => name.endsWith(EXTENSION), () => '', { depth, skips }));
}

const RESOURCE_EXTENSIONS = ['.tsx', '.ttf', '.otf', '.woff', '.woff2'];

/**
 * Theme component `.tsx` files and font files under `root`: relative path with `/` -> SHA-256 of the contents.
 * Throws if the root does not exist or is not a folder.
 */
export function readResources(root: string): Record<string, string> {
  if (!statSync(root).isDirectory()) throw new Error(`'${root}' is not a folder`);
  return walk(root, (name) => RESOURCE_EXTENSIONS.some((extension) => name.endsWith(extension)), (path) => createHash('sha256').update(readFileSync(path)).digest('hex'));
}

/** Paths relative to `root`, with `/`. */
export function readFonts(root: string): string[] {
  return Object.keys(readResources(root)).filter(isFontFile);
}

/**
 * Bytes and MIME type of `path` in the first of the `roots` that has it. Only font extensions, only regular files
 * and only if, once symlinks are resolved, they stay inside their root; anything else gives `undefined`.
 */
export function readFontFile(roots: readonly string[], path: string): { bytes: Buffer; type: string } | undefined {
  const type = fontMimeType(path);
  if (type === undefined) return undefined;
  for (const root of roots) {
    try {
      const actual = realpathSync(workspaceTarget(root, path));
      if (!actual.startsWith(realpathSync(root) + sep) || !statSync(actual).isFile()) continue;
      return { bytes: readFileSync(actual), type };
    } catch {
      // outside the root, missing or unreadable: try the next root
    }
  }
  return undefined;
}

/** What `build` replaces in `.diagrams/`; the rest (the Activity log) is kept. */
const BUILD_OUTPUT = ['canonico.json', 'geometria'];
/**
 * Replaces `<root>/.diagrams/<subfolder>` (by default `canonico.json` and `geometria/`) with `files` (path
 * relative to `.diagrams/` with `/`): no leftovers of a View that no longer exists.
 */
export function writeOutput(
  root: string,
  files: Readonly<Record<string, string | Uint8Array>>,
  subfolder = '',
): void {
  const target = outputFolder(root);
  for (const path of subfolder === '' ? BUILD_OUTPUT : [subfolder]) rmSync(join(target, path), { recursive: true, force: true });
  for (const [path, text] of Object.entries(files)) {
    const file = join(target, ...path.split('/'));
    mkdirSync(dirname(file), { recursive: true });
    writeFileSync(file, text);
  }
}

/** Creates missing folders. Atomic (temp file and rename): nobody sees the file half written. */
export function writeTextFile(path: string, text: string): void {
  mkdirSync(dirname(path), { recursive: true });
  const tempDir = `${path}.${process.pid}.${Date.now()}.tmp`;
  try {
    writeFileSync(tempDir, text);
    renameSync(tempDir, path);
  } catch (error) {
    rmSync(tempDir, { force: true });
    throw error;
  }
}

/** `path` is relative to `root`, with `/`; throws if the target ends up outside the root. */
export function workspaceTarget(root: string, path: string): string {
  const base = resolve(root);
  const target = resolve(base, ...path.split('/'));
  if (path.startsWith('/') || isAbsolute(path) || !target.startsWith(base + sep)) {
    throw new Error(`'${path}' is outside the Workspace`);
  }
  return target;
}
