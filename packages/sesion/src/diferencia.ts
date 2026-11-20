/**
 * Diferencia (CONTEXT.md): lo que cambio entre dos Fuentes canonicas, elemento por elemento. Pura; aparte de
 * `clasificarCambio` de `cli`, que decide como redibujar.
 * Identidades: Nodo por `id`; Atributo por Nodo + `name`; Arista por `from` + `to` (ids de Nodo) + ordinal dentro del
 * mismo par; Interaccion por `id`; Mensaje por `id` o, sin el, por Interaccion + posicion; Vista por `id`; Tema por `name`.
 * Invariantes: no detecta renombres (un renombre es un quitado mas un agregado); cada cambiado lleva sus propiedades
 * cambiadas etiquetadas `texto` (etiqueta, descripcion, texto del Mensaje) o `estructura` (lo demas). Orden estable:
 * por tipo de elemento y, dentro, por orden de declaracion.
 */
import { aplanarMensajes } from 'canonico';
import type { Arista, FuenteCanonica, Nodo } from 'canonico';

export type ElementoDeDiferencia =
  | { tipo: 'nodo'; id: string }
  | { tipo: 'atributo'; nodo: string; name: string }
  | { tipo: 'arista'; from: string; to: string; ordinal: number }
  | { tipo: 'interaccion'; id: string }
  /** `posicion`: indice entre los Mensajes de la Interaccion (aplanando Fragmentos); `ruta`: la del visor (`2.0.1`). */
  | { tipo: 'mensaje'; interaccion: string; id?: string; posicion: number; ruta: string }
  | { tipo: 'vista'; id: string }
  | { tipo: 'tema'; name: string };

export type TipoDeElementoDeDiferencia = ElementoDeDiferencia['tipo'];

export type ClaseDePropiedad = 'texto' | 'estructura';

export interface PropiedadCambiada {
  nombre: string;
  clase: ClaseDePropiedad;
}

export interface ElementoCambiado {
  elemento: ElementoDeDiferencia;
  propiedades: PropiedadCambiada[];
}

export interface Diferencia {
  agregados: ElementoDeDiferencia[];
  quitados: ElementoDeDiferencia[];
  cambiados: ElementoCambiado[];
}

/** Clave de identidad de un elemento (dos elementos con la misma clave son el mismo). */
export function claveDeElemento(elemento: ElementoDeDiferencia): string {
  switch (elemento.tipo) {
    case 'nodo':
    case 'interaccion':
    case 'vista':
      return `${elemento.tipo}:${elemento.id}`;
    case 'atributo':
      return `atributo:${elemento.nodo}#${elemento.name}`;
    case 'arista':
      return `arista:${elemento.from}->${elemento.to}:${elemento.ordinal}`;
    case 'mensaje':
      return `mensaje:${elemento.interaccion}:${elemento.id ?? `#${elemento.posicion}`}`;
    case 'tema':
      return `tema:${elemento.name}`;
  }
}

/** Una Diferencia sin agregados, quitados ni cambiados. */
export const diferenciaVacia = (d: Diferencia): boolean => d.agregados.length === 0 && d.quitados.length === 0 && d.cambiados.length === 0;

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
