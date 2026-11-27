/**
 * Activity log (ADR 0005): the only place in the CLI that builds the Activity Event of `validate`, `build`,
 * `inspect` and `edit`, however they end, and appends it with `disk-log.ts` (owner of the file and its rotation).
 * Invariants: one Event per command. Without a `--workspace` that resolves to a folder nothing is logged.
 * Error modes: none visible; a write failure is ignored and does not change stdout, stderr or the exit code.
 */
import { ACTIVITY_CONTRACT_VERSION, COMMANDS_WITH_ACTIVITY } from 'canonical';
import type { ActivityEvent, ActivityTarget } from 'canonical';
import { statSync } from 'node:fs';
import { resolve } from 'node:path';

import { appendToLog } from './disk-log';
import type { RunResult } from './cli-session';

/** What the command names and, in `validate` and `build`, the issue count. */
export interface ActivityData {
  target?: ActivityTarget;
  summary?: { errors: number; warnings: number };
}

/** A command that logs also returns its activity data; `run` strips it before answering. */
export type ResultWithActivity = RunResult & { activity?: ActivityData };

export type Environment = Readonly<Record<string, string | undefined>>;

const logs = (command: string | undefined): command is ActivityEvent['command'] =>
  (COMMANDS_WITH_ACTIVITY as readonly string[]).includes(command ?? '');

/** Value of `--workspace <path>` or `--workspace=<path>`, as `parseArgs` would read it. */
function workspaceOf(args: readonly string[]): string | undefined {
  for (let i = 0; i < args.length; i++) {
    const arg = args[i] as string;
    if (arg === '--') return undefined;
    if (arg === '--workspace') return args[i + 1];
    if (arg.startsWith('--workspace=')) return arg.slice('--workspace='.length);
  }
  return undefined;
}

function folderOf(args: readonly string[]): string | undefined {
  const workspace = workspaceOf(args);
  if (workspace === undefined) return undefined;
  try {
    return statSync(workspace).isDirectory() ? resolve(workspace) : undefined;
  } catch {
    return undefined;
  }
}

/** Runs `execute` and, if `argv` is a command that logs, appends its Event. Returns the result without the data. */
export async function withActivity(
  argv: readonly string[],
  env: Environment,
  execute: () => Promise<ResultWithActivity>,
): Promise<RunResult> {
  const start = Date.now();
  const { activity, ...result } = await execute();
  const [command, ...args] = argv;
  if (!logs(command) || env['DIAGRAMS_ACTIVITY'] === '0') return result;
  const folder = folderOf(args);
  if (folder === undefined) return result;
  const agentName = env['DIAGRAMS_AGENT'];
  const event: ActivityEvent = {
    contractVersion: ACTIVITY_CONTRACT_VERSION,
    ts: new Date(start).toISOString(),
    pid: process.pid,
    ...(agentName !== undefined && agentName !== '' && { agent: agentName }),
    command: command,
    args,
    exitCode: result.exitCode,
    durationMs: Date.now() - start,
    ...(activity?.target !== undefined && Object.keys(activity.target).length > 0 && { target: activity.target }),
    ...(activity?.summary !== undefined && { summary: activity.summary }),
  };
  try {
    appendToLog(folder, `${JSON.stringify(event)}\n`);
  } catch {
    // The log is an auxiliary trace: it never alters the command output.
  }
  return result;
}
