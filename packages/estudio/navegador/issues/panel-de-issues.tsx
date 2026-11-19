/** Panel Issues: los issues del ultimo estado de `dev` (el filtro y los `fix` llegan con su ticket). */
import type { ReactElement } from 'react';

import { useEstudio } from '../marco/contexto';

export function PanelDeIssues(): ReactElement {
  const issues = useEstudio().estado?.issues ?? [];
  if (issues.length === 0) return <p className="ui-tenue">Sin issues.</p>;
  return (
    <ul aria-label="Issues" className="ui-lista ui-issues">
      {issues.map((issue, i) => (
        <li key={i} data-severidad={issue.severity}>
          <a className="ui-mono ui-sitio" href={issue.href}>{`${issue.file}:${issue.line}`}</a> <span className="ui-mono">{issue.code}</span> {issue.message}
        </li>
      ))}
    </ul>
  );
}
