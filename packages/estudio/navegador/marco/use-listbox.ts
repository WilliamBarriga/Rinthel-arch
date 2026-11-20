/**
 * Listbox navegable del chrome (indice de Vistas, galeria de Temas): el foco queda en el `listbox` y la opcion activa se
 * anuncia con `aria-activedescendant`. Flechas, Inicio y Fin mueven la opcion activa; Enter o Espacio la eligen, igual
 * que un clic. Con `eligeAlMover` la eleccion sigue al foco (cada flecha elige). La opcion activa vuelve a la elegida
 * cuando esta cambia desde fuera. Quien llama pone `role="group"` y el contenido de cada opcion.
 */
import { useEffect, useState } from 'react';
import type { HTMLAttributes, KeyboardEvent } from 'react';

export interface OpcionesDelListbox {
  /** Nombre accesible del `listbox`. */
  nombre: string;
  /** Prefijo de los `id` de las opciones (unico en la pagina). */
  prefijo: string;
  /** Ids de las opciones en el orden en que se recorren. */
  orden: readonly string[];
  /** Opcion elegida (`aria-selected`), o `undefined`. */
  elegida: string | undefined;
  elegir(id: string): void;
  eligeAlMover?: boolean;
}

export interface Listbox {
  listbox: HTMLAttributes<HTMLDivElement>;
  opcion(id: string, nombre?: string): HTMLAttributes<HTMLDivElement> & { id: string };
}

const SIGUIENTE: Record<string, (i: number, n: number) => number> = {
  ArrowDown: (i, n) => Math.min(n - 1, i + 1),
  ArrowUp: (i) => Math.max(0, i - 1),
  Home: () => 0,
  End: (_, n) => n - 1,
};

export function useListbox({ nombre, prefijo, orden, elegida, elegir, eligeAlMover = false }: OpcionesDelListbox): Listbox {
  const [cursor, setCursor] = useState<string>();
  useEffect(() => setCursor(undefined), [elegida]);
  const activa = cursor !== undefined && orden.includes(cursor) ? cursor : elegida;
  const idDe = (id: string): string => `${prefijo}-${id}`;

  const alTeclear = (e: KeyboardEvent<HTMLDivElement>): void => {
    if ((e.key === 'Enter' || e.key === ' ') && activa !== undefined) {
      e.preventDefault();
      elegir(activa);
      return;
    }
    const mover = SIGUIENTE[e.key];
    if (mover === undefined || orden.length === 0) return;
    e.preventDefault();
    const destino = orden[mover(activa === undefined ? -1 : orden.indexOf(activa), orden.length)]!;
    setCursor(destino);
    if (eligeAlMover && destino !== elegida) elegir(destino);
    document.getElementById(idDe(destino))?.scrollIntoView?.({ block: 'nearest' });
  };

  return {
    listbox: { role: 'listbox', 'aria-label': nombre, tabIndex: 0, onKeyDown: alTeclear, ...(activa !== undefined && { 'aria-activedescendant': idDe(activa) }) },
    opcion: (id, etiqueta = id) => ({
      id: idDe(id),
      role: 'option',
      'aria-label': etiqueta,
      'aria-selected': id === elegida,
      ...(id === activa && { 'data-activa': '' }),
      onClick: () => {
        setCursor(id);
        elegir(id);
      },
    }),
  };
}
