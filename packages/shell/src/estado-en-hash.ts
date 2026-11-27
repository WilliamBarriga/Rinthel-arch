/**
 * Props controladas de `VistaInteractiva` guardadas en el hash de URL; se esparcen tal cual. Cambiar de Vista
 * reinicia colapso, Seleccion, Paso y camara y empuja una entrada de historial; un cambio externo del hash reemplaza el estado.
 */
import { useEffect, useRef, useState } from 'react';

import type { CollapseState, CanonicalForm } from 'canonical';
import type { Camara } from 'render';

import { deserializarEstado, pasoInicialDeVista, serializarEstado, vistaPorDefecto } from './hash';
import type { AdaptadorDeHash, EstadoDeShell } from './hash';

export interface OpcionesDeEstadoEnHash {
  source: CanonicalForm;
  hash: AdaptadorDeHash;
  /** Vista inicial cuando el hash no dice otra; por defecto la primera de la Fuente. */
  defaultView?: string;
  /** Guarda tambien la camara en el hash. Por defecto `false`. */
  camera?: boolean;
}

/** Props de `VistaInteractiva` que gobierna el hash. */
export interface PropsDeEstadoEnHash {
  view: string;
  path: string[];
  state: CollapseState;
  selected: string | null;
  step: number;
  camera?: Camara;
  onPathChange: (ruta: string[]) => void;
  onStateChange: (estado: CollapseState) => void;
  onSelect: (id: string) => void;
  onStepChange: (paso: number) => void;
  onCameraChange: (camara: Camara) => void;
}

export function useEstadoEnHash(opciones: OpcionesDeEstadoEnHash): PropsDeEstadoEnHash {
  const { source, hash, camera: conCamara = false } = opciones;
  const inicial = opciones.defaultView ?? vistaPorDefecto(source);
  const leer = (): EstadoDeShell => {
    const e = deserializarEstado(hash.leer(), source, inicial);
    if (!conCamara) delete e.camera;
    return e;
  };
  const [estado, setEstado] = useState<EstadoDeShell>(leer);
  const actual = useRef(estado);
  const ultimo = useRef({ hash, inicial, conCamara, leer, source });
  ultimo.current = { hash, inicial, conCamara, leer, source };

  useEffect(
    () =>
      hash.suscribir(() => {
        const nuevo = ultimo.current.leer();
        const { inicial: ini } = ultimo.current;
        if (serializarEstado(nuevo, ini, ultimo.current.source) === serializarEstado(actual.current, ini, ultimo.current.source)) return;
        actual.current = nuevo;
        setEstado(nuevo);
      }),
    [hash],
  );

  const aplicar = (siguiente: EstadoDeShell, reemplazar: boolean): void => {
    const { hash: h, inicial: ini, source } = ultimo.current;
    const texto = serializarEstado(siguiente, ini, source);
    const previo = serializarEstado(actual.current, ini, source);
    actual.current = siguiente;
    setEstado(siguiente);
    if (texto !== previo) h.escribir(texto, { reemplazar });
  };

  const view = estado.path[estado.path.length - 1] ?? '';
  const props: PropsDeEstadoEnHash = {
    view,
    path: estado.path,
    state: estado.state,
    selected: estado.selected,
    step: estado.step,
    onPathChange: (ruta) => {
      const e = actual.current;
      const cambioVista = ruta[ruta.length - 1] !== e.path[e.path.length - 1];
      aplicar(cambioVista ? { path: ruta, state: {}, selected: null, step: pasoInicialDeVista(ultimo.current.source, ruta[ruta.length - 1]) } : { ...e, path: ruta }, !cambioVista && ruta.length <= e.path.length);
    },
    onStateChange: (state) => aplicar({ ...actual.current, state }, true),
    onSelect: (selected) => aplicar({ ...actual.current, selected }, true),
    onStepChange: (step) => aplicar({ ...actual.current, step }, true),
    onCameraChange: (camara) => {
      if (ultimo.current.conCamara) aplicar({ ...actual.current, camera: camara }, true);
    },
  };
  if (estado.camera !== undefined) props.camera = estado.camera;
  return props;
}
