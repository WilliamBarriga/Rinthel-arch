/**
 * Reordenar Lifelines por arrastre (ADR 0009): puro y sobre la `GeometriaSecuencia`. `unidadBajo` dice que se
 * agarra (una Lifeline por su cabecera, o un bloque: el titulo de un `box` o la Lifeline propia de un Grupo abierto)
 * y `ordenTrasArrastrar` el orden visible que resulta de soltarla `dx` mas alla. Una unidad solo se mueve entre sus
 * hermanas, dentro del `box` que la contiene (la Lifeline propia de ese Grupo se queda primera).
 */
import type { CajaDeGrupo } from 'canonico';
import type { GeometriaSecuencia } from 'layout';

export interface UnidadArrastrada {
  /** Lifeline (o Grupo, si `bloque`) que se agarro. */
  id: string;
  bloque: boolean;
}

const dentro = (c: { x: number; y: number; width: number; height: number }, p: { x: number; y: number }): boolean =>
  p.x >= c.x && p.x <= c.x + c.width && p.y >= c.y && p.y <= c.y + c.height;

/** Que se agarra en `punto`: la cabecera de una Lifeline o el titulo de un `box`; nada si no cae en ninguno. */
export function unidadBajo(g: GeometriaSecuencia, grupos: readonly CajaDeGrupo[], punto: { x: number; y: number }): UnidadArrastrada | undefined {
  for (const [id, caja] of Object.entries(g.nodes)) {
    if (dentro(caja, punto)) return { id, bloque: grupos.some((grupo) => grupo.id === id) };
  }
  const titulo = g.groups.find((grupo) => dentro(grupo.title, punto));
  return titulo === undefined ? undefined : { id: titulo.id, bloque: true };
}

/** Orden visible (ids de izquierda a derecha) tras soltar `unidad` desplazada `dx`; el mismo `orden` si no cambia de sitio. */
export function ordenTrasArrastrar(g: GeometriaSecuencia, grupos: readonly CajaDeGrupo[], orden: readonly string[], unidad: UnidadArrastrada, dx: number): string[] {
  const miembros = unidad.bloque ? (grupos.find((grupo) => grupo.id === unidad.id)?.lifelines ?? [unidad.id]) : [unidad.id];
  // Caja contenedora: el `box` mas interno que abarca la unidad sin ser ella misma.
  const contenedor: CajaDeGrupo | undefined = grupos
    .filter((grupo) => !(unidad.bloque && grupo.id === unidad.id) && miembros.every((m) => grupo.lifelines.includes(m)))
    .sort((a, b) => b.nivel - a.nivel)[0];
  const lista = contenedor?.lifelines ?? orden;
  const inicio = orden.indexOf(lista[0]!);
  const fija = contenedor !== undefined && lista[0] === contenedor.id ? [contenedor.id] : [];
  const movibles = lista.slice(fija.length);

  // Unidades hermanas: cada Lifeline suelta, o cada `box` hijo entero.
  const nivelHijo = contenedor === undefined ? 0 : contenedor.nivel + 1;
  const clave = (id: string): string =>
    grupos.filter((grupo) => grupo.nivel >= nivelHijo && grupo.lifelines.includes(id)).sort((a, b) => a.nivel - b.nivel)[0]?.id ?? id;
  const unidades: string[][] = [];
  for (const id of movibles) {
    const ultima = unidades.at(-1);
    if (ultima !== undefined && clave(ultima[0]!) === clave(id)) ultima.push(id);
    else unidades.push([id]);
  }
  const centroDe = (ids: readonly string[]): number => {
    const cajas = ids.map((id) => g.nodes[id]!);
    return (Math.min(...cajas.map((c) => c.x)) + Math.max(...cajas.map((c) => c.x + c.width))) / 2;
  };
  const agarrada = unidades.find((u) => u.includes(miembros[0]!));
  if (agarrada === undefined) return [...orden];
  const centro = centroDe(agarrada) + dx;
  const otras = unidades.filter((u) => u !== agarrada);
  const destino = otras.findIndex((u) => centroDe(u) > centro);
  otras.splice(destino < 0 ? otras.length : destino, 0, agarrada);
  const nuevaLista = [...fija, ...otras.flat()];
  return [...orden.slice(0, inicio), ...nuevaLista, ...orden.slice(inicio + lista.length)];
}
