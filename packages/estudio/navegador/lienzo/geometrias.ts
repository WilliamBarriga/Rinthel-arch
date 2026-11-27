/**
 * Geometria bajo demanda de la pagina de `dev`: solo la de la Vista activa. Un cambio de `pintura` o `codigo` (o un
 * estado sin `cambio`) no pide nada. Tras un cambio de `estructura` o una version saltada, descarta lo pedido y pide
 * la Vista activa; mientras llega se dibuja el estado anterior. Una Geometria malformada se reporta en `errores`.
 */
import type { CanonicalForm, CachedGeometry } from 'canonical';

import type { EstadoDeDev } from '../../src/protocolo';

import type { LecturaDeGeometria } from '../cliente';

/** `geometrias`: las que ya llegaron para la estructura del estado. */
export interface Dibujable {
  estado: EstadoDeDev & { fuente: CanonicalForm };
  geometrias: Readonly<Record<string, CachedGeometry>>;
  errores: readonly string[];
}

export interface DependenciasDeGeometrias {
  pedir: (vista: string) => Promise<LecturaDeGeometria>;
  /** Vista activa antes de que la pagina dibuje (la del hash de URL). */
  vistaInicial: (fuente: CanonicalForm) => string | undefined;
}

export interface GeometriasDeDev {
  recibir(estado: EstadoDeDev): void;
  /** Pide su Geometria si aun no se pidio para la estructura vigente. */
  activar(vista: string): void;
  dibujable(): Dibujable | undefined;
  /** Avisa cuando cambia `dibujable()`; devuelve la baja. */
  suscribir(aviso: () => void): () => void;
}

type ConFuente = EstadoDeDev & { fuente: CanonicalForm };

export function crearGeometriasDeDev({ pedir, vistaInicial }: DependenciasDeGeometrias): GeometriasDeDev {
  const avisos = new Set<() => void>();
  let mostrado: Dibujable | undefined;
  let ultimo: ConFuente | undefined;
  /** Estado de una estructura nueva que espera la Geometria de la Vista activa. */
  let esperando: { estado: ConFuente; vista: string } | undefined;
  let activa: string | undefined;
  /** Se reemplaza en cada cambio de estructura; lo que llegue tarde a la ronda vieja se descarta. */
  let ronda = { pedidas: new Set<string>(), geometrias: {} as Record<string, CachedGeometry>, errores: [] as string[] };

  const avisar = (): void => {
    for (const aviso of avisos) aviso();
  };
  const mostrar = (estado: ConFuente): void => {
    mostrado = { estado, geometrias: { ...ronda.geometrias }, errores: [...ronda.errores] };
    avisar();
  };

  const solicitar = (vista: string): void => {
    const vigente = ronda;
    if (vigente.pedidas.has(vista)) return;
    vigente.pedidas.add(vista);
    void pedir(vista).then((leida) => {
      if (vigente !== ronda) return;
      if (leida.ok) vigente.geometrias[vista] = leida.geometria;
      else if (leida.error !== undefined) vigente.errores.push(leida.error);
      if (esperando?.vista === vista) {
        const listo = esperando.estado;
        esperando = undefined;
        mostrar(listo);
      } else if (esperando === undefined && mostrado !== undefined) {
        mostrar(mostrado.estado);
      }
    });
  };

  return {
    recibir(estado) {
      if (estado.fuente === undefined) return;
      const conFuente = estado as ConFuente;
      const previo = ultimo;
      if (previo !== undefined && estado.version <= previo.version) return;
      ultimo = conFuente;
      const relayout = previo === undefined || estado.cambio === 'estructura' || estado.version !== previo.version + 1;
      if (!relayout) {
        if (esperando !== undefined) esperando = { ...esperando, estado: conFuente };
        else mostrar(conFuente);
        return;
      }
      ronda = { pedidas: new Set(), geometrias: {}, errores: [] };
      const vista = activa ?? vistaInicial(conFuente.fuente);
      if (vista === undefined) {
        esperando = undefined;
        mostrar(conFuente);
        return;
      }
      esperando = { estado: conFuente, vista };
      solicitar(vista);
    },
    activar(vista) {
      activa = vista;
      if (ultimo !== undefined) solicitar(vista);
    },
    dibujable: () => mostrado,
    suscribir(aviso) {
      avisos.add(aviso);
      return () => avisos.delete(aviso);
    },
  };
}
