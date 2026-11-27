/**
 * Command `export`: writes the Dev UI of a Workspace as one self-contained, read-only HTML file (`--out`). The data
 * is captured through the `dev` API of a live Workspace that is opened, read once and closed (no server, no watcher,
 * nothing written next to the Workspace); the page, the layout Worker and the CSS come from the `dev-ui` build.
 * Fonts of the Themes (Workspace and `--theme-path`) go inside as `data:` URLs; Theme components with code go inside
 * too (whoever exports is the author, as with `dev --trust-code`), and the command says so.
 * Exit codes: 0 written, 1 the Workspace does not compile (its Issues on stdout, nothing written), 2 usage or I/O.
 */
import { mkdirSync, writeFileSync } from 'node:fs';
import { basename, dirname, resolve } from 'node:path';
import { parseArgs } from 'node:util';

import { captureExport, devUiFolder, exportHtml } from 'dev-ui';
import { openLiveWorkspace, fetchOverDevApi } from 'session';

import { diskPortOf, realClock } from './disk-port';
import { openSessionOf, issuesText, usage } from './cli-session';
import type { RunResult } from './cli-session';
import { readFontFile, readWorkspace } from './workspace';

export interface ExportDependencies {
  /** Folder of the `dev-ui` build; by default the real one. */
  statics?: string;
}

const MB = 1024 * 1024;

export async function exportCommand(args: readonly string[], { statics: statics = devUiFolder() }: ExportDependencies = {}): Promise<RunResult> {
  let valueList;
  try {
    valueList = parseArgs({ args: [...args], options: { workspace: { type: 'string' }, out: { type: 'string' }, 'theme-path': { type: 'string' } }, strict: true }).values;
  } catch (error) {
    return usage((error as Error).message);
  }
  if (valueList.workspace === undefined) return usage('Missing --workspace <path>');
  if (valueList.out === undefined) return usage('Missing --out <file>.html');
  const workspace = valueList.workspace;
  const themes = valueList['theme-path'];

  const opened = openSessionOf(readWorkspace, workspace, themes);
  if ('failure' in opened) return opened.failure;
  if (opened.session.source === undefined) return { exitCode: 1, stdout: await issuesText(opened.session), stderr: '' };

  let html: string;
  let viewList: number;
  let components: string[];
  try {
    const live = await openLiveWorkspace({
      port: { ...diskPortOf(workspace, themes === undefined ? {} : { themes }), watch: () => () => undefined },
      root: resolve(workspace),
      clock: realClock,
      now: Date.now,
      trustCode: true,
    });
    try {
      const roots = themes === undefined ? [workspace] : [workspace, themes];
      const data = await captureExport({ fetch: fetchOverDevApi(live), readSource: (path) => { const f = readFontFile(roots, path); return f && { bytes: f.bytes, kind: f.type }; } });
      viewList = data.estado.vistas.length;
      components = data.componentes?.nombres ?? [];
      html = exportHtml(data, { title: `${basename(resolve(workspace))} - rinthel-arch`, statics });
    } finally {
      live.close();
    }
  } catch (error) {
    return usage(`Could not export: ${(error as Error).message}`);
  }

  const out = valueList.out;
  try {
    mkdirSync(dirname(out), { recursive: true });
    writeFileSync(out, html);
  } catch (error) {
    return usage(`Could not write '${out}': ${(error as Error).message}`);
  }
  const notice = components.length === 0 ? '' : `NOTE: the file includes the code of the Theme components (${components.join(', ')}); it runs in the browser of whoever opens it.\n`;
  return { exitCode: 0, stdout: `${notice}Exported ${viewList} Views to ${out} (${(Buffer.byteLength(html) / MB).toFixed(2)} MB)\n`, stderr: '' };
}
