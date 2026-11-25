/**
 * Python imports: `import a.b`, `from a.b import c` and relative `from .x import y`. Each statement is captured whole
 * by the grammar (so strings and comments never match) and its text is split by `parseStatement`. Local modules
 * resolve against the listed files: from the importing file's folder and each ancestor, plain or under `src/`
 * (`a/b.py`, `a/b/__init__.py`); anything else is a PyPI package named by its top-level module (PEP 503 normalized,
 * as the manifests' names are). The standard library and `__future__` are dropped.
 */
import { normalizePackage } from '../manifests';
import { PYTHON_GRAMMAR, loadGrammar } from '../tree-sitter';
import type { FoundImport, ImportContext, ImportExtractor, ImportTarget } from './extractor';
import { PYTHON_STDLIB } from './python-stdlib';

const QUERY = `
(import_statement) @statement
(import_from_statement) @statement
`;

export const pythonImports: ImportExtractor = {
  languages: ['python'],
  async load() {
    const grammar = await loadGrammar(PYTHON_GRAMMAR, QUERY);
    return (path, text, context) =>
      grammar.captures(text).flatMap(({ text: statement, line }): FoundImport[] =>
        parseStatement(statement).flatMap((found) => {
          const target = resolve(path, found, context);
          return target === undefined ? [] : [{ line, target }];
        }),
      );
  },
};

/** `dots`: leading dots of a relative import; `module`: dotted name (empty in `from . import x`); `names`: `from` items. */
interface Found {
  dots: number;
  module: string;
  names: string[];
}

function parseStatement(statement: string): Found[] {
  const code = statement.replace(/#[^\n]*/g, '').replace(/\\\n/g, ' ');
  const from = /^\s*from\s+(\.*)\s*([\w.]*)\s+import\s+([\s\S]*)$/.exec(code);
  if (from !== null) {
    const names = (from[3] as string)
      .replace(/[()]/g, ' ')
      .split(',')
      .map((item) => /^\s*(\w+)/.exec(item)?.[1])
      .filter((name): name is string => name !== undefined);
    return [{ dots: (from[1] as string).length, module: from[2] as string, names }];
  }
  const plain = /^\s*import\s+([\s\S]*)$/.exec(code);
  if (plain === null) return [];
  return (plain[1] as string)
    .split(',')
    .map((item) => /^\s*([\w.]+)/.exec(item)?.[1])
    .filter((module): module is string => module !== undefined)
    .map((module) => ({ dots: 0, module, names: [] }));
}

function resolve(from: string, { dots, module, names }: Found, { files }: ImportContext): ImportTarget | undefined {
  const parts = module === '' ? [] : module.split('.');
  const folder = from.split('/').slice(0, -1);
  if (dots > 0) {
    if (folder.length < dots - 1) return { unresolved: true };
    const base = folder.slice(0, folder.length - (dots - 1));
    const prefix = base.length === 0 ? '' : `${base.join('/')}/`;
    return (
      find(prefix, parts, names, files) ?? {
        file: parts.length === 0 ? `${prefix}__init__.py` : `${prefix}${parts.join('/')}.py`,
        exists: false,
      }
    );
  }
  const top = parts[0] as string;
  if (top === '__future__' || PYTHON_STDLIB.has(top)) return undefined;
  for (let depth = folder.length; depth >= 0; depth--) {
    const base = folder.slice(0, depth).join('/');
    for (const prefix of base === '' ? ['', 'src/'] : [`${base}/`, `${base}/src/`]) {
      if (!hasModule(files, `${prefix}${top}`)) continue;
      const found = find(prefix, parts, names, files);
      if (found !== undefined) return found;
    }
  }
  return { package: normalizePackage('pypi', top), ecosystem: 'pypi' };
}

/** The file of the module (or, for `from m import name`, the submodule `name`) found under `prefix`. */
function find(prefix: string, parts: readonly string[], names: readonly string[], files: ReadonlySet<string>): ImportTarget | undefined {
  const stem = `${prefix}${parts.join('/')}`;
  const sub = names.map((name) => `${parts.length === 0 ? prefix : `${stem}/`}${name}`).find((candidate) => hasModule(files, candidate));
  if (sub !== undefined) return { file: moduleFile(files, sub), exists: true };
  for (let length = parts.length; length > 0; length--) {
    const candidate = `${prefix}${parts.slice(0, length).join('/')}`;
    if (hasModule(files, candidate)) return { file: moduleFile(files, candidate), exists: true };
  }
  const init = `${prefix}__init__.py`;
  return parts.length === 0 && files.has(init) ? { file: init, exists: true } : undefined;
}

const hasModule = (files: ReadonlySet<string>, stem: string): boolean => files.has(`${stem}.py`) || files.has(`${stem}/__init__.py`);
const moduleFile = (files: ReadonlySet<string>, stem: string): string => (files.has(`${stem}.py`) ? `${stem}.py` : `${stem}/__init__.py`);
