/**
 * Indice de Vistas: `listbox` (`marco/use-listbox.ts`) agrupado por Tipo de diagrama; la opcion seleccionada es la
 * Vista activa. Clic o flechas (Inicio, Fin) cambian de Vista; cada cambio es una entrada del historial del navegador.
 */
import { useMemo } from 'react';
import type { ReactElement } from 'react';

import { MarcaExterna, useMarcasExternas } from '../diferencia/resaltado';
import { useEstudio } from '../marco/contexto';
import { useListbox } from '../marco/use-listbox';
import { indiceDeVistas, ordenDelIndice } from './indice';
import type { EntradaDelIndice } from './indice';

const descripcion = ({ enlaces, entrantes }: EntradaDelIndice): string =>
  [enlaces.length > 0 ? `enlaza a ${enlaces.join(', ')}` : '', entrantes.length > 0 ? `enlazada desde ${entrantes.join(', ')}` : ''].filter((t) => t !== '').join('; ');

export function PanelDeVistas(): ReactElement {
  const { fuente, vista: activa, irAVista, cliente } = useEstudio();
  const marcas = useMarcasExternas(cliente);
  const grupos = useMemo(() => (fuente === undefined ? [] : indiceDeVistas(fuente)), [fuente]);
  const orden = useMemo(() => ordenDelIndice(grupos), [grupos]);
  const lista = useListbox({ nombre: 'Vistas', prefijo: 'ui-vista', orden, elegida: activa, elegir: (vista) => {
      if (vista !== activa) irAVista(vista);
    },
    eligeAlMover: true });
  if (fuente === undefined) return <p className="ui-tenue">El Workspace aun no compila: no hay Vistas que mostrar.</p>;

  return (
    <div {...lista.listbox} className="ui-indice">
      {grupos.map((grupo) => (
        <div key={grupo.tipo} role="group" aria-label={grupo.tipo} className="ui-indice-grupo">
          <div aria-hidden className="ui-indice-titulo">
            <span>{grupo.tipo}</span>
            <span className="ui-conteo">{grupo.vistas.length}</span>
          </div>
          {grupo.vistas.map((entrada) => {
            const texto = descripcion(entrada);
            const opcion = lista.opcion(entrada.id);
            const idDescripcion = `${opcion.id}-enlaces`;
            return (
              <div key={entrada.id} {...opcion} {...(texto !== '' && { 'aria-describedby': idDescripcion })} className="ui-indice-vista">
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
