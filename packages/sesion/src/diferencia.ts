/**
 * Diferencia (CONTEXT.md): lo que cambio entre dos Fuentes canonicas, elemento por elemento. Pura; aparte de
 * `clasificarCambio`, que decide como redibujar. Los tipos, la identidad (`claveDeElemento`) y el esquema viven en
 * `canonico` (`dev.ts`), que comparten `estudio` y `cli`.
 * Invariantes: no detecta renombres (un renombre es un quitado mas un agregado); cada cambiado lleva sus propiedades
 * cambiadas etiquetadas `texto` (etiqueta, descripcion, texto del Mensaje) o `estructura` (lo demas). Orden estable:
 * por tipo de elemento y, dentro, por orden de declaracion.
 */
import { aplanarMensajes, claveDeElemento } from 'canonico';
import type { Arista, Diferencia, ElementoCambiado, ElementoDeDiferencia, FuenteCanonica, Nodo, PropiedadCambiada } from 'canonico';

interface Comparable {
  elemento: ElementoDeDiferencia;
  /** Propiedad -> valor; se comparan por JSON. */
  valores: Record<string, unknown>;
}

const TEXTO = new Set(['title', 'description', 'label', 'notes']);

const aplanarNodos = (nodos: readonly Nodo[]): Nodo[] => nodos.flatMap((n) => [n, ...aplanarNodos(n.children)]);

function elementosDe(fuente: FuenteCanonica): Comparable[] {
  const nodos = aplanarNodos(fuente.model.nodes);
  const porPar = new Map<string, number>();
  const arista = (a: Arista): Comparable => {
    const par = `${a.from.node}->${a.to.node}`;
    const ordinal = porPar.get(par) ?? 0;
    porPar.set(par, ordinal + 1);
    return {
      elemento: { tipo: 'arista', from: a.from.node, to: a.to.node, ordinal },
      valores: { label: a.label, from: a.from.attribute, to: a.to.attribute, fromCardinality: a.fromCardinality, toCardinality: a.toCardinality, identifying: a.identifying },
    };
  };
  const interacciones = fuente.model.interactions ?? [];
  return [
    ...nodos.map((n): Comparable => ({ elemento: { tipo: 'nodo', id: n.id }, valores: { type: n.type, title: n.title, description: n.description, source: n.source } })),
    ...nodos.flatMap((n) =>
      n.attributes.map((a): Comparable => ({ elemento: { tipo: 'atributo', nodo: n.id, name: a.name }, valores: { type: a.type, notes: a.notes, keys: a.keys, optional: a.optional } })),
    ),
    ...fuente.model.edges.map(arista),
    ...interacciones.map((i): Comparable => ({ elemento: { tipo: 'interaccion', id: i.id }, valores: { title: i.title, description: i.description } })),
    ...interacciones.flatMap((i) =>
      aplanarMensajes(i.items).map((m, posicion): Comparable => ({
        elemento: { tipo: 'mensaje', interaccion: i.id, ...(m.id !== undefined && { id: m.id }), posicion, ruta: m.ubicacion.filter((p) => typeof p === 'number').join('.') },
        valores: { kind: m.kind, from: m.from, to: m.to, label: m.label, description: m.description },
      })),
    ),
    ...fuente.views.map(({ id, ...resto }): Comparable => ({ elemento: { tipo: 'vista', id }, valores: resto })),
    ...fuente.themes.map(({ name, ...resto }): Comparable => ({ elemento: { tipo: 'tema', name }, valores: resto })),
  ];
}

const igual = (a: unknown, b: unknown): boolean => JSON.stringify(a) === JSON.stringify(b);

/** Lo que cambia de `antes` a `despues`. */
export function diferenciar(antes: FuenteCanonica, despues: FuenteCanonica): Diferencia {
  const previos = new Map(elementosDe(antes).map((c) => [claveDeElemento(c.elemento), c]));
  const actuales = elementosDe(despues);
  const vigentes = new Set(actuales.map((c) => claveDeElemento(c.elemento)));
  const agregados: ElementoDeDiferencia[] = [];
  const cambiados: ElementoCambiado[] = [];
  for (const actual of actuales) {
    const previo = previos.get(claveDeElemento(actual.elemento));
    if (previo === undefined) {
      agregados.push(actual.elemento);
      continue;
    }
    const nombres = [...new Set([...Object.keys(actual.valores), ...Object.keys(previo.valores)])];
    const propiedades = nombres
      .filter((nombre) => !igual(actual.valores[nombre], previo.valores[nombre]))
      .map((nombre): PropiedadCambiada => ({ nombre, clase: TEXTO.has(nombre) ? 'texto' : 'estructura' }));
    if (propiedades.length > 0) cambiados.push({ elemento: actual.elemento, propiedades });
  }
  const quitados = [...previos.entries()].filter(([clave]) => !vigentes.has(clave)).map(([, c]) => c.elemento);
  return { agregados, quitados, cambiados };
}
