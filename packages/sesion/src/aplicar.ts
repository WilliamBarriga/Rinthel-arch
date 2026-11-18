import type { MotivoDeRechazo } from 'canonico';
import type { ArchivosDelWorkspace } from 'dsl';

import { aplicarEdiciones } from './ediciones';
import type { EdicionConHash } from './ediciones';
import { aplicarIntencion } from './intenciones';
import type { Intencion, Visto } from './intenciones';

/**
 * Puerto del Workspace en disco (adaptador en `cli`; fake en memoria en las pruebas).
 * `leer` da `disco` (Workspace mas Temas de `--theme-path`, lo que se compila) y
 * `propios` (solo los archivos del Workspace, los unicos escribibles). Los fallos de
 * I/O se propagan como excepcion.
 */
export interface PuertoDeWorkspace {
  leer(): { disco: ArchivosDelWorkspace; propios: ArchivosDelWorkspace };
  escribir(ruta: string, texto: string): void;
}

/** Lo que entra por la puerta: una Intencion o una lista de ediciones estructuradas con hash (`--edits`, `fix`). */
export type Aplicable = Intencion | readonly EdicionConHash[];

/** Resultado de `aplicarAlWorkspace`: los archivos `cambiados` y las `ediciones` aplicadas, o el rechazo con `motivo` y `mensaje`. */
export type ResultadoDeAplicar =
  | { ok: true; cambiados: string[]; ediciones: EdicionConHash[] }
  | { ok: false; motivo: MotivoDeRechazo; mensaje: string; file?: string };

/** Archivos que cambia una edicion (ordenados). */
const cambiadosEntre = (antes: ArchivosDelWorkspace, despues: ArchivosDelWorkspace): string[] =>
  Object.keys(despues)
    .filter((f) => despues[f] !== antes[f])
    .sort();

/**
 * Puerta de escritura unica del Workspace (ADR 0005, ADR 0007): lee fresco por el puerto, aplica una Intencion
 * (con `aplicarIntencion`: calcular, auto-probar, aplicar en memoria; `visto` opcional es el mapa archivo -> hash
 * de lo que vio quien emite y rechaza con `hash-desactualizado` si el archivo que cambia difiere) o una lista de ediciones estructuradas
 * (cada una con su propio hash; `visto` no aplica) y escribe solo los archivos propios que cambian.
 * Todo o nada: un rechazo no escribe nada. Un archivo ajeno al Workspace (p. ej. de `--theme-path`) que
 * cambiaria se rechaza como `archivo-desconocido`. Los fallos de I/O del puerto se propagan.
 */
export function aplicarAlWorkspace(puerto: PuertoDeWorkspace, aplicable: Aplicable, visto?: Visto): ResultadoDeAplicar {
  const { disco, propios } = puerto.leer();
  const r = esListaDeEdiciones(aplicable)
    ? { ...aplicarEdiciones(disco, aplicable), ediciones: [...aplicable] }
    : aplicarIntencion(disco, aplicable, visto);
  if (!r.ok) return { ok: false, motivo: r.motivo, mensaje: r.mensaje, ...(r.file === undefined ? {} : { file: r.file }) };
  const cambiados = cambiadosEntre(disco, r.archivos);
  const fuera = cambiados.find((f) => !(f in propios));
  if (fuera !== undefined) {
    return { ok: false, motivo: 'archivo-desconocido', mensaje: `'${fuera}' no pertenece al Workspace`, file: fuera };
  }
  for (const ruta of cambiados) puerto.escribir(ruta, r.archivos[ruta] as string);
  return { ok: true, cambiados, ediciones: r.ediciones };
}

const esListaDeEdiciones = (aplicable: Aplicable): aplicable is readonly EdicionConHash[] => Array.isArray(aplicable);
