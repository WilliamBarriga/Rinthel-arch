/**
 * Whether this browser already used or dismissed the "1-minute tour" pill (browser-local state). An exported file
 * opened over `file://` has an opaque origin in Chromium, where `localStorage` may throw: then it lives in memory only.
 */
import { useSyncExternalStore } from 'react';

const LLAVE = 'rinthel-arch:tour-seen';
const avisos = new Set<() => void>();
let enMemoria = false;

function leer(): boolean {
  try {
    return localStorage.getItem(LLAVE) !== null;
  } catch {
    return enMemoria;
  }
}

/** The pill never comes back after this. */
export function marcarTourVisto(): void {
  try {
    localStorage.setItem(LLAVE, '1');
  } catch {
    enMemoria = true;
  }
  for (const aviso of avisos) aviso();
}

function suscribir(aviso: () => void): () => void {
  avisos.add(aviso);
  return () => avisos.delete(aviso);
}

export const useTourVisto = (): boolean => useSyncExternalStore(suscribir, leer);
