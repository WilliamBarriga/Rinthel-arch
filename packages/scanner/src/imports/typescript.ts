/**
 * TS/JS imports: static `import`/`export ... from`, `import x = require()`, dynamic `import('x')` and `require('x')`
 * with a literal string. Relative specifiers resolve against the listed files (TS-style `.js` to `.ts` included);
 * bare ones become npm package names; Node builtins are dropped. `.ts`, `.mts`, `.cts` use the TypeScript grammar;
 * `.tsx` and every JS extension use the TSX grammar, which also reads plain JS and JSX.
 */
import { builtinModules } from 'node:module';

import { loadTypescriptGrammar } from '../tree-sitter';
import type { FoundImport, ImportExtractor, ImportTarget } from './extractor';

const QUERY = `
(import_statement source: (string (string_fragment) @source))
(export_statement source: (string (string_fragment) @source))
(import_require_clause source: (string (string_fragment) @source))
(call_expression function: (import) arguments: (arguments . (string (string_fragment) @source)))
(call_expression
  function: (identifier) @callee
  arguments: (arguments . (string (string_fragment) @source))
  (#eq? @callee "require"))
`;

const RESOLVABLE_EXTENSIONS = ['.ts', '.tsx', '.mts', '.cts', '.d.ts', '.js', '.jsx', '.mjs', '.cjs', '.json'];
const JS_TO_TS: Readonly<Record<string, readonly string[]>> = {
  '.js': ['.ts', '.tsx'],
  '.jsx': ['.tsx'],
  '.mjs': ['.mts'],
  '.cjs': ['.cts'],
};
const BUILTINS = new Set(builtinModules);
const NPM_NAME = /^(?:@[a-z0-9][\w.-]*\/)?[a-z0-9][\w.-]*$/i;

export const typescriptImports: ImportExtractor = {
  languages: ['typescript', 'javascript'],
  async load() {
    const grammarFor = await loadTypescriptGrammar(QUERY);
    return (path, text, { files }) =>
      grammarFor(path)
        .captures(text)
        .filter(({ name }) => name === 'source')
        .flatMap(({ text: specifier, line }): FoundImport[] => {
          const target = resolve(path, specifier, files);
          return target === undefined ? [] : [{ line, target }];
        });
  },
};

/** `undefined` for imports that are not dependencies (Node builtins). */
function resolve(from: string, specifier: string, files: ReadonlySet<string>): ImportTarget | undefined {
  if (specifier.startsWith('./') || specifier.startsWith('../') || specifier === '.' || specifier === '..') {
    const path = join(from.slice(0, from.lastIndexOf('/') + 1), specifier);
    if (path === undefined) return { unresolved: true };
    const found = candidates(path).find((candidate) => files.has(candidate));
    return { file: found ?? path, exists: found !== undefined };
  }
  if (specifier.startsWith('node:') || BUILTINS.has(specifier) || BUILTINS.has(specifier.split('/')[0] as string)) {
    return undefined;
  }
  const parts = specifier.split('/');
  const name = specifier.startsWith('@') ? parts.slice(0, 2).join('/') : (parts[0] as string);
  return NPM_NAME.test(name) ? { package: name, ecosystem: 'npm' } : { unresolved: true };
}

function candidates(path: string): string[] {
  const extension = /\.[cm]?jsx?$/.exec(path)?.[0];
  const swapped = extension === undefined ? [] : (JS_TO_TS[extension] ?? []).map((ts) => path.slice(0, -extension.length) + ts);
  return [
    path,
    ...swapped,
    ...RESOLVABLE_EXTENSIONS.map((ext) => path + ext),
    ...RESOLVABLE_EXTENSIONS.map((ext) => `${path}/index${ext}`),
  ];
}

/** Joins a `/`-ended folder (or `''`) and a relative path; `undefined` if it climbs above the root. */
function join(folder: string, relative: string): string | undefined {
  const parts = folder.split('/').filter((part) => part !== '');
  for (const part of relative.split('/')) {
    if (part === '' || part === '.') continue;
    if (part === '..') {
      if (parts.length === 0) return undefined;
      parts.pop();
    } else parts.push(part);
  }
  return parts.join('/');
}
