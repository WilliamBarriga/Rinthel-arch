/** Sitio de codigo `archivo:linea`: su tipo, como se escribe, se lee y se saca de una salida de `inspect`. Puro. */
import type { SalidaDeInspect } from 'canonico';

/** Mismo par que `inspect` (`file`, `line`); `line` empieza en 1. */
export interface SitioDeCodigo {
  file: string;
  line: number;
}

/** `main.dg:12`. */
export const textoDeSitio = ({ file, line }: SitioDeCodigo): string => `${file}:${line}`;

/** `main.dg:12` -> sitio; cualquier otra cosa, `undefined`. */
export function sitioEscrito(consulta: string): SitioDeCodigo | undefined {
  const m = /^(\S+):(\d+)$/.exec(consulta.trim());
  if (m === null || Number(m[2]) < 1) return undefined;
  return { file: m[1]!, line: Number(m[2]) };
}

/** Donde se declara lo consultado (Nodo, Vista o Interaccion); `undefined` para `buscar` y `tema`. */
export function sitioDeSalida(salida: SalidaDeInspect): SitioDeCodigo | undefined {
  const s = salida.command === 'node' ? salida.node : salida.command === 'view' ? salida.view : salida.command === 'interaction' ? salida.interaction : undefined;
  return s === undefined ? undefined : { file: s.file, line: s.line };
}
