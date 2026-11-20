/**
 * `<Estudio>`: la app de `dev`. Solo ensambla: el cliente (con `fetch` y `eventos` inyectados; en pruebas, los de
 * `devEnMemoria`), el estado por SSE, las Geometrias y los Componentes de Tema, y encima los proveedores del estudio
 * (`marco/proveedores.tsx`), que envuelven al marco y al lienzo. La Vista vive en el hash (`#vista=<id>`). Sin Fuente
 * (el Workspace nunca compilo) el lienzo queda vacio y los paneles lo dicen.
 */
import { useEffect, useMemo, useSyncExternalStore } from 'react';
import type { ReactElement } from 'react';

import type { ComponentesDeTema } from 'render';
import { deserializarEstado, useEstadoEnHash } from 'shell';
import type { AdaptadorDeHash, AdaptadorDeLayout, Navegacion, PropsDeEstadoEnHash } from 'shell';

import { crearClienteDeDev } from './cliente';
import type { DependenciasDelCliente } from './cliente';
import { plataformaDe } from './comandos/teclas';
import type { Plataforma } from './comandos/teclas';
import { crearGeometriasDeDev } from './geometrias';
import type { Dibujable, GeometriasDeDev } from './geometrias';
import { hashDeEstudio } from './hash-de-estudio';
import { historialDelCliente } from './historial/historial-visible';
import { useLienzoDelEstudio } from './lienzo/lienzo';
import { Marco } from './marco/marco';
import { ProveedoresDelEstudio } from './marco/proveedores';
import type { BaseDelEstudio, ChromeDelMarco } from './marco/proveedores';
import { useEstadoDeDev } from './marco/use-estado-de-dev';
import { useComponentes } from './use-componentes';

export interface PropsDelEstudio {
  fetch: typeof fetch;
  /** Fabrica de la conexion SSE (`EventSource` en el navegador, `devEnMemoria` en pruebas). */
  eventos: DependenciasDelCliente['eventos'];
  /** Hash del navegador tal cual (`hashDelNavegador(window)`); el estudio lo traduce a `#vista=<id>`. */
  hash: AdaptadorDeHash;
  /** Layout cuando la Geometria del servidor no llega (el Worker en el navegador). */
  layout: AdaptadorDeLayout;
  /** Confirmacion antes de cargar Componentes de Tema con codigo. */
  confirmar: (mensaje: string) => boolean;
  /** Como se escriben las teclas (`Cmd` o `Ctrl`); por defecto, la de `navigator`. */
  plataforma?: Plataforma;
}

export function Estudio(props: PropsDelEstudio): ReactElement {
  const { fetch: fetchFn, eventos, layout, confirmar } = props;
  const hash = useMemo(() => hashDeEstudio(props.hash), [props.hash]);
  const cliente = useMemo(() => crearClienteDeDev({ fetch: fetchFn, eventos }), [fetchFn, eventos]);
  // El panel Historial puede montarse despues de conectar: el almacen escucha desde el principio.
  useEffect(() => void historialDelCliente(cliente), [cliente]);
  const geometrias = useMemo(
    () =>
      crearGeometriasDeDev({
        pedir: (vista) => cliente.geometria(vista),
        vistaInicial: (fuente) => {
          const { path } = deserializarEstado(hash.leer(), fuente);
          return path[path.length - 1];
        },
      }),
    [cliente, hash],
  );
  const { estado, vigente, recibir } = useEstadoDeDev(cliente, geometrias);
  const dibujable = useSyncExternalStore(geometrias.suscribir, geometrias.dibujable);
  const componentes = useComponentes(cliente, estado?.version, fetchFn, confirmar);
  const plataforma = props.plataforma ?? plataformaDe(typeof navigator === 'undefined' ? undefined : navigator);
  const base: BaseDelEstudio = { estado, vigente, recibir, cliente, plataforma };

  if (dibujable === undefined) return <ProveedoresDelEstudio {...base}>{(chrome) => <Marco chrome={chrome} navegacion={undefined} lienzo={null} />}</ProveedoresDelEstudio>;
  return <ConFuente base={base} dibujable={dibujable} hash={hash} geometrias={geometrias} layout={layout} componentes={componentes} />;
}

interface PropsConFuente {
  base: BaseDelEstudio;
  dibujable: Dibujable;
  hash: AdaptadorDeHash;
  geometrias: GeometriasDeDev;
  layout: AdaptadorDeLayout;
  componentes: ComponentesDeTema | undefined;
}

/** La Vista activa, la Seleccion y la ruta viven en el hash; los proveedores las dan al lienzo y a los paneles. */
function ConFuente({ base, dibujable, hash, geometrias, layout, componentes }: PropsConFuente): ReactElement {
  const fuente = dibujable.estado.fuente;
  const hashProps = useEstadoEnHash({ source: fuente, hash, defaultView: dibujable.estado.vistas[0] ?? '', camera: true });
  useEffect(() => geometrias.activar(hashProps.view), [geometrias, hashProps.view]);
  return (
    <ProveedoresDelEstudio {...base} fuente={fuente} hashProps={hashProps}>
      {(chrome) => <MarcoConLienzo chrome={chrome} dibujable={dibujable} hashProps={hashProps} layout={layout} componentes={componentes} />}
    </ProveedoresDelEstudio>
  );
}

function MarcoConLienzo({ chrome, ...opciones }: { chrome: ChromeDelMarco } & Parameters<typeof useLienzoDelEstudio>[0]): ReactElement {
  const { lienzo, leyenda } = useLienzoDelEstudio(opciones);
  return <Marco chrome={chrome} navegacion={navegacionDesde(opciones.hashProps)} lienzo={lienzo} leyenda={leyenda} />;
}

/** Migas montadas fuera del lienzo sobre la ruta controlada por el hash. */
function navegacionDesde(props: PropsDeEstadoEnHash): Navegacion {
  const ruta = props.path.length > 0 ? props.path : [props.view];
  return {
    vista: props.view,
    ruta,
    ir: (destino) => props.onPathChange([...ruta, destino]),
    atras: () => {
      if (ruta.length > 1) props.onPathChange(ruta.slice(0, -1));
    },
    irA: (indice) => {
      if (indice >= 0 && indice < ruta.length - 1) props.onPathChange(ruta.slice(0, indice + 1));
    },
  };
}
