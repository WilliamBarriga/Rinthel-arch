/**
 * Parches por nombre de Capa y cascada de cuatro niveles (ADR 0008): Tema base,
 * Tipo de nodo, estado y override de la Vista; el ultimo gana. Un parche
 * cambia una Capa existente, la anade (con `before`/`after`) o la quita
 * (`none`); nunca se dirige por indice. Puro y determinista.
 */
import { CODIGOS } from 'canonico';

import { CATALOGO, construirPrimitiva, sugerir } from './catalogo';
import type { DefinicionDePrimitiva, ErrorDeCatalogo, Primitiva, UbicacionDePrimitiva } from './catalogo';
import type { TemaResuelto } from './tema';

/** Estados de la cascada; `foco` y `en-ruta` los calcula la shell, el Tema solo decide como se ven. */
export const ESTADOS = ['hover', 'seleccionado', 'fantasma', 'en-ruta', 'atenuado', 'foco'] as const;
export type Estado = (typeof ESTADOS)[number];

/** Capa de la pila de un Nodo: instancia de una Primitiva, bajo el contenido salvo `encima`. */
export interface CapaDeTema {
  nombre: string;
  primitiva: Primitiva;
  encima?: true;
}

/** Un parche de Capa tal como se escribe: ya con `$token` resueltos y la Capa por nombre. */
export interface OpDeCapa {
  nombre: string;
  quitar?: true;
  /** Si se da, sustituye la Primitiva de la Capa; si no, `props` se mezcla sobre las vigentes. */
  primitiva?: string;
  props: Record<string, string | number>;
  antes?: string;
  despues?: string;
  encima?: true;
}

export interface ErrorDeOp extends ErrorDeCatalogo {
  /** Posicion del parche en la lista aplicada. */
  indice: number;
  /** Que parte del parche es la culpable: su nombre o el destino de `before`/`after`. */
  donde: 'nombre' | 'ubicacion' | 'propiedad';
  /** Capa de la pila que el parche toca, para `related` (ADR 0005). */
  base?: string;
}

/**
 * `definir` deja anadir Capas nuevas al final sin ubicacion (el primer bloque de un
 * Tema sin base); `parchear` exige `before`/`after` para toda Capa nueva.
 */
export type ModoDeParche = 'definir' | 'parchear';

export function aplicarOps(
  pila: readonly CapaDeTema[],
  ops: readonly OpDeCapa[],
  paleta: Readonly<Record<string, string>>,
  modo: ModoDeParche,
  ubicacion: UbicacionDePrimitiva = 'capa-nodo',
): { pila: CapaDeTema[]; errores: ErrorDeOp[] } {
  const capas = pila.map((c) => ({ ...c, primitiva: { ...c.primitiva, props: { ...c.primitiva.props } } }));
  const errores: ErrorDeOp[] = [];
  const indiceDe = (nombre: string): number => capas.findIndex((c) => c.nombre === nombre);
  const nombres = (): string[] => capas.map((c) => c.nombre);

  ops.forEach((op, indice) => {
    const falla = (e: ErrorDeCatalogo, donde: ErrorDeOp['donde'], base?: string): void => {
      errores.push({ ...e, indice, donde, ...(base !== undefined && { base }) });
    };
    const actual = indiceDe(op.nombre);

    if (op.quitar === true) {
      if (actual < 0) {
        falla({ codigo: CODIGOS.E_THEME_UNKNOWN_LAYER, mensaje: `No se puede quitar la Capa '${op.nombre}': no existe`, ...sugerir(op.nombre, nombres()) }, 'nombre');
      } else capas.splice(actual, 1);
      return;
    }

    const lado = op.antes !== undefined ? 'antes' : op.despues !== undefined ? 'despues' : undefined;
    const destino = op.antes ?? op.despues;
    if (destino !== undefined && (indiceDe(destino) < 0 || destino === op.nombre)) {
      falla(
        {
          codigo: CODIGOS.E_THEME_UNKNOWN_LAYER,
          mensaje: destino === op.nombre ? `La Capa '${op.nombre}' no puede ubicarse respecto de si misma` : `${lado === 'antes' ? 'before' : 'after'} '${destino}': esa Capa no existe`,
          ...sugerir(destino, nombres().filter((n) => n !== op.nombre)),
        },
        'ubicacion',
        actual >= 0 ? op.nombre : undefined,
      );
      return;
    }

    const existente = actual >= 0 ? capas[actual] : undefined;
    if (existente === undefined && destino === undefined && modo === 'parchear') {
      falla(
        {
          codigo: CODIGOS.E_THEME_PATCH_WITHOUT_PLACEMENT,
          mensaje: `La Capa '${op.nombre}' no existe; para anadirla indica 'before' o 'after' de otra Capa`,
          ...sugerir(op.nombre, nombres()),
        },
        'nombre',
      );
      return;
    }
    if (existente === undefined && op.primitiva === undefined) {
      falla({ codigo: CODIGOS.E_THEME_INVALID_VALUE, mensaje: `La Capa nueva '${op.nombre}' exige una Primitiva` }, 'nombre');
      return;
    }

    const tipo = op.primitiva ?? existente?.primitiva.tipo ?? '';
    const props = Object.entries(op.primitiva === undefined ? { ...existente?.primitiva.props, ...op.props } : op.props).map(([clave, valor]) => ({ clave, valor }));
    const { primitiva, errores: delCatalogo } = construirPrimitiva(tipo, props, paleta, ubicacion);
    for (const e of delCatalogo) falla(e, e.clave === undefined ? 'nombre' : 'propiedad', existente?.nombre);
    if (primitiva === undefined) return;

    const encima = op.encima === true || existente?.encima === true;
    const nueva: CapaDeTema = { nombre: op.nombre, primitiva, ...(encima && { encima: true as const }) };
    if (existente !== undefined) capas.splice(actual, 1);
    const sitio = destino === undefined ? (actual >= 0 ? actual : capas.length) : indiceDe(destino) + (lado === 'despues' ? 1 : 0);
    capas.splice(sitio, 0, nueva);
  });
  return { pila: capas, errores };
}

/**
 * Valida una lista de parches contra varias pilas posibles (un parche de estado
 * o de Vista se aplica sobre la pila de cada Tipo): devuelve los errores de la
 * pila que mejor los admite, de modo que un parche valido para algun Tipo no
 * se rechaza por otro.
 */
export function validarOps(
  candidatas: ReadonlyArray<readonly CapaDeTema[]>,
  ops: readonly OpDeCapa[],
  paleta: Readonly<Record<string, string>>,
  modo: ModoDeParche,
  ubicacion: UbicacionDePrimitiva = 'capa-nodo',
): ErrorDeOp[] {
  let mejor: ErrorDeOp[] | undefined;
  for (const pila of candidatas) {
    const { errores } = aplicarOps(pila, ops, paleta, modo, ubicacion);
    if (mejor === undefined || errores.length < mejor.length) mejor = errores;
    if (mejor.length === 0) break;
  }
  return mejor ?? [];
}

/**
 * Pila de Capas tras la cascada: Tema base, Tipo de nodo, estado, override de la
 * Vista; el ultimo gana. Un parche que no encuentra su Capa en esta pila (p. ej.
 * una Capa que solo anade otro Tipo) no aplica a ella: `validate` ya lo acepto
 * por existir en alguna.
 */
export function cascada(tema: Pick<TemaResuelto, 'palette' | 'nodo'>, nivel: { tipo?: string; estado?: Estado; vista?: readonly OpDeCapa[] } = {}): CapaDeTema[] {
  const aplicar = (pila: CapaDeTema[], ops: readonly OpDeCapa[] | undefined): CapaDeTema[] =>
    ops === undefined || ops.length === 0 ? pila : aplicarOps(pila, ops, tema.palette, 'parchear').pila;
  const porTipo = aplicar(tema.nodo.capas as CapaDeTema[], nivel.tipo === undefined ? undefined : tema.nodo.tipos[nivel.tipo]);
  const porEstado = aplicar(porTipo, nivel.estado === undefined ? undefined : tema.nodo.estados[nivel.estado]);
  return aplicar(porEstado, nivel.vista);
}

/**
 * Por que un parche de estado toca las Metricas, o `undefined` si solo pinta. Toca si
 * introduce una Primitiva que afecta a las Metricas (p. ej. `circle`) o si cambia o
 * quita una Capa cuya Primitiva las afecta. `pilas` son las pilas posibles sobre las
 * que se aplica (base y una por Tipo).
 */
export function opTocaMetricas(op: OpDeCapa, pilas: ReadonlyArray<readonly CapaDeTema[]>): string | undefined {
  const existente = pilas.flatMap((pila) => pila.filter((capa) => capa.nombre === op.nombre))[0];
  const afecta = (tipo: string | undefined): boolean => tipo !== undefined && ((CATALOGO as Record<string, DefinicionDePrimitiva>)[tipo]?.afectaMetricas ?? false);
  if (op.quitar === true) return afecta(existente?.primitiva.tipo) ? `la Capa '${op.nombre}' define la caja y no puede quitarse` : undefined;
  const nuevo = op.primitiva ?? existente?.primitiva.tipo;
  if (afecta(nuevo)) return `la Capa '${op.nombre}' usa '${nuevo}', que afecta a las Metricas`;
  return afecta(existente?.primitiva.tipo) ? `la Capa '${op.nombre}' sustituye una forma que define la caja` : undefined;
}
