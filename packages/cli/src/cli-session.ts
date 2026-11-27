import type { WorkspaceFiles } from 'dsl';
import { openSession } from 'session';
import type { Session } from 'session';

import { codeCompiler } from './code';
import { readFonts, readWorkspace } from './workspace';
import { buildOutput, readableText } from './validate';

export interface RunResult {
  exitCode: 0 | 1 | 2;
  stdout: string;
  stderr: string;
}

/** Usage or internal failure: code 2, message on stderr, empty stdout. */
export const usage = (message: string): RunResult => ({ exitCode: 2, stdout: '', stderr: `${message}\n` });

/** The contents of `--theme-path` go first: the Workspace wins on repeated paths. */
export function readWithThemes(read: (root: string) => WorkspaceFiles, root: string, themesFolder?: string): WorkspaceFiles {
  return { ...(themesFolder === undefined ? {} : read(themesFolder)), ...read(root) };
}

/** A read failure is a usage failure (code 2). */
export function openSessionOf(
  read: (root: string) => WorkspaceFiles,
  root: string,
  themesFolder?: string,
  options: { theme?: string } = {},
): { session: Session } | { failure: RunResult } {
  try {
    // With an injected read the Workspace is not on disk: there are no `.tsx` nor fonts to read.
    const onDisk = read === readWorkspace;
    const code = onDisk ? codeCompiler(root).compile() : { components: {}, issues: [] };
    const fonts = onDisk ? { fontFiles: [...new Set([...(themesFolder === undefined ? [] : readFonts(themesFolder)), ...readFonts(root)])] } : {};
    return { session: openSession(readWithThemes(read, root, themesFolder), { ...(options.theme !== undefined && { theme: options.theme }), ...fonts, components: code.components, adapterIssues: code.issues }) };
  } catch (error) {
    return { failure: usage(`Could not read the Workspace: ${(error as Error).message}`) };
  }
}

export const DEFAULT_MAX_ISSUES = 100;

/** Up to `DEFAULT_MAX_ISSUES` issues. */
export async function issuesText(session: Session): Promise<string> {
  return readableText(buildOutput(await session.diagnose(), { maxIssues: DEFAULT_MAX_ISSUES, strict: false }));
}

