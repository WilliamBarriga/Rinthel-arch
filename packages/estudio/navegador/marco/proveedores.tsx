/**
 * Proveedores del estudio: arman `useEstudio()`, el canal del editor y la previsualizacion de Tema, y envuelven todo lo
 * que se dibuja (marco, paneles y lienzo), asi que el lienzo llega al contexto como cualquier panel. Son duenos del
 * estado del chrome (islas, pestanas, dialogos, aviso), que el marco lee con `useChrome()` (solo dentro de `marco/`).
 */
import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';
import type { ReactElement, ReactNode } from 'react';

import type { FuenteCanonica } from 'canonico';
import type { PropsDeEstadoEnHash } from 'shell';

import type { EstadoDeDev } from '../../src/protocolo';
import type { ClienteDeDev } from '../cliente';
import { COMANDOS } from '../comandos/registro';
import type { Plataforma } from '../comandos/teclas';
import { useAtajos } from '../comandos/use-atajos';
import { crearEscritura } from '../escritura/escritura';
import { textoDeSitio } from '../sitio';
import type { SitioDeCodigo } from '../sitio';
import { ContextoDePrevisualizacion, useEstadoDePrevisualizacion } from '../temas/previsualizacion';
import { ContextoDeEstudio, ContextoDelEditor } from './contexto';
import type { CanalDelEditor, ContextoDelEstudio, DialogoDelEstudio } from './contexto';
import type { LadoDeIsla } from './limites';
import { useCaducidad } from './use-caducidad';
import { useIsla } from './use-isla';
import type { Isla } from './use-isla';
import { useTamano } from './use-tamano';

const DURACION_DEL_AVISO_MS = 6000;

/** Estado de `dev` que llega por SSE (`use-estado-de-dev.ts`) y lo que no depende de la Vista. */
interface BaseDelEstudio {
  estado: EstadoDeDev | undefined;
  /** El ultimo estado recibido (el que usa la Escritura), aunque el render aun no lo haya visto. */
  vigente: () => EstadoDeDev | undefined;
  recibir: (estado: EstadoDeDev) => void;
  cliente: ClienteDeDev;
  plataforma: Plataforma;
  /** Ultimo fallo de lo que llega fuera de los proveedores (evento `estado` malformado, carga de Componentes): se avisa una vez por objeto. */
  fallo?: FalloDelEstudio | undefined;
}

/** Un objeto por ocurrencia: el mismo mensaje dos veces se avisa dos veces. */
interface FalloDelEstudio {
  mensaje: string;
}

/** Estado del chrome que el marco dibuja. */
interface ChromeDelMarco {
  islas: Record<LadoDeIsla, Isla>;
  pestanas: Record<LadoDeIsla, string>;
  elegirPestana(lado: LadoDeIsla, pestana: string): void;
  dialogo: DialogoDelEstudio | undefined;
  /** Dialogos ya abiertos alguna vez: siguen montados (Base UI cierra y devuelve el foco). */
  cargados: ReadonlySet<DialogoDelEstudio>;
  cerrarDialogo(abierto: boolean): void;
  aviso: string | undefined;
  /** `ref` del nodo de portales dentro de `.ui-chrome`. */
  alMontarPortales(nodo: HTMLElement | null): void;
}

interface PropsDeProveedores extends BaseDelEstudio {
  /** Sin Fuente (el Workspace nunca compilo) no hay Vista ni Seleccion. */
  fuente?: FuenteCanonica;
  /** La Vista activa, la Seleccion y la ruta, que viven en el hash. */
  hashProps?: PropsDeEstadoEnHash;
  /** El marco (con el lienzo, si hay Fuente). */
  children: ReactNode;
}

const ContextoDelChrome = createContext<ChromeDelMarco | undefined>(undefined);

/** El estado del chrome que dibuja el marco. */
export function useChrome(): ChromeDelMarco {
  const chrome = useContext(ContextoDelChrome);
  if (chrome === undefined) throw new Error('useChrome fuera de <ProveedoresDelEstudio>');
  return chrome;
}

/** El motivo visible por el que no hay Gestos (el primer error del estado), o `undefined`. */
function motivoSinGestos(estado: EstadoDeDev | undefined): string | undefined {
  const error = estado?.issues.find((i) => i.severity === 'error');
  return error === undefined ? undefined : `Gestos deshabilitados: el texto no compila (${textoDeSitio(error)} ${error.message})`;
}

export function ProveedoresDelEstudio({ estado, vigente, recibir, cliente, plataforma, fallo, fuente, hashProps, children }: PropsDeProveedores): ReactElement {
  const tamano = useTamano();
  const medidas = { ancho: tamano.width, alto: tamano.height };
  const izquierda = useIsla({ lado: 'izquierda', id: 'ui-isla-izquierda', nombre: 'panel izquierdo', lienzo: medidas, anchoInicial: 280 });
  const derecha = useIsla({ lado: 'derecha', id: 'ui-isla-derecha', nombre: 'panel derecho', lienzo: medidas, anchoInicial: 400 });
  const islas = { izquierda, derecha };
  const [pestanas, setPestanas] = useState<Record<LadoDeIsla, string>>({ izquierda: 'vistas', derecha: 'detalle' });
  const [portales, setPortales] = useState<HTMLElement | null>(null);
  const [dialogo, setDialogo] = useState<DialogoDelEstudio>();
  // Un dialogo se carga (trozo aparte) la primera vez que se abre y desde ahi sigue montado.
  const [cargados, setCargados] = useState<ReadonlySet<DialogoDelEstudio>>(() => new Set());
  if (dialogo !== undefined && !cargados.has(dialogo)) setCargados(new Set([...cargados, dialogo]));
  const [sitioDeCodigo, setSitioDeCodigo] = useState<SitioDeCodigo>();
  const [aviso, avisar] = useState<string>();
  useCaducidad(aviso === undefined ? undefined : DURACION_DEL_AVISO_MS, () => avisar(undefined), aviso);
  useEffect(() => {
    if (fallo !== undefined) avisar(fallo.mensaje);
  }, [fallo]);
  const guardados = useRef(new Set<() => Promise<void>>());

  const elegirPestana = (lado: LadoDeIsla, pestana: string): void => setPestanas((p) => ({ ...p, [lado]: pestana }));
  const abrirPestana = (lado: LadoDeIsla, pestana: string): void => {
    islas[lado].mostrar();
    elegirPestana(lado, pestana);
  };
  const vaciarGuardado = useCallback(async (): Promise<void> => {
    await Promise.all([...guardados.current].map((guardar) => guardar()));
  }, []);
  const escribir = useMemo(() => crearEscritura({ cliente, vigente, recibir, avisar, vaciarGuardado }), [cliente, vigente, recibir, vaciarGuardado]);
  const sinGestos = useMemo(() => motivoSinGestos(estado), [estado]);

  const contexto: ContextoDelEstudio = {
    estado,
    fuente,
    cliente,
    vista: hashProps?.view,
    seleccion: hashProps?.selected ?? null,
    irAVista: (vista) => hashProps?.onPathChange([vista]),
    seleccionar: (id) => hashProps?.onSelect(id),
    abrirPestana,
    alternarIsla: (lado) => islas[lado].alternar(),
    motivoSinGestos: sinGestos,
    avisar,
    escribir,
    abrirDialogo: setDialogo,
    abrirCodigo: (sitio) => {
      abrirPestana('izquierda', 'codigo');
      abrirPestana('derecha', 'issues');
      if (sitio !== undefined) setSitioDeCodigo(sitio);
    },
    vaciarGuardado,
    plataforma,
    portales,
  };
  const canalDelEditor = useMemo<CanalDelEditor>(
    () => ({
      sitio: sitioDeCodigo,
      registrarGuardado(guardar) {
        guardados.current.add(guardar);
        return () => guardados.current.delete(guardar);
      },
    }),
    [sitioDeCodigo],
  );
  const previsualizacion = useEstadoDePrevisualizacion(hashProps?.view);
  useAtajos(COMANDOS, contexto);

  const chrome: ChromeDelMarco = {
    islas,
    pestanas,
    elegirPestana,
    dialogo,
    cargados,
    cerrarDialogo: (abierto) => {
      if (!abierto) setDialogo(undefined);
    },
    aviso,
    alMontarPortales: setPortales,
  };
  return (
    <ContextoDeEstudio.Provider value={contexto}>
      <ContextoDelEditor.Provider value={canalDelEditor}>
        <ContextoDePrevisualizacion.Provider value={previsualizacion}>
          <ContextoDelChrome.Provider value={chrome}>{children}</ContextoDelChrome.Provider>
        </ContextoDePrevisualizacion.Provider>
      </ContextoDelEditor.Provider>
    </ContextoDeEstudio.Provider>
  );
}
