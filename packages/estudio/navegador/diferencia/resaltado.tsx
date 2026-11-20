/**
 * Las Diferencias externas en la pagina: `useDiferenciasExternas` (lo monta el marco con la Vista activa) une cada una
 * cuando llega el estado de su version, programa el fin del resaltado, limpia el indice al visitar una Vista, avisa si
 * cambio el Tema de la Vista activa. No mueve la Vista: "seguir al agente" solo resuelve el `objetivo` de un Evento de
 * actividad. `ResaltadoDelLienzo` dibuja el halo (CSS sobre `data-id`/`data-edge` del lienzo) y lo anuncia;
 * `MarcaExterna` es el punto del indice y de la galeria.
 */
import { useEffect, useMemo, useRef } from 'react';
import type { ReactElement } from 'react';

import type { EstadoDeColapso, FuenteCanonica } from 'canonico';

import type { ClienteDeDev } from '../cliente';
import { useCaducidad } from '../marco/use-caducidad';
import { useDiferencias } from './diferencias';
import { DURACION_DEL_RESALTADO_MS, proyectarDiferencia, unirDiferencia, vencerResaltado, visitarVista } from './proyeccion';

export interface OpcionesDeDiferenciasExternas {
  cliente: ClienteDeDev;
  fuente: FuenteCanonica;
  /** Version del estado que se esta dibujando. */
  version: number;
  vista: string;
  estado: EstadoDeColapso;
  paso: number;
  avisar(texto: string): void;
  duracionMs?: number;
}

/** Devuelve los ids del lienzo de la Vista activa que se resaltan ahora. */
export function useDiferenciasExternas(opciones: OpcionesDeDiferenciasExternas): string[] {
  const { cliente, fuente, version, vista, estado, paso, duracionMs = DURACION_DEL_RESALTADO_MS } = opciones;
  const { almacen, instantanea } = useDiferencias(cliente);
  const vivas = useRef(opciones);
  vivas.current = opciones;

  const hayPendientes = instantanea.pendientes.some((d) => d.version <= version);
  useEffect(() => {
    if (!hayPendientes) return;
    const ahora = Date.now();
    for (const diferencia of almacen.tomarPendientes(version)) {
      const contexto = { vista, estado, paso };
      let tema: string | undefined;
      almacen.actualizar((r) => {
        const unido = unirDiferencia(r, diferencia, { ...contexto, fuente, ahora, duracionMs });
        tema = unido.temaDeLaVista;
        return unido;
      });
      if (tema !== undefined) vivas.current.avisar(`El Tema ${tema} de esta Vista cambio por fuera`);
    }
    // Solo cuando hay Diferencias listas; la Vista y el Paso se leen de este render.
  }, [hayPendientes, version, almacen]);

  useEffect(() => almacen.actualizar((r) => visitarVista(r, vista)), [almacen, vista]);

  const { lienzo } = instantanea.resaltado;
  useCaducidad(lienzo.length === 0 ? undefined : Math.min(...lienzo.map((e) => e.hasta)) - Date.now(), () => almacen.actualizar((r) => vencerResaltado(r, Date.now())), lienzo);

  return useMemo(
    () => (lienzo.length === 0 ? [] : proyectarDiferencia(lienzo.map((e) => e.elemento), fuente, { vista, estado, paso }).lienzo),
    [lienzo, fuente, vista, estado, paso],
  );
}

const comoValorCss = (id: string): string => `"${id.replace(/["\\]/g, (c) => `\\${c}`).replace(/\n/g, '\\a ')}"`;

/** Halo sobre lo resaltado y su anuncio (`status`). */
export function ResaltadoDelLienzo({ ids }: { ids: readonly string[] }): ReactElement {
  const css = ids.map((id) => `.ui-lienzo .rd-caja[data-id=${comoValorCss(id)}], .ui-lienzo [data-edge=${comoValorCss(id)}]`).join(',\n');
  return (
    <>
      {ids.length > 0 && <style data-resaltado-externo="">{`${css} { filter: drop-shadow(0 0 4px var(--ui-agente)) drop-shadow(0 0 10px var(--ui-agente-halo)); }`}</style>}
      <div role="status" aria-label="Resaltado del lienzo" className="ui-solo-lector">
        <ul>
          {ids.map((id) => (
            <li key={id}>{id}</li>
          ))}
        </ul>
      </div>
    </>
  );
}

/** Punto "cambio externo" del indice y la galeria. */
export function MarcaExterna(): ReactElement {
  return <span role="img" aria-label="cambio externo" title="Cambio externo" className="ui-marca-externa" />;
}

/** Vistas marcadas en el indice y Temas en la galeria (solo lectura). */
export function useMarcasExternas(cliente: ClienteDeDev): { vistas: ReadonlySet<string>; temas: ReadonlySet<string> } {
  const { resaltado } = useDiferencias(cliente).instantanea;
  return useMemo(() => ({ vistas: new Set(resaltado.indice), temas: new Set(resaltado.temas) }), [resaltado.indice, resaltado.temas]);
}
