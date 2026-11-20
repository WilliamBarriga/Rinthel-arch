/**
 * Escritura: unico camino de la UI que escribe en `dev` por una accion (mover, ordenar, deshacer, rehacer, saltar en el
 * Historial, fijar Tema y aplicar `fix`). Es el unico dueno de la version vigente, del rechazo por version (409) y del
 * aviso: envia con la `version` del ultimo estado recibido (no el del render); ante un 409 recarga el estado y avisa;
 * solo reintenta (una vez, sobre el estado recargado) si el pedido lo pide con `reintentar`. Otro rechazo avisa
 * `fallo: mensaje` (las ediciones de texto nombran ademas motivo y archivo). Antes de mover el Historial vacia el
 * guardado pendiente del editor, para no operar sobre un estado viejo. Nunca lanza: el resultado es un dato.
 * El guardado del editor no pasa por aqui: reconcilia con el disco a su manera (`editor/guardado.ts`).
 */
import type { Intencion } from 'canonico';

import type { EstadoDeDev, PeticionDeEdiciones } from '../../src/protocolo';
import type { ClienteDeDev, ResultadoDeEnvio } from '../cliente';

/** Un paso del Historial: deshacer, rehacer o saltar a la entrada `id` (0: Inicio). */
export type MovimientoDelHistorial = 'deshacer' | 'rehacer' | { saltar: number };

/** Que ediciones mandar sobre un estado (el vigente o el recargado tras un 409); `undefined` si no queda ninguna. */
export type EleccionDeEdiciones = (estado: EstadoDeDev) => Omit<PeticionDeEdiciones, 'version'> | undefined;

export type PedidoDeEscritura =
  /** `fallo` encabeza el aviso de un rechazo que no es 409 (p. ej. `No se pudo mover el Pin`). */
  | { intencion: Intencion; fallo: string }
  | { ediciones: EleccionDeEdiciones; fallo: string; reintentar?: boolean }
  | { historial: MovimientoDelHistorial };

export type Escribir = (pedido: PedidoDeEscritura) => Promise<ResultadoDeEnvio>;

export interface DependenciasDeEscritura {
  cliente: Pick<ClienteDeDev, 'estado' | 'editar' | 'editarTexto' | 'deshacer' | 'rehacer' | 'saltar'>;
  /** El ultimo estado recibido (por SSE o por una recarga). */
  vigente: () => EstadoDeDev | undefined;
  /** Hace vigente un estado recargado. */
  recibir: (estado: EstadoDeDev) => void;
  avisar: (texto: string) => void;
  vaciarGuardado: () => Promise<void>;
}

const rechazo = (mensaje: string): Extract<ResultadoDeEnvio, { ok: false }> => ({ ok: false, desactualizado: false, mensaje });

export function crearEscritura({ cliente, vigente, recibir, avisar, vaciarGuardado }: DependenciasDeEscritura): Escribir {
  const recargar = async (): Promise<EstadoDeDev | undefined> => {
    const nuevo = await cliente.estado();
    if (nuevo !== undefined) recibir(nuevo);
    return nuevo;
  };

  /** Una peticion sobre `estado`; sin estado no se envia nada. */
  const enviar = async (pedido: PedidoDeEscritura, estado: EstadoDeDev | undefined): Promise<ResultadoDeEnvio> => {
    if ('historial' in pedido) {
      const { historial } = pedido;
      if (historial === 'deshacer') return cliente.deshacer();
      if (historial === 'rehacer') return cliente.rehacer();
      return cliente.saltar(historial.saltar);
    }
    if (estado === undefined) return rechazo('aun no hay estado del Workspace');
    if ('intencion' in pedido) return cliente.editar(pedido.intencion, estado.version);
    const peticion = pedido.ediciones(estado);
    return peticion === undefined ? rechazo('no queda nada que aplicar') : cliente.editarTexto({ ...peticion, version: estado.version });
  };

  return async (pedido) => {
    if ('historial' in pedido) await vaciarGuardado();
    let r = await enviar(pedido, vigente());
    if (!r.ok && r.desactualizado && 'reintentar' in pedido && pedido.reintentar === true) r = await enviar(pedido, await recargar());
    if (r.ok) return r;
    if (r.desactualizado) {
      avisar(`El archivo cambio en disco; se recargo la Vista (${r.mensaje})`);
      await recargar();
    } else avisar(avisoDeRechazo(pedido, r));
    return r;
  };
}

function avisoDeRechazo(pedido: PedidoDeEscritura, r: Extract<ResultadoDeEnvio, { ok: false }>): string {
  if ('historial' in pedido) return `No se pudo ${typeof pedido.historial === 'object' ? 'saltar' : pedido.historial}: ${r.mensaje}`;
  if ('intencion' in pedido) return `${pedido.fallo}: ${r.mensaje}`;
  const motivo = [r.motivo, r.file === undefined ? undefined : `en ${r.file}`].filter((x) => x !== undefined).join(' ');
  return `${pedido.fallo}${motivo === '' ? '' : ` (${motivo})`}: ${r.mensaje}`;
}
