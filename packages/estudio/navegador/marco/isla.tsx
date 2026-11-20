/** Isla lateral de vidrio: pestanas del registro, boton de ocultar, asas de redimensionado y pestana de borde al ocultarse. */
import { Tabs } from '@base-ui/react/tabs';
import type { ReactElement } from 'react';

import { BotonConAtajo } from '../comandos/atajo';
import type { Isla } from './use-isla';
import type { PestanaDelPanel } from './pestanas';
import type { LadoDeIsla } from './limites';

export interface PropsDeIsla {
  lado: LadoDeIsla;
  id: string;
  /** "panel izquierdo" / "panel derecho": nombre accesible de la lista de pestanas y de los botones. */
  nombre: string;
  isla: Isla;
  pestanas: readonly PestanaDelPanel[];
  activa: string;
  alCambiarPestana(pestana: string): void;
}

const mayuscula = (texto: string): string => texto.charAt(0).toUpperCase() + texto.slice(1);

export function IslaLateral({ lado, id, nombre, isla, pestanas, activa, alCambiarPestana }: PropsDeIsla): ReactElement {
  if (isla.oculta) {
    return (
      <BotonConAtajo comando={`isla-${lado}`} className="ui-pestana-borde" data-lado={lado} aria-label={`Mostrar ${nombre}`} aria-controls={id} aria-expanded={false} onClick={isla.mostrar}>
        {pestanas.find((p) => p.id === activa)?.nombre ?? mayuscula(nombre)}
      </BotonConAtajo>
    );
  }
  const { ancho, alto } = isla.tamano;
  return (
    <aside id={id} ref={isla.ref} className="ui-isla" data-lado={lado} data-alto={alto === null ? 'contenido' : 'fijo'} aria-label={mayuscula(nombre)} style={{ width: ancho, ...(alto !== null && { height: alto }) }}>
      <Tabs.Root className="ui-isla-pestanas" value={activa} onValueChange={(valor) => alCambiarPestana(String(valor))}>
        <div className="ui-isla-cabecera">
          <Tabs.List className="ui-pestanas" aria-label={mayuscula(nombre)}>
            {pestanas.map((p) => (
              <Tabs.Tab key={p.id} value={p.id} className="ui-pestana">
                {p.nombre}
              </Tabs.Tab>
            ))}
            <Tabs.Indicator className="ui-pestanas-indicador" />
          </Tabs.List>
          <BotonConAtajo comando={`isla-${lado}`} className="ui-boton-icono" aria-label={`Ocultar ${nombre}`} aria-controls={id} aria-expanded onClick={isla.ocultar}>
            {lado === 'izquierda' ? '‹' : '›'}
          </BotonConAtajo>
        </div>
        {pestanas.map(({ id: pestana, Contenido }) => (
          <Tabs.Panel key={pestana} value={pestana} className="ui-isla-cuerpo">
            <Contenido />
          </Tabs.Panel>
        ))}
      </Tabs.Root>
      <div className="ui-asa ui-asa-h" {...isla.asa('horizontal')} />
      <div className="ui-asa ui-asa-v" {...isla.asa('vertical')} />
      <div className="ui-asa ui-asa-d" {...isla.asa('diagonal')} />
    </aside>
  );
}
