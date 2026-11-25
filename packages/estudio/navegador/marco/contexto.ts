/**
 * Contextos que reciben los paneles de las islas (`pestanas.tsx`): `useEstudio()` da el estado de `dev`, el cliente y
 * las acciones del marco (lo que tambien reciben los comandos); `useCanalDelEditor()` (solo Codigo) y
 * `usePrevisualizacionDeTema()` (`temas/previsualizacion.ts`, solo la galeria) van aparte. Los arma
 * `ProveedoresDelEstudio` (`proveedores.tsx`), que envuelve tambien al lienzo. Un panel nuevo no recibe props.
 */
import { createContext, useContext } from 'react';

import type { FuenteCanonica } from 'canonico';

import type { EstadoDeDev } from '../../src/protocolo';
import type { ClienteDeDev } from '../cliente';
import type { Escribir } from '../escritura/escritura';
import type { Plataforma } from '../comandos/teclas';
import type { SitioDeCodigo } from '../sitio';
import type { LadoDeIsla } from './limites';
import type { ModoDelEstudio } from './modo';

export interface ContextoDelEstudio {
  /** `undefined` hasta que llega el primer estado. */
  estado: EstadoDeDev | undefined;
  /** Fuente de la ultima Sesion buena que se esta dibujando; `undefined` si el Workspace nunca compilo. */
  fuente: FuenteCanonica | undefined;
  cliente: ClienteDeDev;
  /** Vista activa (la del hash); `undefined` sin Fuente. */
  vista: string | undefined;
  /** Elemento seleccionado en el lienzo (id de Nodo o de elemento de secuencia). */
  seleccion: string | null;
  /** Cambia la Vista activa: entrada nueva en el historial del navegador (`#view=<id>`). */
  irAVista(vista: string): void;
  /** Shows Step `paso` of the active View (after `irAVista`, of the new one). */
  irAPaso(paso: number): void;
  /** Selecciona un elemento de la Vista activa (sin abrir paneles). */
  seleccionar(id: string): void;
  /** Muestra la isla y activa una de sus pestanas (por `id` del registro). */
  abrirPestana(lado: LadoDeIsla, pestana: string): void;
  /** Oculta o recupera una isla (Mod+B y Mod+J en `comandos/registro.ts`). */
  alternarIsla(lado: LadoDeIsla): void;
  /**
   * Con errores (p. ej. un guardado del editor que no compila) el lienzo conserva la ultima Fuente buena y los Gestos se
   * deshabilitan: escribirian sobre un texto que no es el dibujado. El motivo visible, o `undefined` si hay Gestos.
   */
  motivoSinGestos: string | undefined;
  /** Toast efimero del marco. */
  avisar(texto: string): void;
  /** Unico camino de las acciones que escriben en `dev` (version vigente, 409 y aviso): `escritura/escritura.ts`. */
  escribir: Escribir;
  /** Abre el Buscador, la ayuda de atajos o el tour (dialogos del marco). */
  abrirDialogo(dialogo: DialogoDelEstudio): void;
  /** Abre la pestana Codigo (y Issues); con `sitio`, el editor salta a `archivo:linea` (lo publica `useCanalDelEditor`). */
  abrirCodigo(sitio?: SitioDeCodigo): void;
  /**
   * Manda ya el guardado pendiente del editor y espera a que termine. Llamarlo antes de deshacer, rehacer o saltar en el
   * Historial de `dev` (y con Mod+S), para no operar sobre un estado viejo.
   */
  vaciarGuardado(): Promise<void>;
  /** Plataforma del navegador: decide como se escriben las teclas (`Cmd` o `Ctrl`). */
  plataforma: Plataforma;
  /** Nodo dentro de `.ui-chrome` para los portales de Base UI (`container`), con los tokens del chrome. */
  portales: HTMLElement | null;
  /** `export`: read-only Dev UI written by `diagrams export` (`modo.ts`); `dev` otherwise. */
  modo: ModoDelEstudio;
}

/** The Finder, the shortcuts help and the "Start here" tour (`tour/`). */
export type DialogoDelEstudio = 'buscador' | 'ayuda' | 'tour';

export const ContextoDeEstudio = createContext<ContextoDelEstudio | undefined>(undefined);

const leer = <T,>(contexto: T | undefined, nombre: string): T => {
  if (contexto === undefined) throw new Error(`${nombre} fuera de <Estudio>`);
  return contexto;
};

export const useEstudio = (): ContextoDelEstudio => leer(useContext(ContextoDeEstudio), 'useEstudio');

/** Canal entre el marco y el editor: solo lo lee la pestana Codigo. */
export interface CanalDelEditor {
  /** Ultimo `archivo:linea` pedido con `abrirCodigo`. */
  sitio: SitioDeCodigo | undefined;
  /** El editor publica aqui su `guardar` (lo llama `vaciarGuardado`); devuelve la baja. */
  registrarGuardado(guardar: () => Promise<void>): () => void;
}

export const ContextoDelEditor = createContext<CanalDelEditor | undefined>(undefined);
export const useCanalDelEditor = (): CanalDelEditor => leer(useContext(ContextoDelEditor), 'useCanalDelEditor');
