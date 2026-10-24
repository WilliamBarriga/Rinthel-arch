/**
 * Issues y toasts dentro del lienzo: dibujados con clases `rd-*` y las variables CSS del chrome, asi
 * que siguen al Tema (sin estilos en linea ni colores propios).
 */
import { useState } from 'react';
import type { ReactElement } from 'react';

import type { IssueDeDev } from 'canonico';

export const CSS_DE_AVISOS = `
.rd-issues { left: 0; right: 0; bottom: 0; max-height: 35%; overflow: auto; margin: 0; padding: 4px 16px; display: block; background: var(--rd-fondo); border-top: 1px solid var(--rd-borde); }
.rd-issues-conteo { font: inherit; color: inherit; background: none; border: 0; padding: 4px 0; cursor: pointer; }
.rd-issues ul { margin: 0; padding: 4px 0; list-style: none; }
.rd-issues a { color: inherit; }
.rd-issue-error { color: var(--rd-error); }
.rd-toasts { left: 50%; top: 12px; transform: translateX(-50%); flex-direction: column; gap: 6px; }
.rd-toast { padding: 8px 16px; border-radius: 6px; background: var(--rd-fondo); border: 1px solid var(--rd-borde); }
`;

const plural = (n: number, singular: string): string => `${n} ${singular}${n === 1 ? '' : 's'}`;

/** Barra plegada por defecto con el conteo de errores y warnings; al desplegarla lista todos los issues. */
export function PanelDeIssues({ issues }: { issues: readonly IssueDeDev[] }): ReactElement | null {
  const [abierto, setAbierto] = useState(false);
  if (issues.length === 0) return null;
  const errores = issues.filter((i) => i.severity === 'error').length;
  return (
    <div data-panel="issues" className="rd-chrome rd-issues">
      <button type="button" className="rd-issues-conteo" aria-expanded={abierto} onClick={() => setAbierto(!abierto)}>
        {abierto ? '\u25BE' : '\u25B8'} {plural(errores, 'error')}, {plural(issues.length - errores, 'warning')}
      </button>
      {abierto && (
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
      {toasts.map((texto, i) => (
        <div key={i} role="alert" className="rd-toast">
          {texto}
        </div>
      ))}
    </div>
  );
}
