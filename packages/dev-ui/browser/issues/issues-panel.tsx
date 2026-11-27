/**
 * Issues panel: the issues of the last `dev` state with a filter (text and severity). Each issue jumps to its
 * `file:line` in the editor and, if it carries a `fix`, applies it with a button. "Apply N fixes" gathers the `fix` of
 * the issues visible with the active filter (any severity) into one request. The applying logic (seen version, 409
 * with retry, notices) is `apply-fix.ts` over the writing path, shared with the editor's inline action.
 */
import { useState } from 'react';
import type { ReactElement } from 'react';

import type { DevIssue } from '../../src/protocol';
import { useDevUi } from '../frame/context';
import { siteText } from '../site';
import { applyFixes, issueFix } from './apply-fix';
import type { FixChoice } from './apply-fix';

type Severity = DevIssue['severity'] | 'todas';

interface IssuesFilter {
  text: string;
  severity: Severity;
}

/** The text searches, case-insensitive, in file, code and message. */
function visible(issues: readonly DevIssue[], { text, severity }: IssuesFilter): DevIssue[] {
  const searched = text.trim().toLowerCase();
  return issues.filter((i) => (severity === 'todas' || i.severity === severity) && (searched === '' || `${siteText(i)} ${i.code} ${i.message}`.toLowerCase().includes(searched)));
}

/** The `fix` of the visible issues, recomputed over the relevant state (the seen one or the one reloaded after a 409). */
const visibleFixes =
  (filter: IssuesFilter): FixChoice =>
  (state) => {
    const fixes = visible(state.issues, filter).flatMap((i) => (i.fix === undefined ? [] : [i.fix]));
    return { fixes, description: `Apply ${fixes.length} fix` };
  };

export function IssuesPanel(): ReactElement {
  const devUi = useDevUi();
  const issues = devUi.state?.issues ?? [];
  const [filter, setFilter] = useState<IssuesFilter>({ text: '', severity: 'todas' });
  const [applying, setApplying] = useState(false);
  if (issues.length === 0) return <p className="ui-tenue">No issues.</p>;

  const list = visible(issues, filter);
  const withFix = list.filter((i) => i.fix !== undefined).length;
  const apply = (choice: FixChoice): void => {
    setApplying(true);
    void applyFixes(devUi, choice).finally(() => setApplying(false));
  };

  return (
    <div className="ui-panel-issues">
      <div className="ui-filtro-issues">
        <input type="search" aria-label="Filter issues" placeholder="Filter" value={filter.text} onChange={(e) => setFilter((f) => ({ ...f, text: e.target.value }))} />
        <select aria-label="Severity" value={filter.severity} onChange={(e) => setFilter((f) => ({ ...f, severity: e.target.value as Severity }))}>
          <option value="todas">All</option>
          <option value="error">Errors</option>
          <option value="warning">Warnings</option>
        </select>
        <button type="button" className="ui-boton" disabled={applying || withFix === 0} onClick={() => apply(visibleFixes(filter))}>
          {`Apply ${withFix} fix`}
        </button>
      </div>
      <ul aria-label="Issues" className="ui-lista ui-issues">
        {list.map((issue, i) => {
          const site = siteText(issue);
          return (
            <li key={i} data-severidad={issue.severity}>
              <button type="button" className="ui-enlace ui-mono ui-sitio" onClick={() => devUi.openCode({ file: issue.file, line: issue.line })}>
                {site}
              </button>{' '}
              <span className="ui-mono">{issue.code}</span> {issue.message}
              {issue.fix !== undefined && (
                <button type="button" className="ui-boton" aria-label={`Apply fix for ${site}`} disabled={applying} onClick={() => apply(issueFix(issue))}>
                  Apply fix
                </button>
              )}
            </li>
          );
        })}
      </ul>
    </div>
  );
}
