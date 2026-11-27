/** Issues and toasts inside the canvas, with `rd-*` classes and the chrome CSS variables (no inline styles). */
import { useState } from 'react';
import type { ReactElement } from 'react';

import type { Issue } from 'canonical';

/** Issue the viewer shows: with `href`, its `file:line` links to the editor (in `dev`, `vscode://file/...`). */
export type ViewerIssue = Issue & { href?: string };

export const NOTICES_CSS = `
.rd-issues { left: 0; right: 0; bottom: 0; max-height: 35%; overflow: auto; margin: 0; padding: 4px 16px; display: block; background: var(--rd-fondo); border-top: 1px solid var(--rd-borde); }
.rd-issues-conteo { font: inherit; color: inherit; background: none; border: 0; padding: 4px 0; cursor: pointer; }
.rd-issues ul { margin: 0; padding: 4px 0; list-style: none; }
.rd-issues a { color: inherit; }
.rd-issue-error { color: var(--rd-error); }
.rd-toasts { left: 50%; top: 12px; transform: translateX(-50%); flex-direction: column; gap: 6px; }
.rd-toast { padding: 8px 16px; border-radius: 6px; background: var(--rd-fondo); border: 1px solid var(--rd-borde); }
`;

const plural = (n: number, singular: string): string => `${n} ${singular}${n === 1 ? '' : 's'}`;

/** Bar folded by default with the count of errors and warnings; unfolding it lists all the issues. */
export function IssuesPanel({ issues }: { issues: readonly ViewerIssue[] }): ReactElement | null {
  const [open, setOpen] = useState(false);
  if (issues.length === 0) return null;
  const errors = issues.filter((i) => i.severity === 'error').length;
  return (
    <div data-panel="issues" className="rd-chrome rd-issues">
      <button type="button" className="rd-issues-conteo" aria-expanded={open} onClick={() => setOpen(!open)}>
        {open ? '\u25BE' : '\u25B8'} {plural(errors, 'error')}, {plural(issues.length - errors, 'warning')}
      </button>
      {open && (
        <ul>
          {issues.map((issue, i) => (
            <li key={i} className={issue.severity === 'error' ? 'rd-issue-error' : undefined}>
              <a href={issue.href}>
                {issue.file}:{issue.line}
              </a>{' '}
              {issue.code} {issue.message}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

export function Toasts({ toasts }: { toasts: readonly string[] }): ReactElement | null {
  if (toasts.length === 0) return null;
  return (
    <div className="rd-chrome rd-toasts">
      {toasts.map((text, i) => (
        <div key={i} role="alert" className="rd-toast">
          {text}
        </div>
      ))}
    </div>
  );
}
