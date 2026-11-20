/**
 * Indice de Vistas: `listbox` agrupado por Tipo de diagrama; la opcion seleccionada es la Vista activa. Clic o
 * flechas (Inicio, Fin) cambian de Vista; cada cambio es una entrada del historial del navegador.
 */
import { useMemo } from 'react';
import type { KeyboardEvent, ReactElement } from 'react';

import { MarcaExterna, useMarcasExternas } from '../diferencia/resaltado';
import { useEstudio } from '../marco/contexto';
import { indiceDeVistas, ordenDelIndice } from './indice';
import type { EntradaDelIndice } from './indice';

const descripcion = ({ enlaces, entrantes }: EntradaDelIndice): string =>
  [enlaces.length > 0 ? `enlaza a ${enlaces.join(', ')}` : '', entrantes.length > 0 ? `enlazada desde ${entrantes.join(', ')}` : ''].filter((t) => t !== '').join('; ');

const idDeOpcion = (vista: string): string => `ui-vista-${vista}`;

export function PanelDeVistas(): ReactElement {
  const { fuente, vista: activa, irAVista, cliente } = useEstudio();
  const marcas = useMarcasExternas(cliente);
  const grupos = useMemo(() => (fuente === undefined ? [] : indiceDeVistas(fuente)), [fuente]);
  const orden = useMemo(() => ordenDelIndice(grupos), [grupos]);
  if (fuente === undefined) return <p className="ui-tenue">El Workspace aun no compila: no hay Vistas que mostrar.</p>;

  const alTeclear = (e: KeyboardEvent<HTMLDivElement>): void => {
    const i = activa === undefined ? -1 : orden.indexOf(activa);
    const destino = e.key === 'ArrowDown' ? orden[Math.min(orden.length - 1, i + 1)] : e.key === 'ArrowUp' ? orden[Math.max(0, i - 1)] : e.key === 'Home' ? orden[0] : e.key === 'End' ? orden[orden.length - 1] : undefined;
    if (destino === undefined) return;
    e.preventDefault();
    if (destino !== activa) irAVista(destino);
    document.getElementById(idDeOpcion(destino))?.scrollIntoView?.({ block: 'nearest' });
  };

  return (
    <div role="listbox" aria-label="Vistas" tabIndex={0} className="ui-indice" {...(activa !== undefined && { 'aria-activedescendant': idDeOpcion(activa) })} onKeyDown={alTeclear}>
      {grupos.map((grupo) => (
        <div key={grupo.tipo} role="group" aria-label={grupo.tipo} className="ui-indice-grupo">
          <div aria-hidden className="ui-indice-titulo">
            <span>{grupo.tipo}</span>
            <span className="ui-conteo">{grupo.vistas.length}</span>
          </div>
          {grupo.vistas.map((entrada) => {
            const texto = descripcion(entrada);
            const idDescripcion = `${idDeOpcion(entrada.id)}-enlaces`;
            return (
              <div key={entrada.id} id={idDeOpcion(entrada.id)} role="option" aria-label={entrada.id} aria-selected={entrada.id === activa} {...(texto !== '' && { 'aria-describedby': idDescripcion })} className="ui-indice-vista" onClick={() => entrada.id !== activa && irAVista(entrada.id)}>
                <span className="ui-mono">{entrada.id}</span>
                {marcas.vistas.has(entrada.id) && <MarcaExterna />}
                {texto !== '' && (
                  <span id={idDescripcion} className="ui-enlaces">
                    {texto}
                  </span>
                )}
              </div>
            );
          })}
        </div>
      ))}
    </div>
  );
}
