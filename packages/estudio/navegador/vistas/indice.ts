/** Indice de Vistas, sin DOM: agrupadas por Tipo de diagrama y con sus Enlaces (`link`) entre Vistas. */
import { TIPOS_DE_VISTA } from 'canonico';
import type { FuenteCanonica, Vista } from 'canonico';

export interface EntradaDelIndice {
  id: string;
  tipo: Vista['type'];
  /** Vistas a las que enlaza esta (sin repetir, en orden de declaracion de los `link`). */
  enlaces: string[];
  /** Vistas que enlazan a esta. */
  entrantes: string[];
}

export interface GrupoDelIndice {
  tipo: Vista['type'];
  vistas: EntradaDelIndice[];
}

/** Orden fijo de los grupos (`TIPOS_DE_VISTA`); se omiten los Tipos sin Vistas. */
export function indiceDeVistas(fuente: FuenteCanonica): GrupoDelIndice[] {
  const existentes = new Set(fuente.views.map((v) => v.id));
  const enlacesDe = (vista: Vista): string[] => [...new Set(vista.links.map((l) => l.view).filter((v) => existentes.has(v) && v !== vista.id))];
  const salientes = new Map(fuente.views.map((v) => [v.id, enlacesDe(v)]));
  const entrada = (vista: Vista): EntradaDelIndice => ({
    id: vista.id,
    tipo: vista.type,
    enlaces: salientes.get(vista.id) ?? [],
    entrantes: fuente.views.filter((otra) => salientes.get(otra.id)?.includes(vista.id) === true).map((otra) => otra.id),
  });
  return TIPOS_DE_VISTA.map((tipo) => ({ tipo, vistas: fuente.views.filter((v) => v.type === tipo).map(entrada) })).filter((g) => g.vistas.length > 0);
}

/** Vistas del indice en el orden en que se recorren con las flechas. */
export const ordenDelIndice = (grupos: readonly GrupoDelIndice[]): string[] => grupos.flatMap((g) => g.vistas.map((v) => v.id));
