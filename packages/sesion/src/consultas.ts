/**
 * Consultas de solo lectura del Modelo (detalle de Nodo, busqueda, Vista, Interaccion y ubicacion
 * `archivo:linea`). Las comparten `inspect` (ADR 0005) y la UI futura: viven en la Sesion.
 */
import { INSPECT_CONTRACT_VERSION, aplanarMensajes, candidatosCercanos, lifelinesDe, resolveView } from 'canonico';
import type { Arista, FuenteCanonica, Nodo, RutaDeFuente, SalidaDeInspect, Ubicador } from 'canonico';

type Sitio = { file: string; line: number };

/** Que se consulta: `buscar` (texto), `nodo`, `vista` o `interaccion` (id). */
export type Consulta = { comando: 'buscar' | 'nodo' | 'vista' | 'interaccion'; argumento: string };

/** Resultado de consultar: la salida del contrato o el mensaje de lo que no existe. */
export type Respuesta = { salida: SalidaDeInspect } | { noEncontrado: string };

/** Nodos del Modelo con su ruta en la Fuente, en orden de documento. */
function recorrerNodos(nodos: readonly Nodo[], ruta: RutaDeFuente = ['model', 'nodes']): { nodo: Nodo; ruta: RutaDeFuente }[] {
  return nodos.flatMap((nodo, i) => {
    const propia = [...ruta, i];
    return [{ nodo, ruta: propia }, ...recorrerNodos(nodo.children, [...propia, 'children'])];
  });
}

const padreDe = (id: string): string | undefined => (id.includes('.') ? id.slice(0, id.lastIndexOf('.')) : undefined);

/** Responde una consulta sobre la Fuente; cada resultado trae su `archivo:linea` segun el Ubicador. */
export function consultar(fuente: FuenteCanonica, ubicar: Ubicador, { comando, argumento }: Consulta): Respuesta {
  const sitioDe = (ruta: RutaDeFuente): Sitio => {
    const sitio = ubicar(ruta);
    return { file: sitio?.file ?? '(desconocido)', line: sitio?.range.start.line ?? 1 };
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

  if (comando === 'buscar') {
    const aguja = argumento.toLowerCase();
    // Orden: id exacto, id (o ultimo tramo) que empieza por la consulta, el resto; dentro, por id.
    const rango = (id: string) => (id.toLowerCase() === aguja ? 0 : id.toLowerCase().startsWith(aguja) || id.slice(id.lastIndexOf('.') + 1).toLowerCase().startsWith(aguja) ? 1 : 2);
    const encontrados = [
      ...nodos
        .filter(({ nodo }) => nodo.id.toLowerCase().includes(aguja) || nodo.title.toLowerCase().includes(aguja))
        .map((n) => ({ kind: 'nodo' as const, ...resumen(n) })),
      ...vistas
        .filter(({ vista }) => vista.id.toLowerCase().includes(aguja))
        .map(({ vista, sitio }) => ({ kind: 'vista' as const, id: vista.id, type: vista.type, title: vista.id, ...sitio })),
      ...interacciones
        .filter(({ interaccion }) => interaccion.id.toLowerCase().includes(aguja) || interaccion.title.toLowerCase().includes(aguja))
        .map(({ interaccion, sitio }) => ({ kind: 'interaccion' as const, id: interaccion.id, type: 'interaction', title: interaccion.title, ...sitio })),
    ];
    const resultados = encontrados
      .map((r, orden) => ({ r, orden }))
      .sort((a, b) => rango(a.r.id) - rango(b.r.id) || a.orden - b.orden)
      .map(({ r }) => r);
    return { salida: { contractVersion: INSPECT_CONTRACT_VERSION, comando, consulta: argumento, resultados } };
  }

  if (comando === 'interaccion') {
    const encontrada = interacciones.find(({ interaccion }) => interaccion.id === argumento);
    if (encontrada === undefined) {
      const cerca = candidatosCercanos(argumento, interacciones.map(({ interaccion }) => interaccion.id));
      return { noEncontrado: `No existe la Interaccion '${argumento}'${cerca.length === 0 ? '' : `. Quiza: ${cerca.join(', ')}`}` };
    }
    const { interaccion, sitio } = encontrada;
    const mensajes = aplanarMensajes(interaccion.items);
    return {
      salida: {
        contractVersion: INSPECT_CONTRACT_VERSION,
        comando,
        interaccion: {
          id: interaccion.id,
          title: interaccion.title,
          description: interaccion.description,
          ...sitio,
          items: interaccion.items.length,
          mensajes: mensajes.length,
          lifelines: lifelinesDe(mensajes, []),
          vistas: vistas.filter(({ vista }) => vista.type === 'sequence' && vista.interaction === interaccion.id).map(({ vista, sitio: s }) => ({ id: vista.id, ...s })),
        },
      },
    };
  }

  if (comando === 'nodo') {
    const encontrado = nodos.find(({ nodo }) => nodo.id === argumento);
    if (encontrado === undefined) {
      const cerca = candidatosCercanos(argumento, nodos.map(({ nodo }) => nodo.id));
      return { noEncontrado: `No existe el Nodo '${argumento}'${cerca.length === 0 ? '' : `. Quiza: ${cerca.join(', ')}`}` };
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
        comando,
        nodo: {
          ...resumen(encontrado),
          description: nodo.description,
          ...(padre === undefined ? {} : { parent: padre }),
          children: nodo.children.map(({ id }) => id),
          attributes: nodo.attributes.map(({ name, type, notes }) => ({ name, type, notes })),
        },
        aristas,
        vistas: enVistas.map(({ vista, sitio }) => ({ id: vista.id, ...sitio })),
      },
    };
  }

  const encontrada = vistas.find(({ vista }) => vista.id === argumento);
  const resuelta = encontrada === undefined ? undefined : resolveView(fuente, argumento);
  if (encontrada === undefined || resuelta === undefined) {
    const cerca = candidatosCercanos(argumento, vistas.map(({ vista }) => vista.id));
    return { noEncontrado: `No existe la Vista '${argumento}'${cerca.length === 0 ? '' : `. Quiza: ${cerca.join(', ')}`}` };
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
      comando,
      vista: {
        id: encontrada.vista.id,
        type: encontrada.vista.type,
        ...(encontrada.vista.interaction === undefined ? {} : { interaction: encontrada.vista.interaction }),
        ...encontrada.sitio,
        nodos: nodos.filter(({ nodo }) => visibles.has(nodo.id)).map(resumen),
        aristas: resuelta.edges.map((arista) => {
          const i = indiceDeArista(arista);
          // Sin Arista del Modelo que la origine, el sitio es el de la Vista (no se inventa otra Arista).
          return i < 0 ? { ...aristaDe(arista, 0, encontrada.sitio), count: arista.count } : { ...aristaDe(arista, i), count: arista.count };
        }),
      },
    },
  };
}

