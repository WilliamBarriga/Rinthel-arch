/**
 * Drill-down por `link` (CONTEXT.md): la Vista activa y la ruta recorrida
 * (breadcrumbs) son controlables por props o internas. No hay jerarquia de
 * Vistas: la ruta es una lista de ids que admite repetidos (ciclos).
 */
import type { ReactElement } from 'react';

import { useControlado } from './controlado';

export interface PropsDeNavegacion {
  /** Vista activa controlada; sin ella manda el ultimo elemento de la ruta. */
  view?: string | undefined;
  /** Vista inicial cuando ni `view` ni `path` se dan. */
  defaultView?: string | undefined;
  /** Ruta de Vistas recorridas controlada; la ultima es la activa. */
  path?: readonly string[] | undefined;
  /** El usuario navega: la Vista que pasa a ser activa. */
  onViewChange?: ((vista: string) => void) | undefined;
  /** El usuario navega: la ruta que resulta. */
  onPathChange?: ((ruta: string[]) => void) | undefined;
}

export interface Navegacion {
  /** Vista activa. */
  vista: string;
  /** Ruta vigente, siempre no vacia y terminada en `vista`. */
  ruta: readonly string[];
  /** Un `link` lleva a `destino`: se agrega a la ruta. */
  ir: (destino: string) => void;
  /** Vuelve a la Vista anterior de la ruta (no hace nada si solo hay una). */
  atras: () => void;
  /** Vuelve a la posicion `indice` de la ruta, descartando lo posterior. */
  irA: (indice: number) => void;
}

/** Concilia la ruta con la Vista activa: si difieren, trunca hasta ella o la agrega. */
function conciliar(ruta: readonly string[], vista: string): readonly string[] {
  if (ruta[ruta.length - 1] === vista) return ruta;
  const indice = ruta.lastIndexOf(vista);
  return indice >= 0 ? ruta.slice(0, indice + 1) : [...ruta, vista];
}

export function useNavegacion(props: PropsDeNavegacion): Navegacion {
  const inicial = props.view ?? props.path?.[props.path.length - 1] ?? props.defaultView;
  if (inicial === undefined) throw new Error('VistaInteractiva requiere `view`, `path` o `defaultView`');
  const rutaControlada = props.path !== undefined && props.path.length > 0 ? props.path : undefined;
  const [base, fijar] = useControlado<readonly string[]>(rutaControlada, [inicial], (nueva) => {
    props.onPathChange?.([...nueva]);
    props.onViewChange?.(nueva[nueva.length - 1]!);
  });
  const vista = props.view ?? base[base.length - 1]!;
  const ruta = conciliar(base, vista);

  return {
    vista,
    ruta,
    ir: (destino) => fijar([...ruta, destino]),
    atras: () => {
      if (ruta.length > 1) fijar(ruta.slice(0, -1));
    },
    irA: (indice) => {
      if (indice >= 0 && indice < ruta.length - 1) fijar(ruta.slice(0, indice + 1));
    },
  };
}

/** Boton atras y breadcrumbs (la Vista activa es el ultimo, sin boton). */
export function Migas({ navegacion }: { navegacion: Navegacion }): ReactElement {
  const { ruta, atras, irA } = navegacion;
  return (
    <nav
      data-breadcrumbs
      aria-label="Ruta"
      style={{ position: 'absolute', left: 8, top: 8, display: 'flex', gap: 6, alignItems: 'center', font: '12px sans-serif' }}
    >
      <button type="button" aria-label="Atras" disabled={ruta.length <= 1} onClick={atras}>
        &lt;
      </button>
      {ruta.map((id, i) =>
        i === ruta.length - 1 ? (
          <span key={i} data-crumb={id} aria-current="page">
            {id}
          </span>
        ) : (
          <span key={i} style={{ display: 'contents' }}>
            <button type="button" data-crumb={id} onClick={() => irA(i)}>
              {id}
            </button>
            <span aria-hidden>/</span>
          </span>
        ),
      )}
    </nav>
  );
}
