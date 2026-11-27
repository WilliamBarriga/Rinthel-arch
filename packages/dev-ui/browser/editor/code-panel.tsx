/**
 * Code tab: CodeMirror 6 editor of the DSL over a Workspace file (or one of `--theme-path`, read-only).
 * It saves on its own (`save.ts`), paints the state's issues inline (`diagnostics.ts`), completes keywords and ids
 * (`completion.ts`) and jumps to the definition with F12 (`inspect` query to `dev`). It responds to `codeSite`
 * (E, the Finder, F12, an issue) by opening the file and taking the cursor to the line.
 * External writes (#191): on each `version` the panel rereads `/api/files` and passes the file hash to the saver,
 * which reconciles the buffer (`reconciliation.ts`); the disk text enters annotated `fromDisk` with its lines marked,
 * and if the disk won an overlap a notice offers to recover what was lost during `NOTICE_DURATION_MS`.
 * Keys: Mod+S, `dev` undo and redo live in the command registry; Mod+Z, Mod+F and the Esc layers (completion,
 * search, multiple selection) belong to CodeMirror; the last Esc goes back to Views with the focus on the canvas.
 */
import { autocompletion, closeBrackets, closeBracketsKeymap, completionKeymap } from '@codemirror/autocomplete';
import { defaultKeymap, history, historyKeymap, indentWithTab } from '@codemirror/commands';
import { bracketMatching, indentOnInput } from '@codemirror/language';
import { lintKeymap, setDiagnostics } from '@codemirror/lint';
import { highlightSelectionMatches, searchKeymap } from '@codemirror/search';
import { EditorState } from '@codemirror/state';
import { EditorView, drawSelection, highlightActiveLine, keymap, lineNumbers } from '@codemirror/view';
import { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import type { ReactElement } from 'react';

import type { DevFiles, DevIssue } from '../../src/protocol';
import type { DevClient } from '../client';
import { commandById } from '../commands/registry';
import { applyFixes, issueFix } from '../issues/apply-fix';
import { useEditorChannel, useDevUi } from '../frame/context';
import type { DevUiContext } from '../frame/context';
import { useExpiry } from '../frame/use-expiry';
import { useReadByVersion } from '../frame/use-read-by-version';
import { exitSite } from '../site';
import type { CodeSite } from '../site';
import { completeDsl } from './completion';
import { diagnosticsOf } from './diagnostics';
import type { IssueFix } from './diagnostics';
import { createSaver } from './save';
import type { SaveState, Saver } from './save';
import { dslLanguage } from './language';
import { fromDisk, clearDiskMarks, diskMarks } from './disk-marks';
import type { Merge, LostFragment } from './reconciliation';

export { fromDisk };

/** How long the lines brought by the disk stay marked. */
export const MARKS_DURATION_MS = 4000;
/** How long recovering what the buffer lost in an overlap is offered. */
const NOTICE_DURATION_MS = 15000;

const SAVE_TEXT: Record<SaveState['kind'], string> = { guardado: 'Saved', 'sin-guardar': 'Unsaved', guardando: 'Saving...', error: 'Not saved' };

export function CodePanel(): ReactElement {
  const devUi = useDevUi();
  const { client, state } = devUi;
  const { site: codeSite } = useEditorChannel();
  // If the listing fails the previous one is kept: the open editor is not unmounted by a network error.
  const reading = useReadByVersion<DevFiles>(client, state?.version, {
    key: 'archivos',
    keepOnFailure: true,
    request: (c) => c.files(),
  });
  const listing = reading.kind === 'dato' ? reading.datum : undefined;
  const list = listing?.archivos;
  const [chosen, setChosen] = useState<string>();
  const [saved, setSaved] = useState<SaveState>({ kind: 'guardado' });
  useEffect(() => {
    if (codeSite !== undefined) setChosen(codeSite.file);
  }, [codeSite]);

  const file = chosen ?? list?.find((a) => !a.soloLectura)?.file ?? list?.[0]?.file;
  const ofFile = list?.find((a) => a.file === file);
  const readOnly = ofFile?.soloLectura ?? false;
  const hashOnDisk = ofFile?.hash;
  const listingVersion = listing?.version;
  const onDisk = useMemo(() => (hashOnDisk === undefined || listingVersion === undefined ? undefined : { hash: hashOnDisk, version: listingVersion }), [hashOnDisk, listingVersion]);
  const saveText = readOnly ? 'Read-only' : saved.kind === 'error' ? `${SAVE_TEXT.error}: ${saved.message}` : SAVE_TEXT[saved.kind];

  return (
    <div className="ui-codigo">
      <div className="ui-codigo-cabecera">
        <select aria-label="File" value={file ?? ''} onChange={(e) => setChosen(e.target.value)}>
          {(list ?? []).map((a) => (
            <option key={a.file} value={a.file}>
              {a.soloLectura ? `${a.file} (read-only)` : a.file}
            </option>
          ))}
        </select>
        <span role="status" aria-label="Editor save state" className="ui-guardado" data-estado={saved.kind}>
          {saveText}
        </span>
      </div>
      {file !== undefined && <FileEditor key={file} file={file} readOnly={readOnly} site={codeSite?.file === file ? codeSite : undefined} onDisk={onDisk} onSaveChange={setSaved} />}
    </div>
  );
}

interface EditorProps {
  file: string;
  readOnly: boolean;
  /** Line to take the cursor to (each new object is a new jump). */
  site: CodeSite | undefined;
  /** Hash of the file on disk according to `dev` and the `version` of the listing that gave it. */
  onDisk: { hash: string; version: number } | undefined;
  onSaveChange(state: SaveState): void;
}

function FileEditor({ file, readOnly, site, onDisk, onSaveChange }: EditorProps): ReactElement {
  const devUi = useDevUi();
  const editorChannel = useEditorChannel();
  // CodeMirror and the saver call the Dev UI outside React: they read the context of the last committed render.
  const live = useRef(devUi);
  const channel = useRef(editorChannel);
  useLayoutEffect(() => {
    live.current = devUi;
    channel.current = editorChannel;
  });
  const host = useRef<HTMLDivElement>(null);
  const [editor, setEditor] = useState<{ view: EditorView; saver: Saver }>();
  const [saveState, setSaveState] = useState<SaveState>({ kind: 'guardado' });
  const [lost, setLost] = useState<LostFragment[]>([]);
  const [marked, setMarked] = useState(0);

  useEffect(() => {
    let current = true;
    let created: { view: EditorView; saver: Saver } | undefined;
    const onReconcile = (merge: Merge): void => {
      if (created === undefined) return;
      created.view.dispatch({ changes: merge.toBuffer, annotations: fromDisk.of(true) });
      if (!merge.toBuffer.empty) setMarked((n) => n + 1);
      if (merge.lost.length > 0) setLost(merge.lost);
    };
    void devUi.client.file(file).then((parsed) => {
      if (!current || parsed === undefined || host.current === null) return;
      const saver = createSaver({
        file,
        base: parsed.texto,
        version: parsed.version,
        send: (request) => live.current.client.editText(request),
        readDisk: async () => {
          const disk = await live.current.client.file(file);
          return disk === undefined ? undefined : { text: disk.texto, version: disk.version };
        },
        onReconcile: onReconcile,
        onStateChange: (e) => {
          setSaveState(e);
          onSaveChange(e);
        },
      });
      const view = new EditorView({ parent: host.current, state: EditorState.create({ doc: parsed.texto, extensions: extensions(file, readOnly, saver, live) }) });
      created = { view, saver };
      setEditor(created);
    });
    return () => {
      current = false;
      if (created === undefined) return;
      created.saver.close();
      void created.saver.save();
      created.view.destroy();
    };
    // The editor is created once per file (the tab uses `key={file}`).
  }, [file]);

  useEffect(() => {
    if (editor === undefined) return;
    onSaveChange(editor.saver.state());
    return channel.current.registerSave(() => editor.saver.save());
  }, [editor, onSaveChange]);

  useEffect(() => {
    // Also read-only (--theme-path): without own changes, the merge is applying the clean disk diff.
    if (editor !== undefined && onDisk !== undefined) void editor.saver.sync(onDisk);
  }, [editor, onDisk]);

  useExpiry(editor === undefined || marked === 0 ? undefined : MARKS_DURATION_MS, () => editor?.view.dispatch({ effects: clearDiskMarks.of(null) }), `${marked}`);
  useExpiry(lost.length === 0 ? undefined : NOTICE_DURATION_MS, () => setLost([]), lost);

  // Inline issues: only with the buffer equal to the disk, so positions match.
  const issues = devUi.state?.issues;
  useEffect(() => {
    if (editor === undefined || issues === undefined || editor.saver.dirty()) return;
    const { view } = editor;
    view.dispatch(setDiagnostics(view.state, diagnosticsOf(view.state.doc, file, issues, (fix, issue) => applyFix(view, file, fix, issue, live.current))));
  }, [editor, issues, saveState, file]);

  useEffect(() => {
    if (editor === undefined || site === undefined) return;
    const { view } = editor;
    const line = view.state.doc.line(Math.min(Math.max(site.line, 1), view.state.doc.lines));
    view.dispatch({ selection: { anchor: line.from }, effects: EditorView.scrollIntoView(line.from, { y: 'center' }) });
    view.focus();
  }, [editor, site]);

  const recover = (): void => {
    if (editor !== undefined) recoverLost(editor.view, lost);
    setLost([]);
  };

  return (
    <>
      {lost.length > 0 && (
        <div role="alert" aria-label="External write" className="ui-aviso-del-disco">
          <span>{`The file changed on disk and the disk won in ${lost.length === 1 ? 'one place' : `${lost.length} places`} (${lost.map((p) => `line ${p.line}`).join(', ')}).`}</span>
          <button type="button" onClick={recover}>
            Restore mine
          </button>
          <button type="button" onClick={() => setLost([])}>
            Dismiss
          </button>
        </div>
      )}
      <div ref={host} className="ui-editor" />
    </>
  );
}

/** Reinserts each lost fragment before its line, as a user edit (it is saved and undone with Mod+Z). */
/** Puts mine in place of the disk version of each stretch (or inserts it, if they were only new lines): without duplicating. */
function recoverLost(view: EditorView, lost: readonly LostFragment[]): void {
  const doc = view.state.doc;
  const line = (n: number) => doc.line(Math.min(Math.max(n, 1), doc.lines));
  const changes = lost.map((p) =>
    p.replaces === 0 ? { from: line(p.line).from, insert: `${p.text}\n` } : { from: line(p.line).from, to: line(p.line + p.replaces - 1).to, insert: p.text },
  );
  view.dispatch({ changes, userEvent: 'input' });
  view.focus();
}

/**
 * A `fix` of the same file enters the buffer (and is saved with the rest); one of another file goes straight to `dev`
 * with the same logic as the Issues panel button (`applyFixes`: current version, 409 with retry, notice with reason).
 */
function applyFix(view: EditorView, file: string, fix: IssueFix, issue: DevIssue, devUi: DevUiContext): void {
  // A rename (`fix.rename`) is not a text change: it always goes to `dev`.
  if (fix.file === file && fix.rename === undefined && !view.state.readOnly) {
    const doc = view.state.doc;
    const offset = ({ line, column }: { line: number; column: number }): number => doc.line(line).from + column - 1;
    view.dispatch({ changes: { from: offset(fix.range.start), to: offset(fix.range.end), insert: fix.replacement }, userEvent: 'input' });
    return;
  }
  void applyFixes(devUi, issueFix(issue));
}

/** Id under the cursor (with `.` and `-`, like DSL ids). */
function idUnderCursor(state: EditorState): string | undefined {
  const pos = state.selection.main.head;
  const line = state.doc.lineAt(pos);
  const column = pos - line.from;
  for (const m of line.text.matchAll(/[A-Za-z_][\w.-]*/g)) {
    if (m.index <= column && column <= m.index + m[0].length) return m[0];
  }
  return undefined;
}

/** Looks the id up as a Node, View or Interaction (the `file:line` query of `inspect`) and opens that site. */
async function goToDefinition(id: string, client: DevClient, devUi: DevUiContext): Promise<void> {
  for (const command of ['node', 'view', 'interaction'] as const) {
    const r = await client.inspect(command, id);
    if (!r.ok) continue;
    const site = exitSite(r.output);
    if (site !== undefined) {
      devUi.openCode(site);
      return;
    }
  }
  devUi.notify(`No definition for '${id}'`);
}

function extensions(file: string, readOnly: boolean, saver: Saver, devUi: { current: DevUiContext }) {
  const own = keymap.of([
    {
      key: 'F12',
      run: (view) => {
        const id = idUnderCursor(view.state);
        if (id !== undefined) void goToDefinition(id, devUi.current.client, devUi.current);
        return id !== undefined;
      },
    },
    {
      // Last Esc layer: CodeMirror already closed the ephemeral ones (completion, search, multiple selection).
      key: 'Escape',
      run: () => {
        void commandById('salir-del-editor')?.run(devUi.current);
        return true;
      },
    },
  ]);
  return [
    lineNumbers(),
    history(),
    drawSelection(),
    indentOnInput(),
    bracketMatching(),
    closeBrackets(),
    highlightActiveLine(),
    highlightSelectionMatches(),
    dslLanguage(),
    diskMarks(),
    autocompletion({ override: [completeDsl(() => devUi.current.source)] }),
    keymap.of([...closeBracketsKeymap, ...completionKeymap, ...searchKeymap, ...historyKeymap, ...lintKeymap, ...defaultKeymap, indentWithTab]),
    own,
    EditorState.readOnly.of(readOnly),
    EditorView.editable.of(!readOnly),
    EditorView.contentAttributes.of({ 'aria-label': `Code of ${file}${readOnly ? ' (read-only)' : ''}` }),
    EditorView.updateListener.of((u) => {
      if (u.docChanged && !u.transactions.some((t) => t.annotation(fromDisk) === true)) saver.change(u.changes);
    }),
    EditorView.domEventHandlers({
      blur: () => {
        void saver.save();
        return false;
      },
    }),
  ];
}
