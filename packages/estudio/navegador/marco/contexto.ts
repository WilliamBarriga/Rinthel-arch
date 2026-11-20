/**
 * Contexto que reciben los paneles de las islas (`pestanas.tsx`): el estado de `dev`, el cliente y las acciones del
 * marco. Un panel nuevo lo lee con `useEstudio()`; no recibe props.
 */
import { createContext, useContext } from 'react';

import type { FuenteCanonica } from 'canonico';

import type { EstadoDeDev } from '../../src/protocolo';
import type { ClienteDeDev } from '../cliente';
import type { Plataforma } from '../comandos/teclas';
import type { LadoDeIsla } from './limites';

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
  /** Cambia la Vista activa: entrada nueva en el historial del navegador (`#vista=<id>`). */
  irAVista(vista: string): void;
  /** Selecciona un elemento de la Vista activa (sin abrir paneles). */
  seleccionar(id: string): void;
  /** Muestra la isla y activa una de sus pestanas (por `id` del registro). */
  abrirPestana(lado: LadoDeIsla, pestana: string): void;
  /** Oculta o recupera una isla (Mod+B y Mod+J en `comandos/registro.ts`). */
  alternarIsla(lado: LadoDeIsla): void;
  /** Tema con que se previsualiza la Vista activa sin escribir (galeria de Temas); `undefined` si no hay previsualizacion. */
  temaPrevio: string | undefined;
  /** Previsualiza la Vista activa con otro Tema, o vuelve al suyo con `undefined`. Cambiar de Vista la descarta. */
  previsualizarTema(tema: string | undefined): void;
  /** Toast efimero del marco. */
  avisar(texto: string): void;
  /** Vuelve a pedir el estado a `dev` (tras un 409). */
  recargar(): Promise<void>;
  /** Abre el Buscador o la ayuda de atajos (dialogos del marco). */
  abrirDialogo(dialogo: DialogoDelEstudio): void;
  /** Abre la pestana Codigo; con `sitio`, el editor salta a `archivo:linea` (lo publica `sitioDeCodigo`). */
  abrirCodigo(sitio?: SitioDeCodigo): void;
  /** Ultimo `archivo:linea` pedido con `abrirCodigo`; lo lee el editor. */
  sitioDeCodigo: SitioDeCodigo | undefined;
  /**
   * Manda ya el guardado pendiente del editor y espera a que termine. Llamarlo antes de deshacer, rehacer o saltar en el
   * Historial de `dev` (y con Mod+S), para no operar sobre un estado viejo.
   */
  vaciarGuardado(): Promise<void>;
  /** El editor publica aqui su `guardar`; devuelve la baja. */
  registrarGuardado(guardar: () => Promise<void>): () => void;
  /** Plataforma del navegador: decide como se escriben las teclas (`Cmd` o `Ctrl`). */
  plataforma: Plataforma;
  /** Nodo dentro de `.ui-chrome` para los portales de Base UI (`container`), con los tokens del chrome. */
  portales: HTMLElement | null;
}

export type DialogoDelEstudio = 'buscador' | 'ayuda';

/** Mismo par que `inspect` (`file`, `line`); `line` empieza en 1. */
export interface SitioDeCodigo {
  file: string;
  line: number;
}

export const ContextoDeEstudio = createContext<ContextoDelEstudio | undefined>(undefined);

export function useEstudio(): ContextoDelEstudio {
  const contexto = useContext(ContextoDeEstudio);
  if (contexto === undefined) throw new Error('useEstudio fuera de <Estudio>');
  return contexto;
}
