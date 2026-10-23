/**
 * Morph entre dos geometrias (ADR 0003): interpolacion pura y el hook que la
 * anima. El reloj entra como dependencia (`RelojDeCuadros`); sin reloj, o con
 * duracion 0, no hay animacion.
 */
import { useCallback, useEffect, useState } from 'react';

import type { Visibilidad } from 'canonico';
import type { CajaDeNodo, Geometria, RutaDeArista } from 'layout';

/**
 * Puerto de reloj: pide un cuadro (`cuadro` recibe el tiempo en ms) y devuelve
 * la funcion que lo cancela. En el navegador es `requestAnimationFrame`.
 */
export type RelojDeCuadros = (cuadro: (ahoraMs: number) => void) => () => void;

/** Reloj de `requestAnimationFrame`, o `undefined` si el entorno no lo tiene. */
export function relojDelNavegador(): RelojDeCuadros | undefined {
  if (typeof requestAnimationFrame !== 'function') return undefined;
  return (cuadro) => {
    const id = requestAnimationFrame(cuadro);
    return () => cancelAnimationFrame(id);
  };
}

export interface Morph {
  desde: Geometria;
  hasta: Geometria;
  /** Grupo tocado, que se mantiene fijo en pantalla. */
  ancla: string;
}

const suavizado = (t: number): number => t * t * (3 - 2 * t);

/** Devuelve el morph en curso con su progreso `t` en 0..1 (ya suavizado), `iniciar` y `cancelar`. */
export function useMorph(
  duracionMs: number,
  reloj: RelojDeCuadros | undefined = relojDelNavegador(),
): {
  morph: (Morph & { t: number }) | undefined;
  iniciar: (morph: Morph) => void;
  cancelar: () => void;
} {
  const [activo, setActivo] = useState<Morph>();
  const [t, setT] = useState(0);
  const iniciar = useCallback(
    (morph: Morph) => {
      if (duracionMs <= 0 || reloj === undefined) return;
      setT(0);
      setActivo(morph);
    },
    [duracionMs, reloj],
  );
  const cancelar = useCallback(() => setActivo(undefined), []);

  useEffect(() => {
    if (activo === undefined || reloj === undefined) return;
    let inicio: number | undefined;
    let cancelarCuadro = (): void => {};
    const paso = (ahora: number): void => {
      inicio ??= ahora;
      const lineal = Math.min(1, (ahora - inicio) / duracionMs);
      if (lineal >= 1) {
        setActivo(undefined);
        return;
      }
      setT(suavizado(lineal));
      cancelarCuadro = reloj(paso);
    };
    cancelarCuadro = reloj(paso);
    return () => cancelarCuadro();
  }, [activo, duracionMs, reloj]);

  return { morph: activo === undefined ? undefined : { ...activo, t }, iniciar, cancelar };
}

const mezcla = (a: number, b: number, t: number): number => a + (b - a) * t;

export function mezclarCaja(a: CajaDeNodo, b: CajaDeNodo, t: number): CajaDeNodo {
  return { x: mezcla(a.x, b.x, t), y: mezcla(a.y, b.y, t), width: mezcla(a.width, b.width, t), height: mezcla(a.height, b.height, t) };
}

function mezclarRuta(a: RutaDeArista, b: RutaDeArista, t: number): RutaDeArista {
  if (a.points.length !== b.points.length) return b;
  return { points: b.points.map((p, i) => ({ x: mezcla(a.points[i]!.x, p.x, t), y: mezcla(a.points[i]!.y, p.y, t) })) };
}

/**
 * Geometria intermedia entre `desde` (t = 0) y `hasta` (t = 1). Lo que existe
 * en las dos se interpola; lo que solo existe en `hasta` queda en su sitio final
 * (`visibilidadDeMorph` lo funde); las rutas con distinto numero de puntos saltan
 * a la nueva.
 */
export function interpolarGeometria(desde: Geometria, hasta: Geometria, t: number): Geometria {
  const nodes: Record<string, CajaDeNodo> = {};
  for (const [id, caja] of Object.entries(hasta.nodes)) {
    const previa = desde.nodes[id];
    nodes[id] = previa === undefined ? caja : mezclarCaja(previa, caja, t);
  }
  const edges: Record<string, RutaDeArista> = {};
  for (const [id, ruta] of Object.entries(hasta.edges)) {
    const previa = desde.edges[id];
    edges[id] = previa === undefined ? ruta : mezclarRuta(previa, ruta, t);
  }
  return { ...hasta, nodes, edges, width: mezcla(desde.width, hasta.width, t), height: mezcla(desde.height, hasta.height, t) };
}

/** Visibilidad durante el morph: lo que no estaba en `desde` entra con fundido `t`; el resto manda `base` (o 1). */
export function visibilidadDeMorph(desde: Geometria, hasta: Geometria, t: number, base?: Visibilidad): Visibilidad {
  return (id) => {
    const previa = base?.(id) ?? 1;
    const nuevo = (hasta.nodes[id] !== undefined && desde.nodes[id] === undefined) || (hasta.edges[id] !== undefined && desde.edges[id] === undefined);
    return nuevo ? previa * t : previa;
  };
}
