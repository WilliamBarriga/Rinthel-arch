/** Dialogo de atajos (`?` o Mod+/): los comandos del registro con teclas, agrupados por ambito y con las teclas de la plataforma. */
import { Dialog } from '@base-ui/react/dialog';
import type { ReactElement } from 'react';

import { useEstudio } from '../marco/contexto';
import { COMANDOS } from './registro';
import { etiquetasDeTeclas } from './teclas';
import type { Ambito } from './teclas';

const GRUPOS: readonly { ambito: Ambito; nombre: string }[] = [
  { ambito: 'global', nombre: 'Global' },
  { ambito: 'lienzo', nombre: 'Lienzo' },
  { ambito: 'editor', nombre: 'Editor' },
  { ambito: 'texto', nombre: 'Campo de texto' },
];

/** Teclas propias de `VistaInteractiva` con el foco en el lienzo: no son comandos del registro, pero se documentan. */
const TECLAS_DEL_LIENZO: readonly { nombre: string; teclas: string[] }[] = [
  { nombre: 'Recorrer los elementos', teclas: ['Tab', 'Shift+Tab'] },
  { nombre: 'Moverse entre elementos', teclas: ['Flechas'] },
  { nombre: 'Seleccionar o entrar', teclas: ['Enter', 'Espacio'] },
];

export function Ayuda({ abierto, alCambiar }: { abierto: boolean; alCambiar: (abierto: boolean) => void }): ReactElement {
  const { plataforma, portales } = useEstudio();
  const grupos = GRUPOS.map(({ ambito, nombre }) => ({
    nombre,
    filas: [
      ...COMANDOS.filter((c) => c.ambito === ambito)
        .map((c) => ({ nombre: c.nombre, teclas: etiquetasDeTeclas(c, plataforma) }))
        .filter((f) => f.teclas.length > 0),
      ...(ambito === 'lienzo' ? TECLAS_DEL_LIENZO : []),
    ],
  })).filter((g) => g.filas.length > 0);
  return (
    <Dialog.Root open={abierto} onOpenChange={alCambiar}>
      <Dialog.Portal container={portales}>
        <Dialog.Backdrop className="ui-fondo-dialogo" />
        <Dialog.Popup className="ui-dialogo ui-ayuda">
          <Dialog.Title className="ui-dialogo-titulo">Atajos de teclado</Dialog.Title>
          {grupos.map((g) => (
            <section key={g.nombre} aria-label={g.nombre}>
              <h3 className="ui-subtitulo">{g.nombre}</h3>
              <dl className="ui-atajos">
                {g.filas.map((f) => (
                  <div key={f.nombre} className="ui-atajo">
                    <dt>{f.nombre}</dt>
                    <dd>
                      {f.teclas.map((t) => (
                        <kbd key={t} className="ui-tecla">
                          {t}
                        </kbd>
                      ))}
                    </dd>
                  </div>
                ))}
              </dl>
            </section>
          ))}
          <Dialog.Close className="ui-boton">Cerrar</Dialog.Close>
        </Dialog.Popup>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
