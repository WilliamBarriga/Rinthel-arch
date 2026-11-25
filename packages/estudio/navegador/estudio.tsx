/**
 * `<Estudio>`: la app de `dev`. Solo ensambla: el cliente (con `fetch` y `eventos` inyectados; en pruebas, los de
 * `devEnMemoria`), el estado por SSE, las Geometrias y los Componentes de Tema, y encima los proveedores del estudio
 * (`marco/proveedores.tsx`), que envuelven al marco y al lienzo. La Vista vive en el hash (`#view=<id>`). Sin Fuente
 * (el Workspace nunca compilo) el lienzo queda vacio y los paneles lo dicen.
 */
import { useCallback, useEffect, useMemo, useState, useSyncExternalStore } from 'react';
import type { ReactElement } from 'react';

import { urlDeFuente as urlDeFuenteDeDev } from 'canonico';
import { deserializarEstado, useEstadoEnHash } from 'shell';
import type { AdaptadorDeHash, AdaptadorDeLayout, Navegacion, PropsDeEstadoEnHash } from 'shell';

import { crearClienteDeDev } from './cliente';
import type { ClienteDeDev, DependenciasDelCliente } from './cliente';
import { plataformaDe } from './comandos/teclas';
import type { Plataforma } from './comandos/teclas';
import { historialDelCliente } from './historial/historial-visible';
import { crearGeometriasDeDev } from './lienzo/geometrias';
import type { Dibujable, GeometriasDeDev } from './lienzo/geometrias';
import { hashDeEstudio } from './lienzo/hash-de-estudio';
import { useLienzoDelEstudio } from './lienzo/lienzo';
import { Marco } from './marco/marco';
import type { ModoDelEstudio } from './marco/modo';
import { ProveedoresDelEstudio } from './marco/proveedores';
import { useEstadoDeDev } from './marco/use-estado-de-dev';
import { useComponentes } from './temas/use-componentes';

/** The `dev` transport (`fetch` and SSE), or an already built client (the read-only one of an export). */
type TransporteDelEstudio =
  | {
      fetch: typeof fetch;
      /** Fabrica de la conexion SSE (`EventSource` en el navegador, `devEnMemoria` en pruebas). */
      eventos: DependenciasDelCliente['eventos'];
      cliente?: undefined;
    }
  | { cliente: ClienteDeDev; fetch?: undefined; eventos?: undefined };

export type PropsDelEstudio = TransporteDelEstudio & PropsComunes;

interface PropsComunes {
  /** Hash del navegador tal cual (`hashDelNavegador(window)`); el estudio lo traduce a `#view=<id>`. */
  hash: AdaptadorDeHash;
  /** Layout cuando la Geometria del servidor no llega (el Worker en el navegador). */
  layout: AdaptadorDeLayout;
  /** Confirmacion antes de cargar Componentes de Tema con codigo. */
  confirmar: (mensaje: string) => boolean;
  /** Como se escriben las teclas (`Cmd` o `Ctrl`); por defecto, la de `navigator`. */
  plataforma?: Plataforma;
  /** `export`: read-only (`marco/modo.ts`). Por defecto `dev`. */
  modo?: ModoDelEstudio;
  /** URL de un archivo de fuente de `estado.fuentes`; por defecto la ruta `/fuentes/` de `dev`. */
  urlDeFuente?: (ruta: string) => string;
}

export function Estudio(props: PropsDelEstudio): ReactElement {
  const { fetch: fetchFn, eventos, layout, confirmar, modo = 'dev', urlDeFuente = urlDeFuenteDeDev } = props;
  const hash = useMemo(() => hashDeEstudio(props.hash), [props.hash]);
  const propio = props.cliente;
  const cliente = useMemo(() => propio ?? crearClienteDeDev({ fetch: fetchFn as typeof fetch, eventos: eventos as DependenciasDelCliente['eventos'] }), [propio, fetchFn, eventos]);
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
  // Lo que falla fuera de los proveedores (estado malformado, carga de Componentes) se avisa dentro de ellos.
  const [fallo, setFallo] = useState<{ mensaje: string }>();
  const reportar = useCallback((mensaje: string) => setFallo({ mensaje }), []);
  const { estado, vigente, recibir } = useEstadoDeDev(cliente, geometrias, reportar);
  const dibujable = useSyncExternalStore(geometrias.suscribir, geometrias.dibujable);
  const componentes = useComponentes(cliente, estado?.version, confirmar, reportar);
  const plataforma = props.plataforma ?? plataformaDe(typeof navigator === 'undefined' ? undefined : navigator);
  const base = { estado, vigente, recibir, cliente, plataforma, fallo, modo };

  if (dibujable === undefined)
    return (
      <ProveedoresDelEstudio {...base}>
        <Marco navegacion={undefined} lienzo={null} />
      </ProveedoresDelEstudio>
    );
  return (
    <VistaEnHash dibujable={dibujable} hash={hash} geometrias={geometrias}>
      {(hashProps) => (
        <ProveedoresDelEstudio {...base} fuente={dibujable.estado.fuente} hashProps={hashProps}>
          <MarcoConLienzo dibujable={dibujable} hashProps={hashProps} layout={layout} componentes={componentes} urlDeFuente={urlDeFuente} />
        </ProveedoresDelEstudio>
      )}
    </VistaEnHash>
  );
}

interface PropsDeVistaEnHash {
  dibujable: Dibujable;
  hash: AdaptadorDeHash;
  geometrias: GeometriasDeDev;
  children(hashProps: PropsDeEstadoEnHash): ReactElement;
}

/** La Vista activa, la Seleccion y la ruta viven en el hash; los proveedores las dan al lienzo y a los paneles. */
function VistaEnHash({ dibujable, hash, geometrias, children }: PropsDeVistaEnHash): ReactElement {
  const hashProps = useEstadoEnHash({ source: dibujable.estado.fuente, hash, defaultView: dibujable.estado.vistas[0] ?? '', camera: true });
  useEffect(() => geometrias.activar(hashProps.view), [geometrias, hashProps.view]);
  return children(hashProps);
}

function MarcoConLienzo(opciones: Parameters<typeof useLienzoDelEstudio>[0]): ReactElement {
  const { lienzo, leyenda } = useLienzoDelEstudio(opciones);
  return <Marco navegacion={navegacionDesde(opciones.hashProps)} lienzo={lienzo} leyenda={leyenda} />;
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
