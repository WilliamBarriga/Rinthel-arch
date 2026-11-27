/**
 * Command `inspect`, read only. With `--json`, an `inspectOutputSchema` object.
 * Codes: 0 answer, 1 not found or the Workspace has errors (message on stderr, empty stdout), 2 usage or internal failure.
 */
import type { WorkspaceFiles } from 'dsl';
import { parseArgs } from 'node:util';

import { INSPECT_COMMANDS } from 'canonical';
import type { InspectCommand } from 'canonical';

import { asJson, queryInspect, readableText } from './inspect';
import { openSessionOf, issuesText, usage as usoComun } from './cli-session';
import type { RunResult } from './cli-session';
import type { ResultWithActivity } from './activity';
import { readWorkspace } from './workspace';

const failure = (exitCode: 1 | 2, message: string): RunResult => ({ ...usoComun(message), exitCode });

export async function inspectCommand(
  args: readonly string[],
  { read: read = readWorkspace }: { read?: (root: string) => WorkspaceFiles },
): Promise<ResultWithActivity> {
  let parsed;
  try {
    parsed = parseArgs({
      args: [...args],
      options: {
        workspace: { type: 'string' },
        'theme-path': { type: 'string' },
        json: { type: 'boolean', default: false },
        kind: { type: 'string' },
        state: { type: 'string' },
        diagram: { type: 'string' },
        catalog: { type: 'boolean', default: false },
      },
      allowPositionals: true,
      strict: true,
    });
  } catch (error) {
    return failure(2, (error as Error).message);
  }
  const [command, argument, ...leftover] = parsed.positionals;
  const usage = 'Usage: diagrams inspect <search|node|view|interaction|planned|theme> [argument] --workspace <path> [--theme-path <folder>] [--json] (theme accepts --kind <kind> --state <state> --diagram <type> --catalog)';
  if (command === undefined || !(INSPECT_COMMANDS as readonly string[]).includes(command)) return failure(2, `Unknown or missing inspect subcommand. ${usage}`);
  if (command === 'planned' ? argument !== undefined : argument === undefined || leftover.length > 0) return failure(2, `inspect ${command} requires ${command === 'planned' ? 'no argument' : 'exactly one argument'}. ${usage}`);
  const { kind: type, state: status, diagram, catalog } = parsed.values;
  if (command !== 'theme' && (type !== undefined || status !== undefined || diagram !== undefined || catalog === true)) return failure(2, `--kind, --state, --diagram and --catalog only apply to 'inspect theme'. ${usage}`);
  if (parsed.values.workspace === undefined) return failure(2, 'Missing --workspace <path>');
  const named = SUBCOMMAND_TARGET[command];
  const result = await query(read, parsed.values.workspace, parsed.values['theme-path'], command, argument, { type, status, diagram, catalog, json: parsed.values.json === true });
  return named === undefined ? result : { ...result, activity: { target: { [named]: argument } } };
}

/** What each subcommand names in the Activity Event; `search` and `interaction` name no View, Node nor Theme. */
const SUBCOMMAND_TARGET: Readonly<Record<string, 'view' | 'node' | 'theme'>> = { view: 'view', node: 'node', theme: 'theme' };

async function query(
  read: (root: string) => WorkspaceFiles,
  workspace: string,
  themesFolder: string | undefined,
  command: string,
  argument: string,
  { type, status, diagram, catalog, json }: { type?: string | undefined; status?: string | undefined; diagram?: string | undefined; catalog?: boolean | undefined; json: boolean },
): Promise<RunResult> {

  const opened = openSessionOf(read, workspace, themesFolder);
  if ('failure' in opened) return opened.failure;
  const { session } = opened;
  if (session.source === undefined) {
    return failure(1, `The Workspace has errors; fix them with 'validate' before querying.\n${(await issuesText(session)).trimEnd()}`);
  }
  const response = queryInspect(session, { command: command as InspectCommand, argument: argument ?? '', catalog: catalog === true, ...(type !== undefined && { type }), ...(status !== undefined && { status }), ...(diagram !== undefined && { diagram }) });
  if (response === undefined) return failure(1, 'The Workspace has errors; fix them with \'validate\' before querying.');
  if ('notFound' in response) return failure(1, response.notFound);
  return { exitCode: 0, stdout: json ? asJson(response.output) : readableText(response.output), stderr: '' };
}
