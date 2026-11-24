import { INSPECT_CONTRACT_VERSION, aplanarMensajes, candidatosCercanos, lifelinesDe, padreDe, resolveView } from 'canonico';
import type { Arista, FuenteCanonica, Nodo, RutaDeFuente, SalidaDeInspect, Ubicador } from 'canonico';

type Sitio = { file: string; line: number };

import type { OpcionesDeConsultaDeTema } from './consulta-de-tema';

/** `argumento` es texto para `buscar`, nombre para `tema` e id para el resto; las opciones de `tema` ajustan su cascada. */
export type Consulta = { comando: 'search' | 'node' | 'view' | 'interaction'; argumento: string } | ({ comando: 'theme'; argumento: string } & OpcionesDeConsultaDeTema);

/** `noEncontrado` es el message (con `Quiza: ...`); `suggestions`, los ids parecidos que nombra. */
export type Respuesta = { salida: SalidaDeInspect } | { noEncontrado: string; suggestions: string[] };

/** En orden de documento. */
function recorrerNodos(nodos: readonly Nodo[], ruta: RutaDeFuente = ['model', 'nodes']): { nodo: Nodo; ruta: RutaDeFuente }[] {
  return nodos.flatMap((nodo, i) => {
    const propia = [...ruta, i];
    return [{ nodo, ruta: propia }, ...recorrerNodos(nodo.children, [...propia, 'children'])];
  });
}

export function consultar(fuente: FuenteCanonica, ubicar: Ubicador, { comando, argumento }: Exclude<Consulta, { comando: 'theme' }>): Respuesta {
  const sitioDe = (ruta: RutaDeFuente): Sitio => {
    const sitio = ubicar(ruta);
    return { file: sitio?.file ?? '(unknown)', line: sitio?.range.start.line ?? 1 };
  };
  const nodos = recorrerNodos(fuente.model.nodes).map(({ nodo, ruta }) => ({ nodo, sitio: sitioDe([...ruta, 'name']) }));
  const vistas = fuente.views.map((vista, i) => ({ vista, sitio: sitioDe(['views', i, 'id']) }));
  const interacciones = fuente.model.interactions.map((interaccion, i) => ({ interaccion, sitio: sitioDe(['model', 'interactions', i, 'id']) }));
  const resumen = ({ nodo, sitio }: (typeof nodos)[number]) => ({ id: nodo.id, type: nodo.type, title: nodo.title, ...sitio });
  const aristaDe = (arista: Arista, i: number, sitioFijo?: Sitio) => ({
    from: arista.from.node,
    to: arista.to.node,
    ...(arista.from.attribute === undefined ? {} : { fromAttribute: arista.from.attribute }),
    ...(arista.to.attribute === undefined ? {} : { toAttribute: arista.to.attribute }),
    ...(arista.label === undefined ? {} : { label: arista.label }),
    ...(sitioFijo ?? sitioDe(['model', 'edges', i, 'from', 'node'])),
  });

  if (comando === 'search') {
    const aguja = argumento.toLowerCase();
    // Orden: id exacto, id (o ultimo tramo) que empieza por la consulta, el resto; dentro, por id.
    const rango = (id: string) => (id.toLowerCase() === aguja ? 0 : id.toLowerCase().startsWith(aguja) || id.slice(id.lastIndexOf('.') + 1).toLowerCase().startsWith(aguja) ? 1 : 2);
    const encontrados = [
      ...nodos
        .filter(({ nodo }) => nodo.id.toLowerCase().includes(aguja) || nodo.title.toLowerCase().includes(aguja))
        .map((n) => ({ kind: 'node' as const, ...resumen(n) })),
      ...vistas
        .filter(({ vista }) => vista.id.toLowerCase().includes(aguja))
        .map(({ vista, sitio }) => ({ kind: 'view' as const, id: vista.id, type: vista.type, title: vista.id, ...sitio })),
      ...interacciones
        .filter(({ interaccion }) => interaccion.id.toLowerCase().includes(aguja) || interaccion.title.toLowerCase().includes(aguja))
        .map(({ interaccion, sitio }) => ({ kind: 'interaction' as const, id: interaccion.id, type: 'interaction', title: interaccion.title, ...sitio })),
    ];
    const resultados = encontrados
      .map((r, orden) => ({ r, orden }))
      .sort((a, b) => rango(a.r.id) - rango(b.r.id) || a.orden - b.orden)
      .map(({ r }) => r);
    return { salida: { contractVersion: INSPECT_CONTRACT_VERSION, command: comando, query: argumento, results: resultados } };
  }

  if (comando === 'interaction') {
    const encontrada = interacciones.find(({ interaccion }) => interaccion.id === argumento);
    if (encontrada === undefined) {
      const cerca = candidatosCercanos(argumento, interacciones.map(({ interaccion }) => interaccion.id));
      return { noEncontrado: `No such Interaction '${argumento}'${cerca.length === 0 ? '' : `. Did you mean: ${cerca.join(', ')}`}`, suggestions: cerca };
    }
    const { interaccion, sitio } = encontrada;
    const mensajes = aplanarMensajes(interaccion.items);
    return {
      salida: {
        contractVersion: INSPECT_CONTRACT_VERSION,
        command: comando,
        interaction: {
          id: interaccion.id,
          title: interaccion.title,
          description: interaccion.description,
          ...sitio,
          items: interaccion.items.length,
          messages: mensajes.length,
          lifelines: lifelinesDe(mensajes, []),
          views: vistas.filter(({ vista }) => vista.type === 'sequence' && vista.interaction === interaccion.id).map(({ vista, sitio: s }) => ({ id: vista.id, ...s })),
        },
      },
    };
  }

  if (comando === 'node') {
    const encontrado = nodos.find(({ nodo }) => nodo.id === argumento);
    if (encontrado === undefined) {
      const cerca = candidatosCercanos(argumento, nodos.map(({ nodo }) => nodo.id));
      return { noEncontrado: `No such Node '${argumento}'${cerca.length === 0 ? '' : `. Did you mean: ${cerca.join(', ')}`}`, suggestions: cerca };
    }
    const { nodo } = encontrado;
    const padre = padreDe(nodo.id);
    const aristas = fuente.model.edges.flatMap((arista, i) => {
      const salen = arista.from.node === nodo.id;
      const entran = arista.to.node === nodo.id;
      return salen || entran ? [{ ...aristaDe(arista, i), direction: salen ? ('out' as const) : ('in' as const) }] : [];
    });
    const enVistas = vistas.filter(({ vista }) => {
      const resuelta = resolveView(fuente, vista.id);
      const visible = (hijos: readonly { id: string; children: readonly unknown[] }[]): boolean =>
        hijos.some((n) => n.id === nodo.id || visible(n.children as typeof hijos));
      return resuelta !== undefined && visible(resuelta.nodes);
    });
    return {
      salida: {
        contractVersion: INSPECT_CONTRACT_VERSION,
        command: comando,
        node: {
          ...resumen(encontrado),
          description: nodo.description,
          ...(padre === '' ? {} : { parent: padre }),
          children: nodo.children.map(({ id }) => id),
          attributes: nodo.attributes.map(({ name, type, notes }) => ({ name, type, notes })),
        },
        edges: aristas,
        views: enVistas.map(({ vista, sitio }) => ({ id: vista.id, ...sitio })),
      },
    };
  }

  const encontrada = vistas.find(({ vista }) => vista.id === argumento);
  const resuelta = encontrada === undefined ? undefined : resolveView(fuente, argumento);
  if (encontrada === undefined || resuelta === undefined) {
    const cerca = candidatosCercanos(argumento, vistas.map(({ vista }) => vista.id));
    return { noEncontrado: `No such View '${argumento}'${cerca.length === 0 ? '' : `. Did you mean: ${cerca.join(', ')}`}`, suggestions: cerca };
  }
  const visibles = new Set<string>();
  const marcar = (hijos: typeof resuelta.nodes): void => hijos.forEach((n) => (visibles.add(n.id), marcar(n.children)));
  marcar(resuelta.nodes);
  // Una Arista elevada por un Grupo colapsado se situa en la primera Arista del Modelo que fusiona.
  const dentroDe = (id: string, grupo: string): boolean => id === grupo || id.startsWith(`${grupo}.`);
  const indiceDeArista = (a: Arista): number => {
    const exacta = fuente.model.edges.findIndex((e) => e.from.node === a.from.node && e.to.node === a.to.node && e.label === a.label);
    return exacta >= 0 ? exacta : fuente.model.edges.findIndex((e) => dentroDe(e.from.node, a.from.node) && dentroDe(e.to.node, a.to.node));
  };
  return {
    salida: {
      contractVersion: INSPECT_CONTRACT_VERSION,
      command: comando,
      view: {
        id: encontrada.vista.id,
        type: encontrada.vista.type,
        ...(encontrada.vista.interaction === undefined ? {} : { interaction: encontrada.vista.interaction }),
        ...encontrada.sitio,
        nodes: nodos.filter(({ nodo }) => visibles.has(nodo.id)).map(resumen),
        edges: (resuelta.type === 'sequence' ? [] : resuelta.edges).map((arista) => {
          const i = indiceDeArista(arista);
          // Sin Arista del Modelo que la origine, el sitio es el de la Vista.
          return i < 0 ? { ...aristaDe(arista, 0, encontrada.sitio), count: arista.count } : { ...aristaDe(arista, i), count: arista.count };
        }),
      },
    },
  };
}

