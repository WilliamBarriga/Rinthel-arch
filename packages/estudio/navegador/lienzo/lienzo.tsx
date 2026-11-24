/**
 * Lienzo del estudio: `VistaInteractiva` (`chrome={false}`) sobre la Fuente dibujada (con el Tema previsualizado, si
 * lo hay), el halo de los cambios externos y la leyenda. Corre dentro de los proveedores: un clic en un Nodo abre el
 * Detalle, el doble clic abre Codigo en su bloque y los Gestos escriben con la Escritura del estudio.
 */
import { useMemo } from 'react';
import type { ReactElement, ReactNode } from 'react';

import { resolveView, urlDeFuente } from 'canonico';
import type { FuenteCanonica } from 'canonico';
import type { ComponentesDeTema } from 'render';
import { Leyenda, VistaInteractiva } from 'shell';
import type { AdaptadorDeLayout, PropsDeEstadoEnHash } from 'shell';

import { abrirCodigoEnBloque } from '../comandos/registro';
import { ResaltadoDelLienzo, useDiferenciasExternas } from '../diferencia/resaltado';
import type { PedidoDeEscritura } from '../escritura/escritura';
import { useEstudio } from '../marco/contexto';
import { useFuentePrevisualizada, usePrevisualizacionDeTema } from '../temas/previsualizacion';
import { usePropsDeDatos } from './datos-de-vista';
import type { Dibujable } from './geometrias';

export interface OpcionesDelLienzo {
  dibujable: Dibujable;
  hashProps: PropsDeEstadoEnHash;
  layout: AdaptadorDeLayout;
  componentes: ComponentesDeTema | undefined;
}

/** Devuelve el lienzo (con su halo) y la leyenda de la Vista activa; sin Tema, ninguno de los dos. */
export function useLienzoDelEstudio({ dibujable, hashProps: props, layout, componentes }: OpcionesDelLienzo): { lienzo: ReactNode; leyenda: ReactNode } {
  const estudio = useEstudio();
  const { cliente, avisar, motivoSinGestos } = estudio;
  const { temaPrevio } = usePrevisualizacionDeTema();
  const { estado } = dibujable;
  const fuente = estado.fuente;
  const dibujada = useFuentePrevisualizada(cliente, estado.version, { fuente, geometrias: dibujable.geometrias }, props.view, temaPrevio);
  const datos = usePropsDeDatos({ fuente: dibujada.fuente, iconos: estado.iconos, geometrias: dibujada.geometrias }, props.view);
  const resaltados = useDiferenciasExternas({ cliente, fuente, version: estado.version, vista: props.view, estado: props.state, paso: props.step, avisar });
  const tema = datos.theme;
  const halo = <ResaltadoDelLienzo ids={resaltados} />;
  if (tema === undefined) return { lienzo: halo, leyenda: null };

  /** El manejador resuelve `false` si se rechazo (el Nodo vuelve a su sitio). */
  const escribirDesdeElLienzo = async (pedido: PedidoDeEscritura): Promise<boolean> => (await estudio.escribir(pedido)).ok;
  const lienzo = (
    <>
      <VistaInteractiva
        {...props}
        onSelect={(id) => {
          props.onSelect(id);
          estudio.abrirPestana('derecha', 'detalle');
        }}
        onOpen={(elemento) => {
          if (elemento.tipo === 'nodo') void abrirCodigoEnBloque(estudio, 'node', elemento.id);
        }}
        source={dibujada.fuente}
        theme={tema}
        layout={layout}
        {...(estado.fuentes !== undefined && { fontFiles: estado.fuentes, fontUrl: urlDeFuente })}
        icons={datos.icons}
        {...(componentes !== undefined && { componentes })}
        width={datos.width}
        height={datos.height}
        cachedGeometries={datos.cachedGeometries}
        {...(motivoSinGestos === undefined && {
          onMoveNode: ({ id, x, y }) => escribirDesdeElLienzo({ intencion: { tipo: 'move-pin', vista: props.view, nodo: id, x, y }, fallo: 'Could not move the Pin' }),
          onReorderLifelines: ({ orden }) => escribirDesdeElLienzo({ intencion: { tipo: 'reorder-lifelines', vista: props.view, orden }, fallo: 'Could not reorder the Lifelines' }),
        })}
        chrome={false}
      />
      {halo}
    </>
  );
  return { lienzo, leyenda: <LeyendaDeVista fuente={fuente} props={props} tema={tema} /> };
}

function LeyendaDeVista({ fuente, props, tema }: { fuente: FuenteCanonica; props: PropsDeEstadoEnHash; tema: Parameters<typeof Leyenda>[0]['tema'] }): ReactElement | null {
  const vista = useMemo(() => resolveView(fuente, props.view, props.state), [fuente, props.view, props.state]);
  if (vista === undefined) return null;
  return (
    <div className="ui-leyenda">
      <Leyenda fuente={fuente} vista={vista} tema={tema} modo="auto" />
    </div>
  );
}
