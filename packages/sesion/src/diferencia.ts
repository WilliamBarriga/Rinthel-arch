/**
 * Diferencia (CONTEXT.md): lo que cambio entre dos Fuentes canonicas, elemento por elemento. Pura; aparte de
 * `clasificarCambio`, que decide como redibujar. Los tipos, la identidad (`elementKey`) y el esquema viven en
 * `canonical` (`dev.ts`), que comparten `estudio` y `cli`.
 * Invariantes: no detecta renombres (un renombre es un quitado mas un agregado); cada cambiado lleva sus propiedades
 * cambiadas etiquetadas `texto` (etiqueta, descripcion, texto del Mensaje) o `estructura` (lo demas). Orden estable:
 * por tipo de elemento y, dentro, por orden de declaracion.
 */
import { flattenMessages, elementKey } from 'canonical';
import type { Edge, Diff, ChangedElement, DiffElement, CanonicalForm, Node, ChangedProperty } from 'canonical';

interface Comparable {
  elemento: DiffElement;
  /** Propiedad -> valor; se comparan por JSON. */
  valores: Record<string, unknown>;
}

const TEXTO = new Set(['title', 'description', 'label', 'notes']);

const aplanarNodos = (nodos: readonly Node[]): Node[] => nodos.flatMap((n) => [n, ...aplanarNodos(n.children)]);

function elementosDe(fuente: CanonicalForm): Comparable[] {
  const nodos = aplanarNodos(fuente.model.nodes);
  const porPar = new Map<string, number>();
  const arista = (a: Edge): Comparable => {
    const par = `${a.from.node}->${a.to.node}`;
    const ordinal = porPar.get(par) ?? 0;
    porPar.set(par, ordinal + 1);
    return {
      elemento: { kind: 'edge', from: a.from.node, to: a.to.node, ordinal },
      valores: { label: a.label, from: a.from.attribute, to: a.to.attribute, fromCardinality: a.fromCardinality, toCardinality: a.toCardinality, identifying: a.identifying },
    };
  };
  const interacciones = fuente.model.interactions ?? [];
  return [
    ...nodos.map((n): Comparable => ({ elemento: { kind: 'node', id: n.id }, valores: { type: n.type, title: n.title, description: n.description, source: n.source } })),
    ...nodos.flatMap((n) =>
      n.attributes.map((a): Comparable => ({ elemento: { kind: 'attribute', node: n.id, name: a.name }, valores: { type: a.type, notes: a.notes, keys: a.keys, optional: a.optional } })),
    ),
    ...fuente.model.edges.map(arista),
    ...interacciones.map((i): Comparable => ({ elemento: { kind: 'interaction', id: i.id }, valores: { title: i.title, description: i.description } })),
    ...interacciones.flatMap((i) =>
      flattenMessages(i.items).map((m, posicion): Comparable => ({
        elemento: { kind: 'message', interaction: i.id, ...(m.id !== undefined && { id: m.id }), position: posicion, path: m.location.filter((p) => typeof p === 'number').join('.') },
        valores: { kind: m.kind, from: m.from, to: m.to, label: m.label, description: m.description },
      })),
    ),
    ...fuente.views.map(({ id, ...resto }): Comparable => ({ elemento: { kind: 'view', id }, valores: resto })),
    ...fuente.themes.map(({ name, ...resto }): Comparable => ({ elemento: { kind: 'theme', name }, valores: resto })),
  ];
}

const igual = (a: unknown, b: unknown): boolean => JSON.stringify(a) === JSON.stringify(b);

/** Lo que cambia de `antes` a `despues`. */
export function diferenciar(antes: CanonicalForm, despues: CanonicalForm): Diff {
  const previos = new Map(elementosDe(antes).map((c) => [elementKey(c.elemento), c]));
  const actuales = elementosDe(despues);
  const vigentes = new Set(actuales.map((c) => elementKey(c.elemento)));
  const agregados: DiffElement[] = [];
  const cambiados: ChangedElement[] = [];
  for (const actual of actuales) {
    const previo = previos.get(elementKey(actual.elemento));
    if (previo === undefined) {
      agregados.push(actual.elemento);
      continue;
    }
    const nombres = [...new Set([...Object.keys(actual.valores), ...Object.keys(previo.valores)])];
    const propiedades = nombres
      .filter((nombre) => !igual(actual.valores[nombre], previo.valores[nombre]))
      .map((nombre): ChangedProperty => ({ nombre, clase: TEXTO.has(nombre) ? 'texto' : 'estructura' }));
    if (propiedades.length > 0) cambiados.push({ elemento: actual.elemento, propiedades });
  }
  const quitados = [...previos.entries()].filter(([clave]) => !vigentes.has(clave)).map(([, c]) => c.elemento);
  return { agregados, quitados, cambiados };
}
