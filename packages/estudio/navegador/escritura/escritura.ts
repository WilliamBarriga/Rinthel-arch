/**
 * Escritura: unico camino de la UI que escribe en `dev` por una accion (mover, ordenar, deshacer, rehacer, saltar en el
 * Historial de archivos, fijar Tema y aplicar `fix`). Es el unico dueno de la version vigente, del rechazo por version (409) y del
 * aviso: envia con la `version` del ultimo estado recibido (no el del render); ante un 409 recarga el estado y avisa;
 * solo reintenta (una vez, sobre el estado recargado) si el pedido lo pide con `reintentar`. Otro rechazo avisa
 * `fallo: mensaje` (las ediciones de texto nombran ademas motivo y archivo). Antes de mover el Historial de archivos
 * vacia el guardado pendiente del editor, para no operar sobre un estado viejo. Nunca lanza: el resultado es un dato.
 * El guardado del editor no pasa por aqui: reconcilia con el disco a su manera (`editor/guardado.ts`).
 */
import type { Intent } from 'canonical';

import type { EstadoDeDev, PeticionDeEdiciones } from '../../src/protocolo';
import type { ClienteDeDev, ResultadoDeEnvio } from '../cliente';

/** Un paso del Historial de archivos: deshacer, rehacer o saltar a la entrada `id` (0: Inicio). */
export type MovimientoDelHistorial = 'deshacer' | 'rehacer' | { saltar: number };

/** Que ediciones mandar sobre un estado (el vigente o el recargado tras un 409); `undefined` si no queda ninguna. */
export type EleccionDeEdiciones = (estado: EstadoDeDev) => Omit<PeticionDeEdiciones, 'version'> | undefined;

export type PedidoDeEscritura =
  /** `fallo` encabeza el aviso de un rechazo que no es 409 (p. ej. `No se pudo mover el Pin`). */
  | { intencion: Intent; fallo: string }
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

const rechazo = (mensaje: string): Extract<ResultadoDeEnvio, { ok: false }> => ({ ok: false, desactualizado: false, message: mensaje });

type Cliente = DependenciasDeEscritura['cliente'];

/** Lo que cada clase de pedido decide; el unico sitio que distingue Intencion, ediciones y Historial de archivos. */
interface Plan {
  /** Mover el Historial de archivos vacia antes el guardado pendiente del editor. */
  vaciarGuardado: boolean;
  reintentar: boolean;
  /** Una peticion sobre `estado` (el vigente o el recargado). */
  enviar(estado: EstadoDeDev | undefined): Promise<ResultadoDeEnvio>;
  aviso(r: Extract<ResultadoDeEnvio, { ok: false }>): string;
}

const SIN_ESTADO = rechazo('no Workspace state yet');

function planDe(pedido: PedidoDeEscritura, cliente: Cliente): Plan {
  if ('historial' in pedido) {
    const { historial } = pedido;
    return {
      vaciarGuardado: true,
      reintentar: false,
      enviar: () => (historial === 'deshacer' ? cliente.deshacer() : historial === 'rehacer' ? cliente.rehacer() : cliente.saltar(historial.saltar)),
      aviso: (r) => `Could not ${typeof historial === 'object' ? 'jump' : historial === 'deshacer' ? 'undo' : 'redo'}: ${r.message}`,
    };
  }
  if ('intencion' in pedido) {
    return {
      vaciarGuardado: false,
      reintentar: false,
      enviar: async (estado) => (estado === undefined ? SIN_ESTADO : cliente.editar(pedido.intencion, estado.version)),
      aviso: (r) => `${pedido.fallo}: ${r.message}`,
    };
  }
  return {
    vaciarGuardado: false,
    reintentar: pedido.reintentar === true,
    async enviar(estado) {
      if (estado === undefined) return SIN_ESTADO;
      const peticion = pedido.ediciones(estado);
      return peticion === undefined ? rechazo('nothing left to apply') : cliente.editarTexto({ ...peticion, version: estado.version });
    },
    aviso(r) {
      const motivo = [r.reason, r.file === undefined ? undefined : `in ${r.file}`].filter((x) => x !== undefined).join(' ');
      return `${pedido.fallo}${motivo === '' ? '' : ` (${motivo})`}: ${r.message}`;
    },
  };
}

export function crearEscritura({ cliente, vigente, recibir, avisar, vaciarGuardado }: DependenciasDeEscritura): Escribir {
  const recargar = async (): Promise<EstadoDeDev | undefined> => {
    const nuevo = await cliente.estado();
    if (nuevo !== undefined) recibir(nuevo);
    return nuevo;
  };

  return async (pedido) => {
    const plan = planDe(pedido, cliente);
    if (plan.vaciarGuardado) await vaciarGuardado();
    let r = await plan.enviar(vigente());
    if (!r.ok && r.desactualizado && plan.reintentar) r = await plan.enviar(await recargar());
    if (r.ok) return r;
    if (r.desactualizado) {
      avisar(`The file changed on disk; the View was reloaded (${r.message})`);
      await recargar();
    } else avisar(plan.aviso(r));
    return r;
  };
}
