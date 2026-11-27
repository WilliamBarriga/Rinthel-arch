/**
 * Command `edit`: the only explicit write on the DSL; writes only through `applyToWorkspace` and never when validating.
 * Forms: Pin (`--view --node --x --y`), `--intent '<json>'` or `--edits '<json>'` (1-based ranges, end excluded).
 * `--hash <file>=<hash>` is the `seen` of the Intent; each edit carries its `hash` (or takes `--hash`; with neither,
 * the one on disk when reading). A stale hash rejects everything, with no partial write.
 * Output: with `--json`, an `editOutputSchema` also on rejection. Codes: 0 written, 1 rejected, 2 usage or internal failure.
 */
import { EDIT_CONTRACT_VERSION, requestedEditsSchema, intentSchema, editOutputSchema } from 'canonical';
import type { EditOutput } from 'canonical';
import type { WorkspaceFiles } from 'dsl';
import { existsSync, renameSync } from 'node:fs';
import { parseArgs } from 'node:util';
import { applyToWorkspace, contentHash } from 'session';
import type { Applicable } from 'session';

import { readWithThemes, usage } from './cli-session';
import type { RunResult } from './cli-session';
import type { ResultWithActivity } from './activity';
import { REJECTION_CODE } from './rejections';
import type { EditRejection } from './rejections';
import { workspaceTarget, writeTextFile, readWorkspace } from './workspace';

const USAGE =
  "Usage: diagrams edit --workspace <path> (--view <id> --node <id> --x N --y N | --intent '<json>' | --edits '<json>') [--hash <file>=<hash>] [--theme-path <folder>] [--json]";

export async function editCommand(
  args: readonly string[],
  {
    read: read = readWorkspace,
    writeFile: writeFile = writeTextFile,
    renamePath: renamePath = renameSync,
    pathExists: pathExists = existsSync,
  }: {
    read?: (root: string) => WorkspaceFiles;
    writeFile?: (path: string, text: string) => void;
    /** Absolute paths; by default `fs.renameSync`. */
    renamePath?: (oldPath: string, newPath: string) => void;
    pathExists?: (path: string) => boolean;
  },
): Promise<ResultWithActivity> {
  let v;
  try {
    v = parseArgs({
      args: [...args],
      options: {
        workspace: { type: 'string' },
        'theme-path': { type: 'string' },
        json: { type: 'boolean', default: false },
        view: { type: 'string' },
        node: { type: 'string' },
        x: { type: 'string' },
        y: { type: 'string' },
        edits: { type: 'string' },
        intent: { type: 'string' },
        hash: { type: 'string', multiple: true },
      },
      strict: true,
    }).values;
  } catch (error) {
    return usage(`${(error as Error).message}. ${USAGE}`);
  }
  if (v.workspace === undefined) return usage(`Missing --workspace <path>. ${USAGE}`);
  const hasPin = [v.view, v.node, v.x, v.y].some((o) => o !== undefined);
  if ([hasPin, v.edits !== undefined, v.intent !== undefined].filter(Boolean).length !== 1) {
    return usage(`Give a Pin intent (--view --node --x --y), --intent or --edits, only one. ${USAGE}`);
  }

  const hashes = new Map<string, string>();
  for (const pair of v.hash ?? []) {
    const i = pair.lastIndexOf('=');
    if (i < 1) return usage(`--hash expects <file>=<hash>, got '${pair}'`);
    hashes.set(pair.slice(0, i), pair.slice(i + 1));
  }

  let ownFiles: WorkspaceFiles;
  let files: WorkspaceFiles;
  try {
    ownFiles = read(v.workspace);
    files = readWithThemes(read, v.workspace, v['theme-path']);
  } catch (error) {
    return usage(`Could not read the Workspace: ${(error as Error).message}`);
  }
  const currentHash = (file: string) => hashes.get(file) ?? contentHash(files[file] ?? '');
  const json = v.json === true;

  let applicable: Applicable;
  if (v.edits !== undefined) {
    let requested;
    try {
      requested = requestedEditsSchema.parse(JSON.parse(v.edits));
    } catch (error) {
      return usage(`--edits is not a valid array of { file, range, replacement, hash? }: ${(error as Error).message}`);
    }
    applicable = requested.map((e) => ({ ...e, hash: e.hash ?? currentHash(e.file) }));
  } else if (v.intent !== undefined) {
    let raw;
    try {
      raw = JSON.parse(v.intent) as Record<string, unknown>;
    } catch (error) {
      return usage(`--intent is not JSON: ${(error as Error).message}`);
    }
    // A `hash` in the JSON is ignored: the concurrency of an Intent is decided by `--hash`.
    const parsedIntent = intentSchema.safeParse(raw);
    if (!parsedIntent.success) return usage(`--intent is not a valid Intent: ${parsedIntent.error.message}`);
    applicable = parsedIntent.data;
  } else {
    const x = Number(v.x);
    const y = Number(v.y);
    if (v.view === undefined || v.node === undefined || v.x === undefined || v.y === undefined || !Number.isFinite(x) || !Number.isFinite(y)) {
      return usage(`The Pin requires --view, --node, --x and --y as numbers. ${USAGE}`);
    }
    applicable = { type: 'move-pin', view: v.view, node: v.node, x, y };
  }

  // What the Intent names; text edits only name the files that actually get written.
  const named = 'type' in applicable ? { view: applicable.view, ...('node' in applicable && { node: applicable.node }) } : {};
  const withTarget = (r: RunResult, writtenFiles?: string[]): ResultWithActivity => ({
    ...r,
    activity: { target: { ...named, ...(writtenFiles !== undefined && { files: writtenFiles }) } },
  });

  // Only writes under the Workspace root, never in `--theme-path`.
  const root = v.workspace;
  let result;
  try {
    result = applyToWorkspace(
      {
        read: () => ({ disk: files, own: ownFiles }),
        write: (f, text) => writeFile(workspaceTarget(root, f), text),
        renamePath: (oldPath, newPath) => renamePath(workspaceTarget(root, oldPath), workspaceTarget(root, newPath)),
        exists: (path) => pathExists(workspaceTarget(root, path)),
      },
      applicable,
      Object.fromEntries(hashes),
    );
  } catch (error) {
    return withTarget(usage(`Could not write: ${(error as Error).message}`));
  }
  if (!result.ok) return withTarget(rejected(result, json));
  const { edits: appliedEdits, changed, renamed } = result;
  // `files`: written files plus the new path of each rename.
  const touched = [...new Set([...changed, ...renamed.map((r) => r.rename)])].sort();
  const output: EditOutput = editOutputSchema.parse({
    contractVersion: EDIT_CONTRACT_VERSION,
    ok: true,
    edits: appliedEdits.map(({ file, range, replacement, rename }) => ({ file, range, replacement, ...(rename !== undefined && { rename }) })),
    files: touched,
  });
  const text = [
    `${changed.length} file(s) edited${changed.length === 0 ? '' : `: ${changed.join(', ')}`}`,
    ...renamed.map((r) => `renamed ${r.file} -> ${r.rename}`),
  ].join('\n');
  return withTarget({ exitCode: 0, stdout: json ? `${JSON.stringify(output, null, 2)}\n` : `${text}\n`, stderr: '' }, touched);
}

function rejected(r: EditRejection, json: boolean): RunResult {
  const exitCode = REJECTION_CODE;
  if (!json) return { exitCode, stdout: '', stderr: `Edit rejected (${r.reason}): ${r.message}\n` };
  const output = editOutputSchema.parse({
    contractVersion: EDIT_CONTRACT_VERSION,
    ok: false,
    reason: r.reason,
    message: r.message,
    ...(r.file === undefined ? {} : { file: r.file }),
  });
  return { exitCode, stdout: `${JSON.stringify(output, null, 2)}\n`, stderr: '' };
}
