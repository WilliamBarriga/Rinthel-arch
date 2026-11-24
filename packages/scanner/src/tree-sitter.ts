/**
 * The only door to `web-tree-sitter` (WASM, no native build). The runtime starts once per process and each grammar
 * loads on first use, so a repo without files of a language never pays for its grammar.
 */
import { existsSync } from 'node:fs';
import { createRequire } from 'node:module';
import { basename } from 'node:path';
import { fileURLToPath } from 'node:url';

import { Language, Parser, Query } from 'web-tree-sitter';

/** A grammar ready to parse: `captures(text)` returns each capture's name, text and 1-based line. */
export interface Grammar {
  captures(text: string): Capture[];
}

export interface Capture {
  name: string;
  text: string;
  line: number;
}

let runtime: Promise<void> | undefined;
const grammars = new Map<string, Promise<Grammar>>();
const requireFrom = createRequire(import.meta.url);

/** The bundled npm package ships each grammar `.wasm` next to its JS; in the workspace, the grammar package has it. */
function resolveFile(wasm: string): string {
  const bundled = fileURLToPath(new URL(basename(wasm), import.meta.url));
  return existsSync(bundled) ? bundled : requireFrom.resolve(wasm);
}

/**
 * `wasm`: module path of the grammar's `.wasm`, resolved from this package (for example
 * `tree-sitter-typescript/tree-sitter-typescript.wasm`). `query`: a tree-sitter query; every capture is returned.
 */
export function loadGrammar(wasm: string, query: string): Promise<Grammar> {
  const key = `${wasm}\n${query}`;
  let grammar = grammars.get(key);
  if (grammar === undefined) {
    grammar = load(wasm, query);
    grammars.set(key, grammar);
  }
  return grammar;
}

async function load(wasm: string, source: string): Promise<Grammar> {
  runtime ??= Parser.init();
  await runtime;
  const language = await Language.load(resolveFile(wasm));
  const parser = new Parser();
  parser.setLanguage(language);
  const query = new Query(language, source);
  return {
    captures(text) {
      const tree = parser.parse(text);
      if (tree === null) return [];
      try {
        return query.captures(tree.rootNode).map(({ name, node }) => ({ name, text: node.text, line: node.startPosition.row + 1 }));
      } finally {
        tree.delete();
      }
    },
  };
}
