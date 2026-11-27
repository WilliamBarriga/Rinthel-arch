/**
 * Compiles the Workspace's Theme component `.tsx` files with esbuild; never runs them.
 * `components`: capitalized named exports. `bundle`: body of a `(require) => exports` function in CommonJS.
 * If a `.tsx` stops compiling, its last good version stays in `components` and `bundle` and the error comes out as an issue.
 * Memoizes by content hash. A missing Workspace or one without `.tsx` has no components nor issues.
 */
import { createHash } from 'node:crypto';
import { readdirSync, readFileSync } from 'node:fs';
import { join, relative, sep } from 'node:path';

import { buildSync } from 'esbuild';
import type { BuildOptions, Message } from 'esbuild';

import { CODES } from 'canonical';
import type { Issue } from 'canonical';
import type { CompiledCode, ComponentInterface } from 'session';

/** What the live Workspace of `session` expects from the compiler (`CompiledCode`). */
export type CodeResult = CompiledCode;

interface CompiledModule {
  cjs: string;
  exportedNames: readonly string[];
}

const IGNORED_FOLDERS = new Set(['node_modules', 'dist']);
const EXTERNALS = ['react', 'react/jsx-runtime', 'react/jsx-dev-runtime'];
const isComponent = (name: string): boolean => /^[A-Z][A-Za-z0-9_]*$/.test(name);

/** Relative, with `/`, sorted; empty if the root cannot be read. */
function tsxPaths(root: string): string[] {
  const paths: string[] = [];
  const visit = (folder: string): void => {
    for (const input of readdirSync(folder, { withFileTypes: true })) {
      if (input.name.startsWith('.') || IGNORED_FOLDERS.has(input.name)) continue;
      const path = join(folder, input.name);
      if (input.isDirectory()) visit(path);
      else if (input.name.endsWith('.tsx')) paths.push(relative(root, path).split(sep).join('/'));
    }
  };
  try {
    visit(root);
  } catch {
    return [];
  }
  return paths.sort();
}

const commonOptions = (root: string, path: string): BuildOptions => ({
  entryPoints: [path],
  absWorkingDir: root,
  bundle: true,
  write: false,
  platform: 'browser',
  target: 'es2020',
  jsx: 'automatic',
  external: EXTERNALS,
  logLevel: 'silent',
  charset: 'ascii',
  legalComments: 'none',
});

const esbuildIssue = (message: Message, defaultPath: string): Issue => ({
  code: CODES.E_THEME_CODE_COMPILE,
  severity: 'error',
  file: message.location?.file.split(sep).join('/') ?? defaultPath,
  line: message.location?.line ?? 1,
  column: (message.location?.column ?? 0) + 1,
  message: `The component does not compile: ${message.text}`,
});

/** The ESM build gives the exports; the CommonJS one is what the browser loads. */
function compileFile(root: string, path: string): { module: CompiledModule } | { errors: Issue[] } {
  try {
    const esm = buildSync({ ...commonOptions(root, path), format: 'esm', metafile: true });
    const output = Object.values(esm.metafile?.outputs ?? {})[0];
    const cjs = buildSync({ ...commonOptions(root, path), format: 'cjs' }).outputFiles?.[0]?.text ?? '';
    return { module: { cjs, exportedNames: (output?.exports ?? []).filter(isComponent) } };
  } catch (error) {
    const messages = (error as { errors?: Message[] }).errors;
    return { errors: messages === undefined || messages.length === 0 ? [{ code: CODES.E_THEME_CODE_COMPILE, severity: 'error', file: path, line: 1, column: 1, message: `The component does not compile: ${(error as Error).message}` }] : messages.map((m) => esbuildIssue(m, path)) };
  }
}

const joinModules = (moduleList: ReadonlyArray<[string, CompiledModule]>): string =>
  [
    'var salida = {};',
    ...moduleList.map(([, { cjs }]) => `Object.assign(salida, (function () { var module = { exports: {} }; var exports = module.exports;\n${cjs}\nreturn module.exports; })());`),
    'return salida;',
  ].join('\n');

const fingerprintOf = (root: string, paths: readonly string[]): string => {
  const hash = createHash('sha256');
  for (const path of paths) hash.update(path).update('\0').update(readFileSync(join(root, ...path.split('/')))).update('\0');
  return hash.digest('hex');
};

export function codeCompiler(root: string): { compile(): CodeResult } {
  const good = new Map<string, CompiledModule>();
  let last: { fingerprint: string; result: CodeResult } | undefined;
  return {
    compile() {
      const paths = tsxPaths(root);
      let fingerprint: string;
      try {
        fingerprint = fingerprintOf(root, paths);
      } catch {
        return last?.result ?? { components: {}, issues: [], bundle: joinModules([]) };
      }
      if (last?.fingerprint === fingerprint) return last.result;

      const issues: Issue[] = [];
      for (const path of paths) {
        const compiled = compileFile(root, path);
        if ('module' in compiled) good.set(path, compiled.module);
        else issues.push(...compiled.errors);
      }
      for (const path of [...good.keys()]) if (!paths.includes(path)) good.delete(path);

      const components: Record<string, ComponentInterface> = {};
      const owner = new Map<string, string>();
      for (const [path, { exportedNames }] of [...good].sort(([a], [b]) => a.localeCompare(b))) {
        for (const name of exportedNames) {
          const previous = owner.get(name);
          if (previous !== undefined) {
            issues.push({ code: CODES.E_THEME_COMPONENT_DUPLICATE, severity: 'error', file: path, line: 1, column: 1, message: `Component '${name}' is already exported by '${previous}'`, related: [{ file: previous, line: 1, column: 1, message: `First '${name}'` }] });
            continue;
          }
          owner.set(name, path);
          components[name] = {};
        }
      }
      const result = { components, issues, bundle: joinModules([...good].sort(([a], [b]) => a.localeCompare(b))) };
      last = { fingerprint, result };
      return result;
    },
  };
}
