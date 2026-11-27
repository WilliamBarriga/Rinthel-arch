/**
 * `checkWorkspace(root) -> Violation[]`: scans `packages/*` (source, tests, configs and `package.json`) and returns
 * the violations sorted by package, file, rule and message; empty is green. Read-only; it ignores comments.
 * Rules:
 * - `chain`: the package is in `CHAIN`. `order`: it only imports from earlier packages in `CHAIN`.
 * - `internal`: from another package only its name or what `exports` declares is imported; a relative import does not
 *   leave the package, except from tests to the shared helpers in `TEST_HELPERS`.
 * - `declaration`: every imported workspace package is in `dependencies` or `peerDependencies`.
 * - `exports`: the public surface is the `.` entry plus, only in the packages of `ALLOWED_SUBPATHS`, those subpaths.
 * - `purity`: the source code of `CORE` imports no Node modules and uses no clock, randomness, `process`, network or DOM.
 * - `reexport`: no file does `export ... from` another workspace package, except those in `ALLOWED_REEXPORTS`.
 * - `isolated`: a package in `ISOLATED` stays outside `CHAIN`, imports no workspace package and is only imported by
 *   the packages `ISOLATED` assigns to it.
 * It also checks the folders of `ROOT_FOLDERS` (package `(root)`) with the `internal` rule: from a package they only
 * use its name or what `exports` declares, never one of its files by relative path.
 * Errors: an unreadable or invalid `package.json` throws; a missing one is ignored.
 */
import { builtinModules } from 'node:module';
import { existsSync, readFileSync, readdirSync } from 'node:fs';
import { dirname, join, relative, resolve } from 'node:path';

/** Dependency order (ADR 0004): a package only imports from the earlier ones. */
export const CHAIN = ['canonical', 'theme', 'dsl', 'layout', 'session', 'render', 'shell', 'dev-ui', 'cli'] as const;

/**
 * Public subpaths besides `.` (ADR 0004, `dev-ui` amendment): `protocol` is the `dev` contract `cli` imports types
 * from without loading the browser app; `contract` is the shared test suite; `build` assembles the app bundle (the
 * bench uses it). No other package has them.
 */
export const ALLOWED_SUBPATHS: Readonly<Record<string, readonly string[]>> = {
  'dev-ui': ['./protocol', './contract', './build'],
};

/**
 * Files that may re-export from another package (path relative to the repo root): `dev-ui/protocol` gathers the
 * `dev` contract for the app and `cli`; the public facade of `shell` offers its consumers the types of its interface.
 * Outside them, each name is imported from the owning package, with no second paths.
 */
export const ALLOWED_REEXPORTS: readonly string[] = ['packages/dev-ui/src/protocol.ts', 'packages/shell/src/index.ts'];

/**
 * Packages outside `CHAIN` (ADR 0010): they import no workspace package and only the listed packages import them.
 * `scanner` reads a codebase without knowing the core; only `cli` uses it.
 */
export const ISOLATED: Readonly<Record<string, readonly string[]>> = {
  scanner: ['cli'],
};

/** Root folder (relative to the repo) of the test helpers shared between packages; only tests import it. */
export const TEST_HELPERS = 'tests/helpers';

/** Root folders (relative to the repo) that consume packages like any other client: only through their declared interface. */
export const ROOT_FOLDERS = ['scripts', 'bench'] as const;

/** Name under which the violations of `ROOT_FOLDERS` are reported. */
const ROOT = '(root)';

/** Pure core: no I/O, no clock, no global state. */
export const CORE = ['canonical', 'theme', 'dsl', 'session', 'render'] as const;

const IMPURITIES: ReadonlyArray<readonly [RegExp, string]> = [
  [/\bnew Date\b|\bDate\.now\b|\bperformance\.now\b/, 'the clock'],
  [/\bMath\.random\b|\bcrypto\.(?:randomUUID|getRandomValues)\b/, 'randomness'],
  [/\bprocess\.|\bglobalThis\b/, 'process global state'],
  [/\bfetch\(|\bXMLHttpRequest\b|\bnew Worker\b/, 'network or workers'],
  [/\b(?:window|document|localStorage|sessionStorage)\./, 'the DOM'],
];

const NODE_MODULES = new Set(builtinModules);

export type Rule = 'chain' | 'order' | 'internal' | 'declaration' | 'exports' | 'purity' | 'reexport' | 'isolated';

export interface Violation {
  readonly package: string;
  readonly file: string;
  readonly rule: Rule;
  readonly message: string;
}

interface Manifest {
  readonly name?: string;
  readonly exports?: unknown;
  readonly dependencies?: Record<string, string>;
  readonly peerDependencies?: Record<string, string>;
}

interface Package {
  readonly name: string;
  readonly folder: string;
  readonly manifest: Manifest;
}

const IGNORED_FOLDERS = new Set(['node_modules', 'dist', 'coverage', '.git']);
const IGNORED_FILES = /^tsup\.config\.|^vitest\.config\./;
const CODE_EXTENSIONS = ['.ts', '.tsx', '.mts', '.cts'];
const RE_REEXPORT = /\bexport\s+(?:type\s+)?(?:\*(?:\s+as\s+[\w$]+)?|\{[^}]*\})\s*from\s*(['"])([^'"\n]+)\1/g;
const RE_SPECIFIER = /(?:\bfrom\s*|\bimport\s*\(?\s*|\brequire\s*\(\s*)(['"])([^'"\n]+)\1/g;

export function checkWorkspace(root: string): Violation[] {
  const packages = loadPackages(root);
  const violations: Violation[] = [];
  for (const pkg of packages) {
    violations.push(...checkManifest(pkg));
    for (const file of filesOf(pkg.folder)) {
      violations.push(...checkFile(root, pkg, file, packages));
    }
  }
  for (const folder of ROOT_FOLDERS) {
    if (!existsSync(join(root, folder))) continue;
    for (const file of filesOf(join(root, folder))) {
      violations.push(...checkRootFile(root, file, packages));
    }
  }
  return violations;
}

/** A file of `ROOT_FOLDERS`: no relative import enters a package and no subpath goes beyond its `exports`. */
function checkRootFile(root: string, file: string, packages: Package[]): Violation[] {
  const rel = relative(root, file).split('\\').join('/');
  const violations: Violation[] = [];
  for (const specifier of extractSpecifiers(withoutComments(readFileSync(file, 'utf8')))) {
    if (specifier.startsWith('.')) {
      const owner = packages.find((other) => isInside(resolve(dirname(file), specifier), other.folder));
      if (owner !== undefined) {
        violations.push({
          package: ROOT,
          file: rel,
          rule: 'internal',
          message: `relative import "${specifier}" enters ${owner.name}; import it by its name or by what its exports declares`,
        });
      }
      continue;
    }
    const imported = packageName(specifier);
    const target = packages.find((other) => other.name === imported);
    const subpath = specifier.slice(imported.length);
    if (target !== undefined && subpath !== '' && !exportKeys(target.manifest).includes(`.${subpath}`)) {
      violations.push({
        package: ROOT,
        file: rel,
        rule: 'internal',
        message: `imports "${specifier}"; from ${imported} only its name and what its exports declares are imported`,
      });
    }
  }
  return violations;
}

function loadPackages(root: string): Package[] {
  let entries: string[];
  try {
    entries = readdirSync(join(root, 'packages'));
  } catch {
    return [];
  }
  const packages: Package[] = [];
  for (const entry of entries.sort()) {
    const folder = join(root, 'packages', entry);
    let text: string;
    try {
      text = readFileSync(join(folder, 'package.json'), 'utf8');
    } catch {
      continue;
    }
    packages.push({
      name: entry,
      folder,
      manifest: JSON.parse(text) as Manifest,
    });
  }
  return packages;
}

function checkManifest(pkg: Package): Violation[] {
  const violations: Violation[] = [];
  const name = pkg.manifest.name ?? pkg.name;
  const file = 'package.json';
  if (!(CHAIN as readonly string[]).includes(name) && !(name in ISOLATED)) {
    violations.push({
      package: name,
      file,
      rule: 'chain',
      message: `package outside the declared chain (${CHAIN.join(' -> ')}); add it to CHAIN or rename it`,
    });
  }
  const keys = exportKeys(pkg.manifest);
  const allowed = ['.', ...(ALLOWED_SUBPATHS[name] ?? [])];
  const extra = keys.filter((key) => !allowed.includes(key));
  if (!keys.includes('.') || extra.length > 0) {
    violations.push({
      package: name,
      file,
      rule: 'exports',
      message: `exports must declare the root entry "." and only ${allowed.join(', ')}; declared: ${
        keys.length > 0 ? keys.join(', ') : '(missing)'
      }`,
    });
  }
  return violations;
}

function checkFile(
  root: string,
  pkg: Package,
  file: string,
  packages: Package[],
): Violation[] {
  const name = pkg.manifest.name ?? pkg.name;
  const text = withoutComments(readFileSync(file, 'utf8'));
  const rel = relative(root, file);
  const violations: Violation[] = [];

  const isCore = (CORE as readonly string[]).includes(name) && !isTest(rel);
  if (isCore) {
    for (const [pattern, cause] of IMPURITIES) {
      if (pattern.test(text)) {
        violations.push({
          package: name,
          file: rel,
          rule: 'purity',
          message: `the core does not use ${cause}; receive it as an argument or move it to an adapter`,
        });
      }
    }
  }

  for (const specifier of extractSpecifiers(text)) {
    if (isCore && (specifier.startsWith('node:') || NODE_MODULES.has(specifier))) {
      violations.push({
        package: name,
        file: rel,
        rule: 'purity',
        message: `the core does not import "${specifier}" (I/O); receive it as a port from an adapter`,
      });
    }
    if (specifier.startsWith('.')) {
      const target = resolve(dirname(file), specifier);
      const owner = packages.find((other) => isInside(target, other.folder));
      const testHelper = isTest(rel) && isInside(target, join(root, TEST_HELPERS));
      if (!testHelper && (owner === undefined || owner.name !== pkg.name)) {
        violations.push({
          package: name,
          file: rel,
          rule: 'internal',
          message: `relative import "${specifier}" leaves ${name}; another package is imported by its name`,
        });
      }
      continue;
    }

    const imported = packageName(specifier);
    const target = packages.find((other) => other.name === imported);
    if (target === undefined) {
      continue;
    }

    if (imported !== name && name in ISOLATED) {
      violations.push({
        package: name,
        file: rel,
        rule: 'isolated',
        message: `${name} is outside the chain and imports no workspace package; it imports ${imported}`,
      });
    }
    const importers = ISOLATED[imported];
    if (imported !== name && importers !== undefined && !importers.includes(name)) {
      violations.push({
        package: name,
        file: rel,
        rule: 'isolated',
        message: `${name} imports ${imported}; only ${importers.join(', ')} may import it`,
      });
    }

    const mine = (CHAIN as readonly string[]).indexOf(name);
    const theirs = (CHAIN as readonly string[]).indexOf(imported);
    if (mine >= 0 && theirs > mine) {
      violations.push({
        package: name,
        file: rel,
        rule: 'order',
        message: `${name} imports from ${imported}, which comes later in the chain (${CHAIN.join(' -> ')})`,
      });
    }

    const subpath = specifier.slice(imported.length);
    if (subpath !== '' && !exportKeys(target.manifest).includes(`.${subpath}`)) {
      violations.push({
        package: name,
        file: rel,
        rule: 'internal',
        message: `imports "${specifier}"; from ${imported} only its name and what its exports declares are imported`,
      });
    }

    const declared = {
      ...pkg.manifest.dependencies,
      ...pkg.manifest.peerDependencies,
    };
    if (imported !== name && !(imported in declared)) {
      violations.push({
        package: name,
        file: rel,
        rule: 'declaration',
        message: `imports ${imported} without declaring it in dependencies or peerDependencies`,
      });
    }
  }

  if (!ALLOWED_REEXPORTS.includes(rel.split('\\').join('/'))) {
    for (const match of text.matchAll(RE_REEXPORT)) {
      const imported = packageName(match[2]);
      if (imported !== name && packages.some((other) => other.name === imported)) {
        violations.push({
          package: name,
          file: rel,
          rule: 'reexport',
          message: `re-exports from ${imported}; whoever uses it imports it from ${imported} directly`,
        });
      }
    }
  }

  return violations;
}

function isTest(path: string): boolean {
  return /(^|\/)(test|tests|__tests__)\//.test(path) || /\.(test|spec)\.[cm]?tsx?$/.test(path);
}

function exportKeys(manifest: Manifest): string[] {
  const exports = manifest.exports;
  if (typeof exports !== 'object' || exports === null || Array.isArray(exports)) {
    return [];
  }
  return Object.keys(exports);
}

function packageName(specifier: string): string {
  const parts = specifier.split('/');
  if (specifier.startsWith('@')) {
    return parts.length >= 2 ? `${parts[0]}/${parts[1]}` : specifier;
  }
  return parts[0];
}

function isInside(path: string, folder: string): boolean {
  const rel = relative(folder, path);
  return rel === '' || (!rel.startsWith('..') && rel !== '..' && !rel.startsWith(`..${'/'}`));
}

function filesOf(folder: string): string[] {
  const found: string[] = [];
  const pending = [folder];
  while (pending.length > 0) {
    const current = pending.pop() as string;
    for (const entry of readdirSync(current, { withFileTypes: true }).sort((a, b) =>
      a.name.localeCompare(b.name),
    )) {
      const path = join(current, entry.name);
      if (entry.isDirectory()) {
        if (!IGNORED_FOLDERS.has(entry.name)) {
          pending.push(path);
        }
      } else if (
        entry.isFile() &&
        CODE_EXTENSIONS.some((extension) => entry.name.endsWith(extension)) &&
        !entry.name.endsWith('.d.ts') &&
        !IGNORED_FILES.test(entry.name)
      ) {
        found.push(path);
      }
    }
  }
  return found.sort();
}

function extractSpecifiers(text: string): string[] {
  const specifiers: string[] = [];
  for (const match of text.matchAll(RE_SPECIFIER)) {
    specifiers.push(match[2]);
  }
  return specifiers;
}

/** Sets strings aside before removing comments: a `//` inside a string is not a comment. */
function withoutComments(text: string): string {
  const placeholders: string[] = [];
  const withPlaceholders = text
    .replace(/(?:'[^'\\]*(?:\\.[^'\\]*)*'|"[^"\\]*(?:\\.[^"\\]*)*"|`[^`]*`)/g, (
      match,
    ) => `__STR${placeholders.push(match) - 1}__`);
  const stripped = withPlaceholders
    .replace(/\/\/.*$/gm, '  ')
    .replace(/\/\*[\s\S]*?\*\//g, '  ');
  return stripped.replace(/__STR(\d+)__/g, (_, i) => placeholders[Number(i)]);
}
