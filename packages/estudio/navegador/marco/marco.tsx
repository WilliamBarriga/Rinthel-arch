/**
 * Marco F: el lienzo a pantalla completa y encima la barra de pildoras, las islas laterales con las pestanas del
 * registro (`pestanas.tsx`), la leyenda, los toasts y los dialogos. Se dibuja dentro de `ProveedoresDelEstudio`.
 */
import { lazy, Suspense } from 'react';
import type { ReactElement, ReactNode } from 'react';

import { Migas } from 'shell';
import type { Navegacion } from 'shell';

import { PildoraDelBuscador } from '../comandos/pildora-del-buscador';
import { useGestoEnLienzo } from '../lienzo/gesto';
import { useEstudio } from './contexto';
import { IslaLateral } from './isla';
import { PESTANAS_DERECHAS, PESTANAS_IZQUIERDAS, PILDORAS_DE_LA_BARRA } from './pestanas';
import { useChrome } from './proveedores';

const Buscador = lazy(() => import('../comandos/buscador').then((m) => ({ default: m.Buscador })));
const Ayuda = lazy(() => import('../comandos/ayuda').then((m) => ({ default: m.Ayuda })));

interface PropsDelMarco {
  /** Migas sobre la ruta del hash; `undefined` sin Fuente. */
  navegacion: Navegacion | undefined;
  lienzo: ReactNode;
  leyenda?: ReactNode;
}

export function Marco({ navegacion, lienzo, leyenda }: PropsDelMarco): ReactElement {
  const { motivoSinGestos } = useEstudio();
  const { islas, pestanas, elegirPestana, dialogo, cargados, cerrarDialogo, aviso, alMontarPortales } = useChrome();
  const gesto = useGestoEnLienzo();
  const solido = islas.izquierda.arrastrando || islas.derecha.arrastrando || gesto.enGesto;

  return (
    <div className="ui-chrome" data-arrastrando={solido ? '' : undefined}>
      <main className="ui-lienzo" aria-label="Canvas" {...gesto.props}>
        {lienzo}
      </main>
      <header className="ui-barra">
        <span className="ui-pildora ui-marca">rinthel-arch</span>
        {navegacion !== undefined && (
          <div className="ui-pildora ui-migas">
            <Migas navegacion={navegacion} />
          </div>
        )}
        <PildoraDelBuscador />
        {motivoSinGestos !== undefined && (
          <div role="status" aria-label="Gestures" className="ui-pildora ui-aviso-gestos">
            {motivoSinGestos}
          </div>
        )}
        {PILDORAS_DE_LA_BARRA.map(({ id, Contenido }) => (
          <div key={id} className="ui-pildora">
            <Contenido />
          </div>
        ))}
      </header>
      <IslaLateral lado="izquierda" id="ui-isla-izquierda" nombre="left panel" isla={islas.izquierda} pestanas={PESTANAS_IZQUIERDAS} activa={pestanas.izquierda} alCambiarPestana={(p) => elegirPestana('izquierda', p)} />
      <IslaLateral lado="derecha" id="ui-isla-derecha" nombre="right panel" isla={islas.derecha} pestanas={PESTANAS_DERECHAS} activa={pestanas.derecha} alCambiarPestana={(p) => elegirPestana('derecha', p)} />
      {leyenda}
      {aviso !== undefined && (
        <div className="ui-toasts">
          <div role="alert" className="ui-toast">
            {aviso}
          </div>
        </div>
      )}
      {/* Los dialogos (Base UI Dialog y Autocomplete) son trozos que se cargan al abrirlos. */}
      <Suspense fallback={null}>
        {cargados.has('buscador') && <Buscador abierto={dialogo === 'buscador'} alCambiar={cerrarDialogo} />}
        {cargados.has('ayuda') && <Ayuda abierto={dialogo === 'ayuda'} alCambiar={cerrarDialogo} />}
      </Suspense>
      <div className="ui-portales" ref={alMontarPortales} />
    </div>
  );
}
