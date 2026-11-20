/**
 * La UI nombra la Vista en la URL como `#vista=<id>`; el shell la guarda como `p` (ruta de drill-down). Este adaptador
 * traduce solo esa clave y deja el resto (`s`, `t`, `cam`, `e`, `c`) tal cual.
 */
import type { AdaptadorDeHash } from 'shell';

const renombrar = (hash: string, de: string, a: string): string => {
  const entrada = new URLSearchParams(hash.startsWith('#') ? hash.slice(1) : hash);
  const salida = new URLSearchParams();
  for (const [clave, valor] of entrada) salida.append(clave === de ? a : clave, valor);
  return salida.toString();
};

/** Hash del shell (sin `#`) -> hash de la UI. */
export const aHashDeEstudio = (hash: string): string => renombrar(hash, 'p', 'vista');

/** Hash de la UI (con o sin `#`) -> hash del shell. */
export const deHashDeEstudio = (hash: string): string => renombrar(hash, 'vista', 'p');

export function hashDeEstudio(base: AdaptadorDeHash): AdaptadorDeHash {
  return {
    leer: () => deHashDeEstudio(base.leer()),
    escribir: (hash, opciones) => base.escribir(aHashDeEstudio(hash), opciones),
    suscribir: (aviso) => base.suscribir(aviso),
  };
}
