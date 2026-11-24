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
import { comandosDe } from '../comandos/registro';
import type { Plataforma } from '../comandos/teclas';
import { useAtajos } from '../comandos/use-atajos';
import { crearEscritura } from '../escritura/escritura';
import { textoDeSitio } from '../sitio';
import type { SitioDeCodigo } from '../sitio';
import { ContextoDePrevisualizacion, useEstadoDePrevisualizacion } from '../temas/previsualizacion';
import { ContextoDeEstudio, ContextoDelEditor } from './contexto';
import type { CanalDelEditor, ContextoDelEstudio, DialogoDelEstudio } from './contexto';
import type { LadoDeIsla } from './limites';
import { disponiblesEn } from './modo';
import type { ModoDelEstudio } from './modo';
import { PESTANAS_DERECHAS, PESTANAS_IZQUIERDAS } from './pestanas';
import type { PestanaDelPanel } from './pestanas';
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
  /** `export`: read-only (`modo.ts`). */
  modo: ModoDelEstudio;
}

/** Un objeto por ocurrencia: el mismo mensaje dos veces se avisa dos veces. */
interface FalloDelEstudio {
  mensaje: string;
}

/** Estado del chrome que el marco dibuja. */
interface ChromeDelMarco {
  islas: Record<LadoDeIsla, Isla>;
  /** The tabs of each island in this mode. */
  disponibles: Record<LadoDeIsla, readonly PestanaDelPanel[]>;
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
  return error === undefined ? undefined : `Gestures disabled: the text does not compile (${textoDeSitio(error)} ${error.message})`;
}

/** The tabs of each island available in `modo`. */
function pestanasDe(modo: ModoDelEstudio): Record<LadoDeIsla, readonly PestanaDelPanel[]> {
  return { izquierda: disponiblesEn(PESTANAS_IZQUIERDAS, modo), derecha: disponiblesEn(PESTANAS_DERECHAS, modo) };
}

export function ProveedoresDelEstudio({ estado, vigente, recibir, cliente, plataforma, fallo, modo, fuente, hashProps, children }: PropsDeProveedores): ReactElement {
  const tamano = useTamano();
  const medidas = { ancho: tamano.width, alto: tamano.height };
  const izquierda = useIsla({ lado: 'izquierda', id: 'ui-isla-izquierda', nombre: 'left panel', lienzo: medidas, anchoInicial: 280 });
  const derecha = useIsla({ lado: 'derecha', id: 'ui-isla-derecha', nombre: 'right panel', lienzo: medidas, anchoInicial: 400 });
  const islas = { izquierda, derecha };
  const disponibles = useMemo(() => pestanasDe(modo), [modo]);
  const [pestanas, setPestanas] = useState<Record<LadoDeIsla, string>>(() => ({ izquierda: disponibles.izquierda[0]?.id ?? '', derecha: disponibles.derecha[0]?.id ?? '' }));
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
  /** A tab that does not exist in this mode (Details in an export) is ignored. */
  const abrirPestana = (lado: LadoDeIsla, pestana: string): void => {
    if (!disponibles[lado].some(({ id }) => id === pestana)) return;
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
    irAPaso: (paso) => hashProps?.onStepChange(paso),
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
    modo,
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
  useAtajos(useMemo(() => comandosDe(modo), [modo]), contexto);

  const chrome: ChromeDelMarco = {
    islas,
    disponibles,
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
