/**
 * Uso de la Capa `code` en un Tema (ADR 0008): que Componentes de Tema nombra y con
 * que parametros. Es lo que `inspect` y `validate` marcan como "Tema con codigo".
 * Recorre la cascada completa (base, cada Tipo, cada estado y sus combinaciones),
 * asi un componente que solo aparece en un parche tambien cuenta. Puro.
 */
import type { Tema } from 'canonico';

import { cascada, ESTADOS } from './parches';
import type { Estado, OpDeCapa } from './parches';
import { resolverTema } from './tema';

/** Un uso de un componente: el nombre y los parametros declarados (todo menos `component`). */
export interface UsoDeComponente {
  nombre: string;
  parametros: Readonly<Record<string, number | string>>;
}

/** Usos de `code` del Tema, sin repetidos, ordenados por nombre y parametros. `vista` son los parches de una Vista. */
export function usosDeCodigo(tema: Tema, vista?: readonly OpDeCapa[]): UsoDeComponente[] {
  const resuelto = resolverTema(tema);
  const tipos: Array<string | undefined> = [undefined, ...Object.keys(resuelto.nodo.tipos)];
  const estados: Array<Estado | undefined> = [undefined, ...ESTADOS.filter((e) => resuelto.nodo.estados[e] !== undefined)];
  const usos = new Map<string, UsoDeComponente>();
  for (const tipo of tipos) {
    for (const estado of estados) {
      const pila = cascada(resuelto, { ...(tipo !== undefined && { tipo }), ...(estado !== undefined && { estado }), ...(vista !== undefined && { vista }) });
      for (const capa of pila) {
        if (capa.primitiva.tipo !== 'code') continue;
        const { component, ...parametros } = capa.primitiva.props;
        const uso = { nombre: String(component), parametros };
        usos.set(JSON.stringify(uso), uso);
      }
    }
  }
  return [...usos.values()].sort((a, b) => a.nombre.localeCompare(b.nombre) || JSON.stringify(a.parametros).localeCompare(JSON.stringify(b.parametros)));
}

/** Nombres de los componentes que el Tema usa, sin repetir y ordenados; vacio si el Tema no tiene codigo. */
export const componentesDeTema = (tema: Tema, vista?: readonly OpDeCapa[]): string[] => [...new Set(usosDeCodigo(tema, vista).map((uso) => uso.nombre))].sort();
