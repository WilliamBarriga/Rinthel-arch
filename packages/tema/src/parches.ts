/**
 * Parches por nombre de Capa (nunca por indice) y cascada: Tema base, Tipo de diagrama (`temaParaDiagrama`, antes de
 * la cascada), Tipo de nodo, estado y override de la Vista; el ultimo gana.
 */
import { CODES, VIEW_TYPES, nearestCandidates } from 'canonical';

import { CATALOGO, construirPrimitiva, errorDeValorAntiguo, sugerir } from './catalogo';
import type { DefinicionDePrimitiva, ErrorDeCatalogo, Primitiva, UbicacionDePrimitiva } from './catalogo';
import type { TemaResuelto } from './tema';
import type { Animacion } from './animacion';

/**
 * En orden de precedencia (el ultimo gana). `focus` y `on-path` los calcula la shell; `planned` sale del Modelo (marca
 * Planeado, ADR 0011) y va primero: cualquier estado de interaccion se pinta sobre el.
 */
export const ESTADOS = ['planned', 'hover', 'selected', 'ghost', 'on-path', 'dimmed', 'focus'] as const;
export type Estado = (typeof ESTADOS)[number];
/** Los que un Tema distingue con `diagram <tipo> { ... }`. */
export const TIPOS_DE_DIAGRAMA = VIEW_TYPES;
export type TipoDeDiagrama = (typeof VIEW_TYPES)[number];

/** Va bajo el contenido salvo `encima`. */
export interface CapaDeTema {
  nombre: string;
  primitiva: Primitiva;
  encima?: true;
  animacion?: Animacion;
}

/** Con `$token` ya resueltos. */
export interface OpDeCapa {
  nombre: string;
  quitar?: true;
  /** Sustituye la Primitiva; sin ella, `props` se mezcla sobre las vigentes. */
  primitiva?: string;
  props: Record<string, string | number>;
  /** `null` la quita (`motion none`); sin la clave se conserva. */
  animacion?: Animacion | null;
  antes?: string;
  despues?: string;
  encima?: true;
}

export interface ErrorDeOp extends ErrorDeCatalogo {
  indice: number;
  donde: 'nombre' | 'ubicacion' | 'propiedad';
  /** Capa de la pila que el parche toca. */
  base?: string;
}

/** `definir` anade Capas nuevas al final sin ubicacion; `parchear` exige `before`/`after` para toda Capa nueva. */
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
  /** An old built-in Layer name (`borde`) whose new name (`border`) is in the stack: `old-catalog-value` with its fix. */
  const capaAntigua = (nombre: string): ErrorDeCatalogo | undefined => {
    const error = errorDeValorAntiguo('layer', nombre);
    return error?.candidato !== undefined && indiceDe(error.candidato) >= 0 ? error : undefined;
  };

  ops.forEach((op, indice) => {
    const falla = (e: ErrorDeCatalogo, donde: ErrorDeOp['donde'], base?: string): void => {
      errores.push({ ...e, indice, donde, ...(base !== undefined && { base }) });
    };
    const actual = indiceDe(op.nombre);

    if (op.quitar === true) {
      if (actual < 0) {
        falla(capaAntigua(op.nombre) ?? { codigo: CODES.E_THEME_UNKNOWN_LAYER, mensaje: `Cannot remove Layer '${op.nombre}': it does not exist`, ...sugerir(op.nombre, nombres()) }, 'nombre');
      } else capas.splice(actual, 1);
      return;
    }

    const lado = op.antes !== undefined ? 'antes' : op.despues !== undefined ? 'despues' : undefined;
    const destino = op.antes ?? op.despues;
    if (destino !== undefined && (indiceDe(destino) < 0 || destino === op.nombre)) {
      falla(
        (destino === op.nombre ? undefined : capaAntigua(destino)) ?? {
          codigo: CODES.E_THEME_UNKNOWN_LAYER,
          mensaje: destino === op.nombre ? `Layer '${op.nombre}' cannot be placed relative to itself` : `${lado === 'antes' ? 'before' : 'after'} '${destino}': that Layer does not exist`,
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
        capaAntigua(op.nombre) ?? {
          codigo: CODES.E_THEME_PATCH_WITHOUT_PLACEMENT,
          mensaje: `Layer '${op.nombre}' does not exist; to add it, give 'before' or 'after' another Layer`,
          ...sugerir(op.nombre, nombres()),
        },
        'nombre',
      );
      return;
    }
    if (existente === undefined && op.primitiva === undefined) {
      falla({ codigo: CODES.E_THEME_INVALID_VALUE, mensaje: `The new Layer '${op.nombre}' requires a Primitive` }, 'nombre');
      return;
    }

    const tipo = op.primitiva ?? existente?.primitiva.tipo ?? '';
    const props = Object.entries(op.primitiva === undefined ? { ...existente?.primitiva.props, ...op.props } : op.props).map(([clave, valor]) => ({ clave, valor }));
    const { primitiva, errores: delCatalogo } = construirPrimitiva(tipo, props, paleta, ubicacion);
    for (const e of delCatalogo) falla(e, e.clave === undefined ? 'nombre' : 'propiedad', existente?.nombre);
    if (primitiva === undefined) return;

    const encima = op.encima === true || existente?.encima === true;
    const animacion = op.animacion === undefined ? existente?.animacion : (op.animacion ?? undefined);
    const nueva: CapaDeTema = { nombre: op.nombre, primitiva, ...(encima && { encima: true as const }), ...(animacion !== undefined && { animacion }) };
    if (existente !== undefined) capas.splice(actual, 1);
    const sitio = destino === undefined ? (actual >= 0 ? actual : capas.length) : indiceDe(destino) + (lado === 'despues' ? 1 : 0);
    capas.splice(sitio, 0, nueva);
  });
  return { pila: capas, errores };
}

/** Devuelve los errores de la pila que mejor admite los parches: uno valido para algun Tipo no se rechaza por otro. */
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

export type ElementoDeTema = 'nodo' | 'grupo';

/**
 * Orden: base, Tipo de nodo, `colapsado` (solo Grupo), estado, override de la Vista (solo Nodo); el ultimo gana.
 * Un parche cuya Capa no esta en esta pila se ignora.
 */
export function cascada(
  tema: Pick<TemaResuelto, 'palette' | 'nodo' | 'grupo'>,
  nivel: { tipo?: string; estado?: Estado; vista?: readonly OpDeCapa[]; colapsado?: boolean } = {},
  elemento: ElementoDeTema = 'nodo',
): CapaDeTema[] {
  const aplicar = (pila: CapaDeTema[], ops: readonly OpDeCapa[] | undefined): CapaDeTema[] =>
    ops === undefined || ops.length === 0 ? pila : aplicarOps(pila, ops, tema.palette, 'parchear').pila;
  const bloque = tema[elemento];
  const porTipo = aplicar(bloque.capas as CapaDeTema[], nivel.tipo === undefined ? undefined : bloque.tipos[nivel.tipo]);
  const porColapso = elemento === 'grupo' && nivel.colapsado === true ? aplicar(porTipo, tema.grupo.colapsado.ops) : porTipo;
  const porEstado = aplicar(porColapso, nivel.estado === undefined ? undefined : bloque.estados[nivel.estado]);
  return elemento === 'nodo' ? aplicar(porEstado, nivel.vista) : porEstado;
}

/** Motivo por el que un parche de estado toca las Metricas en alguna de `pilas`, o `undefined` si solo pinta. */
export function opTocaMetricas(op: OpDeCapa, pilas: ReadonlyArray<readonly CapaDeTema[]>): string | undefined {
  const existente = pilas.flatMap((pila) => pila.filter((capa) => capa.nombre === op.nombre))[0];
  const afecta = (tipo: string | undefined): boolean => tipo !== undefined && ((CATALOGO as Record<string, DefinicionDePrimitiva>)[tipo]?.afectaMetricas ?? false);
  if (op.quitar === true) return afecta(existente?.primitiva.tipo) ? `Layer '${op.nombre}' defines the box and cannot be removed` : undefined;
  const nuevo = op.primitiva ?? existente?.primitiva.tipo;
  if (afecta(nuevo)) return `Layer '${op.nombre}' uses '${nuevo}', which affects the Metrics`;
  return afecta(existente?.primitiva.tipo) ? `Layer '${op.nombre}' replaces a shape that defines the box` : undefined;
}

export type ResultadoDeEstado =
  | { estado: Estado }
  | { error: { code: typeof CODES.E_THEME_UNKNOWN_STATE | typeof CODES.E_OLD_CATALOG_VALUE; message: string; candidatos: string[] } };

/** Error `theme-unknown-state` con candidatos cercanos si no es de `ESTADOS`; un nombre antiguo es `old-catalog-value` con el nuevo como unico candidato. */
export function parsearEstado(escrito: string): ResultadoDeEstado {
  const estado = ESTADOS.find((e) => e === escrito);
  if (estado !== undefined) return { estado };
  const antiguo = errorDeValorAntiguo('state', escrito);
  if (antiguo?.candidato !== undefined) return { error: { code: CODES.E_OLD_CATALOG_VALUE, message: antiguo.mensaje, candidatos: [antiguo.candidato] } };
  return {
    error: {
      code: CODES.E_THEME_UNKNOWN_STATE,
      message: `Unknown state '${escrito}'; available: ${ESTADOS.join(', ')}`,
      candidatos: nearestCandidates(escrito, ESTADOS),
    },
  };
}
