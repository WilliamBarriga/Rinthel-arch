/**
 * Boton con el atajo de un comando del registro: lo declara en `aria-keyshortcuts` y lo muestra en un tooltip de
 * Base UI (portal en el nodo `portales` del marco). Sin teclas en la plataforma, el tooltip muestra solo el nombre.
 */
import { Tooltip } from '@base-ui/react/tooltip';
import type { ComponentProps, ReactElement } from 'react';

import { useEstudio } from '../marco/contexto';
import { comandoPorId } from './registro';
import { atajoAria, etiquetasDeTeclas } from './teclas';

export interface PropsDeBotonConAtajo extends Omit<ComponentProps<'button'>, 'ref'> {
  /** Id del comando del registro cuyo atajo se anuncia. */
  comando: string;
  /** Texto del tooltip; por defecto, el `aria-label`. */
  texto?: string;
}

export function BotonConAtajo({ comando, texto, ...props }: PropsDeBotonConAtajo): ReactElement {
  const { plataforma, portales } = useEstudio();
  const declarado = comandoPorId(comando);
  const aria = declarado === undefined ? '' : atajoAria(declarado, plataforma);
  const teclas = declarado === undefined ? [] : etiquetasDeTeclas(declarado, plataforma);
  const titulo = texto ?? props['aria-label'] ?? declarado?.nombre ?? '';
  return (
    <Tooltip.Root>
      <Tooltip.Trigger type="button" {...props} {...(aria !== '' && { 'aria-keyshortcuts': aria })} />
      <Tooltip.Portal container={portales}>
        <Tooltip.Positioner sideOffset={6}>
          <Tooltip.Popup className="ui-tooltip">
            {titulo}
            {teclas.map((t) => (
              <kbd key={t} className="ui-tecla">
                {t}
              </kbd>
            ))}
          </Tooltip.Popup>
        </Tooltip.Positioner>
      </Tooltip.Portal>
    </Tooltip.Root>
  );
}
