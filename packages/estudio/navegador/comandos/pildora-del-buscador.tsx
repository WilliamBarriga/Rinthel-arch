/** Pildora de la barra que abre el Buscador y anuncia Mod+K (aparte del Buscador, que se carga al abrirlo). */
import type { ReactElement } from 'react';

import { useEstudio } from '../marco/contexto';
import { BotonConAtajo } from './atajo';

export function PildoraDelBuscador(): ReactElement {
  const { abrirDialogo } = useEstudio();
  return (
    <BotonConAtajo comando="buscador" className="ui-pildora ui-pildora-buscador" aria-label="Buscar" onClick={() => abrirDialogo('buscador')}>
      Buscar
    </BotonConAtajo>
  );
}
