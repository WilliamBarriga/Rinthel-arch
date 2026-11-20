/**
 * Contexto que reciben los paneles de las islas (`pestanas.tsx`): el estado de `dev`, el cliente y las acciones del
 * marco. Un panel nuevo lo lee con `useEstudio()`; no recibe props.
 */
import { createContext, useContext } from 'react';

import type { FuenteCanonica } from 'canonico';

import type { EstadoDeDev } from '../../src/protocolo';
import type { ClienteDeDev } from '../cliente';
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
  /** Oculta o recupera una isla (los atajos Mod+B y Mod+J los registra el registro de comandos). */
  alternarIsla(lado: LadoDeIsla): void;
  /** Tema con que se previsualiza la Vista activa sin escribir (galeria de Temas); `undefined` si no hay previsualizacion. */
  temaPrevio: string | undefined;
  /** Previsualiza la Vista activa con otro Tema, o vuelve al suyo con `undefined`. Cambiar de Vista la descarta. */
  previsualizarTema(tema: string | undefined): void;
  /** Toast efimero del marco. */
  avisar(texto: string): void;
  /** Nodo dentro de `.ui-chrome` para los portales de Base UI (`container`), con los tokens del chrome. */
  portales: HTMLElement | null;
}

export const ContextoDeEstudio = createContext<ContextoDelEstudio | undefined>(undefined);

export function useEstudio(): ContextoDelEstudio {
  const contexto = useContext(ContextoDeEstudio);
  if (contexto === undefined) throw new Error('useEstudio fuera de <Estudio>');
  return contexto;
}
