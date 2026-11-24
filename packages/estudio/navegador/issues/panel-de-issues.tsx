/**
 * Panel Issues: los issues del ultimo estado de `dev` con filtro (texto y severidad). Cada issue salta a su
 * `archivo:linea` en el editor y, si trae `fix`, lo aplica con un boton. "Aplicar N fix" junta los `fix` de los
 * issues visibles con el filtro activo (cualquier severidad) en una peticion. La logica de aplicar (version vista,
 * 409 con reintento, avisos) es `aplicar-fix.ts` sobre la Escritura, compartida con la accion en linea del editor.
 */
import { useState } from 'react';
import type { ReactElement } from 'react';

import type { IssueDeDev } from '../../src/protocolo';
import { useEstudio } from '../marco/contexto';
import { textoDeSitio } from '../sitio';
import { aplicarFixes, fixDelIssue } from './aplicar-fix';
import type { EleccionDeFix } from './aplicar-fix';

type Severidad = IssueDeDev['severity'] | 'todas';

interface FiltroDeIssues {
  texto: string;
  severidad: Severidad;
}

/** El texto busca, sin distinguir mayusculas, en archivo, codigo y mensaje. */
function visibles(issues: readonly IssueDeDev[], { texto, severidad }: FiltroDeIssues): IssueDeDev[] {
  const buscado = texto.trim().toLowerCase();
  return issues.filter((i) => (severidad === 'todas' || i.severity === severidad) && (buscado === '' || `${textoDeSitio(i)} ${i.code} ${i.message}`.toLowerCase().includes(buscado)));
}

/** Los `fix` de los issues visibles, recalculados sobre el estado que toque (el visto o el recargado tras un 409). */
const fixesVisibles =
  (filtro: FiltroDeIssues): EleccionDeFix =>
  (estado) => {
    const fixes = visibles(estado.issues, filtro).flatMap((i) => (i.fix === undefined ? [] : [i.fix]));
    return { fixes, descripcion: `Apply ${fixes.length} fix` };
  };

export function PanelDeIssues(): ReactElement {
  const estudio = useEstudio();
  const issues = estudio.estado?.issues ?? [];
  const [filtro, setFiltro] = useState<FiltroDeIssues>({ texto: '', severidad: 'todas' });
  const [aplicando, setAplicando] = useState(false);
  if (issues.length === 0) return <p className="ui-tenue">No issues.</p>;

  const lista = visibles(issues, filtro);
  const conFix = lista.filter((i) => i.fix !== undefined).length;
  const aplicar = (eleccion: EleccionDeFix): void => {
    setAplicando(true);
    void aplicarFixes(estudio, eleccion).finally(() => setAplicando(false));
  };

  return (
    <div className="ui-panel-issues">
      <div className="ui-filtro-issues">
        <input type="search" aria-label="Filter issues" placeholder="Filter" value={filtro.texto} onChange={(e) => setFiltro((f) => ({ ...f, texto: e.target.value }))} />
        <select aria-label="Severity" value={filtro.severidad} onChange={(e) => setFiltro((f) => ({ ...f, severidad: e.target.value as Severidad }))}>
          <option value="todas">All</option>
          <option value="error">Errors</option>
          <option value="warning">Warnings</option>
        </select>
        <button type="button" className="ui-boton" disabled={aplicando || conFix === 0} onClick={() => aplicar(fixesVisibles(filtro))}>
          {`Apply ${conFix} fix`}
        </button>
      </div>
      <ul aria-label="Issues" className="ui-lista ui-issues">
        {lista.map((issue, i) => {
          const sitio = textoDeSitio(issue);
          return (
            <li key={i} data-severidad={issue.severity}>
              <button type="button" className="ui-enlace ui-mono ui-sitio" onClick={() => estudio.abrirCodigo({ file: issue.file, line: issue.line })}>
                {sitio}
              </button>{' '}
              <span className="ui-mono">{issue.code}</span> {issue.message}
              {issue.fix !== undefined && (
                <button type="button" className="ui-boton" aria-label={`Apply fix for ${sitio}`} disabled={aplicando} onClick={() => aplicar(fixDelIssue(issue))}>
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
