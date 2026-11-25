/**
 * The only door to `web-tree-sitter` (WASM, no native build). The runtime starts once per process and each grammar
 * loads on first use, so a repo without files of a language never pays for its grammar.
 */
import { existsSync } from 'node:fs';
import { createRequire } from 'node:module';
import { basename } from 'node:path';
import { fileURLToPath } from 'node:url';

import { Language, Parser, Query } from 'web-tree-sitter';
import type { Node } from 'web-tree-sitter';

export type SyntaxNode = Node;

/** A grammar that hands the syntax tree to a reader; the tree is freed when the reader returns. */
export interface Syntax {
  parse<T>(text: string, read: (root: SyntaxNode) => T): T | undefined;
}

/** A grammar ready to parse: `captures(text)` returns each capture's name, text and 1-based line. */
export interface Grammar {
  captures(text: string): Capture[];
}

export interface Capture {
  name: string;
  text: string;
  line: number;
}

/** Grammar `.wasm` module paths, resolved from this package. */
export const TYPESCRIPT_GRAMMAR = 'tree-sitter-typescript/tree-sitter-typescript.wasm';
/** TSX, which also reads plain JS and JSX. */
export const TSX_GRAMMAR = 'tree-sitter-typescript/tree-sitter-tsx.wasm';
export const PYTHON_GRAMMAR = 'tree-sitter-python/tree-sitter-python.wasm';

/** `.ts`, `.mts` and `.cts` (not `.d.ts`) use the TypeScript grammar; `.tsx` and every JS extension use TSX. */
export const typescriptGrammarFor = (path: string): string =>
  /\.(?:ts|mts|cts)$/.test(path) && !path.endsWith('.d.ts') ? TYPESCRIPT_GRAMMAR : TSX_GRAMMAR;

let runtime: Promise<void> | undefined;
const languages = new Map<string, Promise<Language>>();
const syntaxes = new Map<string, Promise<Syntax>>();
const grammars = new Map<string, Promise<Grammar>>();
const requireFrom = createRequire(import.meta.url);

/** The bundled npm package ships each grammar `.wasm` next to its JS; in the workspace, the grammar package has it. */
function resolveFile(wasm: string): string {
  const bundled = fileURLToPath(new URL(basename(wasm), import.meta.url));
  return existsSync(bundled) ? bundled : requireFrom.resolve(wasm);
}

/** Starts the runtime once and loads each grammar once per process. */
function loadLanguage(wasm: string): Promise<Language> {
  let language = languages.get(wasm);
  if (language === undefined) {
    runtime ??= Parser.init();
    language = runtime.then(() => Language.load(resolveFile(wasm)));
    languages.set(wasm, language);
  }
  return language;
}

/** Memoizes `create(key)` in `cache`. */
function memo<T>(cache: Map<string, Promise<T>>, key: string, create: () => Promise<T>): Promise<T> {
  let value = cache.get(key);
  if (value === undefined) {
    value = create();
    cache.set(key, value);
  }
  return value;
}

/**
 * For readers that walk the tree themselves (schema extractors). `wasm`: module path of the grammar's `.wasm`, resolved
 * from this package (for example `TYPESCRIPT_GRAMMAR`).
 */
export function loadSyntax(wasm: string): Promise<Syntax> {
  return memo(syntaxes, wasm, async () => {
    const language = await loadLanguage(wasm); // also starts the runtime, which `new Parser()` needs
    const parser = new Parser();
    parser.setLanguage(language);
    return {
      parse(text, read) {
        const tree = parser.parse(text);
        if (tree === null) return undefined;
        try {
          return read(tree.rootNode);
        } finally {
          tree.delete();
        }
      },
    };
  });
}

/** Like `loadSyntax`, with a tree-sitter `query` whose every capture is returned. */
export function loadGrammar(wasm: string, query: string): Promise<Grammar> {
  return memo(grammars, `${wasm}\n${query}`, async () => {
    const [syntax, language] = await Promise.all([loadSyntax(wasm), loadLanguage(wasm)]);
    const compiled = new Query(language, query);
    return {
      captures: (text) =>
        syntax.parse(text, (root) =>
          compiled.captures(root).map(({ name, node }) => ({ name, text: node.text, line: node.startPosition.row + 1 })),
        ) ?? [],
    };
  });
}

/** Both TypeScript-family grammars, loaded; the result picks a file's (`typescriptGrammarFor`). */
export async function loadTypescriptSyntax(): Promise<(path: string) => Syntax> {
  const [ts, tsx] = await Promise.all([loadSyntax(TYPESCRIPT_GRAMMAR), loadSyntax(TSX_GRAMMAR)]);
  return (path) => (typescriptGrammarFor(path) === TYPESCRIPT_GRAMMAR ? ts : tsx);
}

/** Like `loadTypescriptSyntax`, with a query. */
export async function loadTypescriptGrammar(query: string): Promise<(path: string) => Grammar> {
  const [ts, tsx] = await Promise.all([loadGrammar(TYPESCRIPT_GRAMMAR, query), loadGrammar(TSX_GRAMMAR, query)]);
  return (path) => (typescriptGrammarFor(path) === TYPESCRIPT_GRAMMAR ? ts : tsx);
}
