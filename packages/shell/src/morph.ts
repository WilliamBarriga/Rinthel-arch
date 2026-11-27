/** Morph entre dos geometrias: interpolacion pura y el hook que la anima; sin reloj, o con duracion 0, no hay animacion. */
import { useCallback, useEffect, useState } from 'react';

import type { NodeBox, Geometry, GraphGeometry, SequenceGeometry, EdgeRoute, Visibility } from 'canonical';

/** Pide un cuadro (`cuadro` recibe el tiempo en ms) y devuelve la funcion que lo cancela. */
export type RelojDeCuadros = (cuadro: (ahoraMs: number) => void) => () => void;

/** Reloj de `requestAnimationFrame`, o `undefined` si el entorno no lo tiene. */
export function relojDelNavegador(): RelojDeCuadros | undefined {
  return typeof requestAnimationFrame === 'function' ? relojDeRaf : undefined;
}

/** Una sola funcion para todos los renders: `useMorph` la usa como dependencia de un efecto y, si cambiara de identidad, reiniciaria el morph en cada cuadro. */
const relojDeRaf: RelojDeCuadros = (cuadro) => {
  const id = requestAnimationFrame(cuadro);
  return () => cancelAnimationFrame(id);
};

export interface Morph {
  desde: Geometry;
  hasta: Geometry;
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

export function mezclarCaja(a: NodeBox, b: NodeBox, t: number): NodeBox {
  return { x: mezcla(a.x, b.x, t), y: mezcla(a.y, b.y, t), width: mezcla(a.width, b.width, t), height: mezcla(a.height, b.height, t) };
}

function mezclarRuta(a: EdgeRoute, b: EdgeRoute, t: number): EdgeRoute {
  if (a.points.length !== b.points.length) return b;
  return { points: b.points.map((p, i) => ({ x: mezcla(a.points[i]!.x, p.x, t), y: mezcla(a.points[i]!.y, p.y, t) })) };
}

/**
 * Geometria intermedia entre `desde` (t = 0) y `hasta` (t = 1). Lo que existe
 * en las dos se interpola; lo que solo existe en `hasta` queda en su sitio final
 * (`visibilidadDeMorph` lo funde); las rutas con distinto numero de puntos saltan
 * a la nueva.
 */
export function interpolarGeometria(desde: Geometry, hasta: Geometry, t: number): Geometry {
  switch (hasta.kind) {
    case 'grafo':
      return desde.kind === 'grafo' ? interpolarGrafo(desde, hasta, t) : hasta;
    case 'secuencia':
      return desde.kind === 'secuencia' ? interpolarSecuencia(desde, hasta, t) : hasta;
  }
}

/**
 * Secuencia: las cabeceras, las lineas de las Lifelines, las activaciones (si no cambia su numero), las flechas de los
 * Mensajes y los `box` de los Grupos se interpolan; lo demas (marcos, Notas, etiquetas) salta a la posicion final.
 */
function interpolarSecuencia(desde: SequenceGeometry, hasta: SequenceGeometry, t: number): SequenceGeometry {
  const nodes: SequenceGeometry['nodes'] = {};
  for (const [id, caja] of Object.entries(hasta.nodes)) {
    const previa = desde.nodes[id];
    nodes[id] = previa === undefined ? caja : mezclarCaja(previa, caja, t);
  }
  const lifelines: SequenceGeometry['lifelines'] = {};
  for (const [id, linea] of Object.entries(hasta.lifelines)) {
    const previa = desde.lifelines[id];
    lifelines[id] = previa === undefined ? linea : { ...linea, x: mezcla(previa.x, linea.x, t), y1: mezcla(previa.y1, linea.y1, t), y2: mezcla(previa.y2, linea.y2, t) };
  }
  const activations = hasta.activations.map((activacion, i) => {
    const previa = desde.activations[i];
    if (desde.activations.length !== hasta.activations.length || previa === undefined || previa.lifeline !== activacion.lifeline) return activacion;
    return { ...activacion, x: mezcla(previa.x, activacion.x, t), y1: mezcla(previa.y1, activacion.y1, t), y2: mezcla(previa.y2, activacion.y2, t) };
  });
  const messages: SequenceGeometry['messages'] = {};
  for (const [ruta, mensaje] of Object.entries(hasta.messages)) {
    const previo = desde.messages[ruta];
    const mismos = previo !== undefined && previo.points.length === mensaje.points.length;
    messages[ruta] = mismos
      ? {
          ...mensaje,
          points: mensaje.points.map((p, i) => ({ x: mezcla(previo.points[i]!.x, p.x, t), y: mezcla(previo.points[i]!.y, p.y, t) })),
          ...(mensaje.label !== undefined && previo.label !== undefined && { label: mezclarCaja(previo.label, mensaje.label, t) }),
        }
      : mensaje;
  }
  const groups = hasta.groups.map((grupo) => {
    const previo = desde.groups.find((g) => g.id === grupo.id);
    return previo === undefined ? grupo : { ...grupo, x: mezcla(previo.x, grupo.x, t), y: mezcla(previo.y, grupo.y, t), width: mezcla(previo.width, grupo.width, t), height: mezcla(previo.height, grupo.height, t) };
  });
  return { ...hasta, nodes, lifelines, activations, messages, groups, width: mezcla(desde.width, hasta.width, t), height: mezcla(desde.height, hasta.height, t) };
}

function interpolarGrafo(desde: GraphGeometry, hasta: GraphGeometry, t: number): GraphGeometry {
  const nodes: Record<string, NodeBox> = {};
  for (const [id, caja] of Object.entries(hasta.nodes)) {
    const previa = desde.nodes[id];
    nodes[id] = previa === undefined ? caja : mezclarCaja(previa, caja, t);
  }
  const edges: Record<string, EdgeRoute> = {};
  for (const [id, ruta] of Object.entries(hasta.edges)) {
    const previa = desde.edges[id];
    edges[id] = previa === undefined ? ruta : mezclarRuta(previa, ruta, t);
  }
  return { ...hasta, nodes, edges, width: mezcla(desde.width, hasta.width, t), height: mezcla(desde.height, hasta.height, t) };
}

/** Visibilidad durante el morph: lo que no estaba en `desde` entra con fundido `t`; el resto manda `base` (o 1). */
export function visibilidadDeMorph(desde: Geometry, hasta: Geometry, t: number, base?: Visibility): Visibility {
  return (id) => {
    const previa = base?.(id) ?? 1;
    const aristaNueva = hasta.kind === 'grafo' && desde.kind === 'grafo' && hasta.edges[id] !== undefined && desde.edges[id] === undefined;
    const nuevo = (hasta.nodes[id] !== undefined && desde.nodes[id] === undefined) || aristaNueva;
    return nuevo ? previa * t : previa;
  };
}
