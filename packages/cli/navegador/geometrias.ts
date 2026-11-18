/**
 * Geometria bajo demanda de la pagina de `diagrams dev`, sin React ni DOM para poder probarla. Pide solo la
 * Geometria de la Vista activa y la de otra Vista al navegar a ella; un cambio de `pintura` o `codigo` (o un
 * estado sin `cambio`, que conserva la ultima Fuente buena) no pide nada. Tras un cambio de `estructura`, o si se
 * salto una version (no se sabe que cambio), descarta lo pedido y vuelve a pedir la Vista activa; mientras llega
 * se sigue dibujando el estado anterior. Una Geometria que no llega no se entrega: `VistaInteractiva` la calcula
 * en el Worker. Una malformada se reporta en `errores`. No es parte de la interfaz del paquete.
 */
import type { EstadoDeDev, FuenteCanonica, GeometriaCacheada } from 'canonico';

import type { LecturaDeGeometria } from './cliente';

/** Lo que la pagina dibuja: un estado con Fuente y las Geometrias que ya llegaron para su estructura. */
export interface Dibujable {
  estado: EstadoDeDev & { fuente: FuenteCanonica };
  geometrias: Readonly<Record<string, GeometriaCacheada>>;
  errores: readonly string[];
}

export interface DependenciasDeGeometrias {
  pedir: (vista: string) => Promise<LecturaDeGeometria>;
  /** Vista activa antes de que la pagina dibuje (la del hash de URL). */
  vistaInicial: (fuente: FuenteCanonica) => string | undefined;
}

export interface GeometriasDeDev {
  /** Estado nuevo (inicial, SSE o recarga). */
  recibir(estado: EstadoDeDev): void;
  /** La pagina muestra la Vista `vista`: pide su Geometria si aun no se pidio para la estructura vigente. */
  activar(vista: string): void;
  dibujable(): Dibujable | undefined;
  /** Avisa cada vez que cambia `dibujable()`; devuelve la baja. */
  suscribir(aviso: () => void): () => void;
}

type ConFuente = EstadoDeDev & { fuente: FuenteCanonica };

export function crearGeometriasDeDev({ pedir, vistaInicial }: DependenciasDeGeometrias): GeometriasDeDev {
  const avisos = new Set<() => void>();
  let mostrado: Dibujable | undefined;
  /** Ultimo estado con Fuente recibido. */
  let ultimo: ConFuente | undefined;
  /** Estado de una estructura nueva que espera la Geometria de la Vista activa. */
  let esperando: { estado: ConFuente; vista: string } | undefined;
  let activa: string | undefined;
  /** Lo pedido para la estructura vigente: se reemplaza (y lo que llegue tarde se descarta) en cada cambio de estructura. */
  let ronda = { pedidas: new Set<string>(), geometrias: {} as Record<string, GeometriaCacheada>, errores: [] as string[] };

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
