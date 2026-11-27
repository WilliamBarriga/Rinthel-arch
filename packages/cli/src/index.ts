/**
 * `cli`: commands `validate`, `build`, `skill`, `inspect`, `edit`, `dev`, `scan` and `export` (options: `docs/guide/cli.md`).
 * Interface: `run(argv, dependencies?) -> { exitCode, stdout, stderr }`; does not write to the process (`bin.ts` prints).
 * Invariants: the only package with disk I/O; `validate` never rewrites and returns every issue sorted;
 * its only side effect is the Activity log in `.diagrams/activity.jsonl`.
 * Error modes: issues as data; usage or internal failure -> stderr, empty stdout, code 2.
 * Exit codes: 0 ok, 1 Workspace errors or rejected edit, 2 usage or internal failure.
 */
import { obsoleteConventions, validateOutputSchema } from 'canonical';
import type { WorkspaceFiles } from 'dsl';
import { parseArgs } from 'node:util';

import { withActivity } from './activity';
import type { Environment, ResultWithActivity } from './activity';
import { helpFor } from './help';
import { editCommand } from './edit-command';
import { inspectCommand } from './inspect-command';
import { devCommand } from './dev';
import { exportCommand } from './export';
import { DEFAULT_MAX_ISSUES, openSessionOf, issuesText, usage } from './cli-session';
import type { RunResult } from './cli-session';
import { scanCommand } from './scan';
import { generateSkill } from './skill';
import { buildOutput, readableText } from './validate';
import { OUTPUT_FOLDER, writeOutput, writeTextFile, readPaths, readWorkspace } from './workspace';

export { startDev } from './dev';
export { OUTPUT_FOLDER } from './workspace';
export { DRAFT_PATH, SCAN_CONTRACT_VERSION } from './scan';
export type { DevOptions, DevServer } from './dev';

export type { RunResult };

/** By default, the real ones. */
export interface Dependencies {
  read?: (root: string) => WorkspaceFiles;
  /** Paths of every file of the Workspace (naming conventions); with an injected `read`, its keys. */
  list?: (root: string) => string[];
  write?: (root: string, files: Readonly<Record<string, string | Uint8Array>>, subfolder?: string) => void;
  /** Creates missing folders. */
  writeFile?: (path: string, text: string) => void;
  /** `DIAGRAMS_ACTIVITY` and `DIAGRAMS_AGENT` variables of the Activity log; by default `process.env`. */
  env?: Environment;
}

type ParsedOptions = ReturnType<typeof readOptions>;

const COMMON_OPTIONS = {
  workspace: { type: 'string' },
  json: { type: 'boolean', default: false },
  strict: { type: 'boolean', default: false },
  'max-issues': { type: 'string' },
} as const;

function readOptions(args: readonly string[], own: Record<string, { type: 'string' }> = {}) {
  return parseArgs({
    args: [...args],
    options: { ...COMMON_OPTIONS, ...own },
    strict: true,
  }).values as Record<string, string | boolean | undefined>;
}

/**
 * `--help`, `-h`, `help [command]` or no arguments give the usage (code 0). `validate` and `build` exit 1 with errors
 * (with `--strict`, also with warnings); `--json` prints exactly one `validateOutputSchema` object.
 * `build` replaces `canonico.json` and `geometria/` in `<workspace>/.diagrams/` and, if it fails, deletes them. `validate`,
 * `build`, `inspect` and `edit` append an Event to the Activity log (`activity.ts`), unless `DIAGRAMS_ACTIVITY=0`. An undeclared `--theme`,
 * an unknown command or an invalid option exit 2. Theme `.tsx` files are compiled without running them.
 */
export async function run(
  argv: readonly string[],
  dependencies: Dependencies = {},
): Promise<RunResult> {
  const help = helpFor(argv);
  if (help !== undefined) return { exitCode: 0, stdout: help, stderr: '' };
  return withActivity(argv, dependencies.env ?? process.env, () => dispatch(argv, dependencies));
}

async function dispatch(argv: readonly string[], dependencies: Dependencies): Promise<ResultWithActivity> {
  const [command, ...rest] = argv;
  if (command === 'edit') return editCommand(rest, dependencies);
  if (command === 'inspect') return inspectCommand(rest, dependencies);
  if (command === 'dev') return devCommand(rest);
  if (command === 'scan') return scanCommand(rest, { writeText: dependencies.writeFile });
  if (command === 'export') return exportCommand(rest);
  if (command !== 'validate' && command !== 'build' && command !== 'skill') {
    return usage(
      `Unknown command '${command ?? ''}'. Usage: diagrams <validate|build|skill|inspect|edit|dev|scan|export> --workspace <path> (diagrams --help for details)`,
    );
  }
  if (command === 'skill') return skill(rest, dependencies);

  let options: ParsedOptions;
  try {
    options = readOptions(rest, { theme: { type: 'string' }, 'theme-path': { type: 'string' } });
  } catch (error) {
    return usage((error as Error).message);
  }
  if (options['workspace'] === undefined) return usage('Missing --workspace <path>');
  const maxIssues = Number(options['max-issues'] ?? DEFAULT_MAX_ISSUES);
  if (!Number.isInteger(maxIssues) || maxIssues < 1) return usage('--max-issues must be an integer >= 1');

  return execute(command, options, maxIssues, dependencies);
}

async function skill(
  args: readonly string[],
  { read: read = readWorkspace, writeFile: writeFile = writeTextFile }: Dependencies,
): Promise<RunResult> {
  let options;
  try {
    options = parseArgs({
      args: [...args],
      options: { workspace: { type: 'string' }, out: { type: 'string' } },
      strict: true,
    }).values;
  } catch (error) {
    return usage((error as Error).message);
  }
  if (options.workspace === undefined) return usage('Missing --workspace <path>');

  const opened = openSessionOf(read, options.workspace);
  if ('failure' in opened) return opened.failure;
  const { session } = opened;
  if (session.source === undefined) return { exitCode: 1, stdout: await issuesText(session), stderr: '' };
  const text = generateSkill(session.source);
  if (options.out === undefined) return { exitCode: 0, stdout: text, stderr: '' };
  try {
    writeFile(options.out, text);
  } catch (error) {
    return usage(`Could not write '${options.out}': ${(error as Error).message}`);
  }
  return { exitCode: 0, stdout: `Skill written to ${options.out}\n`, stderr: '' };
}

async function execute(
  command: 'validate' | 'build',
  options: ParsedOptions,
  maxIssues: number,
  { read: read = readWorkspace, write: write = writeOutput, list: list = read === readWorkspace ? readPaths : (r) => Object.keys(read(r)) }: Dependencies,
): Promise<ResultWithActivity> {
  const root = options['workspace'] as string;
  const themesFolder = options['theme-path'] as string | undefined;
  const theme = options['theme'] as string | undefined;
  const opened = openSessionOf(read, root, themesFolder, theme === undefined ? {} : { theme });
  if ('failure' in opened) return opened.failure;
  const { session } = opened;

  let issues;
  let outputFiles: Record<string, string> = {};
  if (session.source !== undefined && theme !== undefined && !session.source.themes.some(({ name }) => name === theme)) {
    const available = session.source.themes.map(({ name }) => name).join(', ');
    return usage(`Theme '${theme}' is not declared. Available: ${available}`);
  }
  try {
    if (command === 'build') {
      ({ files: outputFiles, issues } = await session.build());
    } else {
      issues = await session.diagnose();
    }
  } catch (error) {
    return usage(`Internal error while computing the geometry: ${(error as Error).message}`);
  }

  let output;
  try {
    output = validateOutputSchema.parse(
      buildOutput([...issues, ...obsoleteConventions(list(root))], { maxIssues, strict: options['strict'] === true }),
    );
  } catch (error) {
    return usage(`Internal error: the output does not meet the contract (${(error as Error).message})`);
  }
  if (command === 'build') {
    // A failed build deletes the previous output so no stale geometry is left.
    try {
      write(root, output.ok ? outputFiles : {});
    } catch (error) {
      return usage(`Could not write ${OUTPUT_FOLDER}/: ${(error as Error).message}`);
    }
  }
  return {
    exitCode: output.ok ? 0 : 1,
    stdout: options['json'] === true ? `${JSON.stringify(output, null, 2)}\n` : readableText(output),
    stderr: '',
    activity: { summary: { errors: output.summary.errors, warnings: output.summary.warnings } },
  };
}
