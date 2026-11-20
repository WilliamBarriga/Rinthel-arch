/** Ayudas de las pruebas de `sesion`, sobre su interfaz publica. */
import { aplicarAlWorkspace, puertoEnMemoria } from 'sesion';
import type { Intencion } from 'sesion';

type Visto = Parameters<typeof aplicarAlWorkspace>[2];

/**
 * Una Intencion por la puerta de escritura sobre un Workspace en memoria con esos archivos: el rechazo, o las
 * ediciones y los archivos que quedaron escritos.
 */
export function aplicarEnMemoria(archivos: Readonly<Record<string, string>>, intencion: Intencion, visto?: Visto) {
  const puerto = puertoEnMemoria({ propios: { ...archivos } });
  const r = aplicarAlWorkspace(puerto, intencion, visto);
  return r.ok ? { ...r, archivos: puerto.leer().propios } : r;
}
