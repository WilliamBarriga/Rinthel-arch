/**
 * Consulta de solo lectura del Modelo (`diagrams inspect`, ADR 0009): `buscar`,
 * `nodo` y `vista`. Puro sobre una Sesion; el comando de `index.ts` solo parsea
 * argumentos y la imprime.
 */
import { INSPECT_CONTRACT_VERSION, candidatosCercanos, resolveView, salidaDeInspectSchema } from 'canonico';
import type { Arista, FuenteCanonica, Nodo, RutaDeFuente, SalidaDeInspect, Ubicador } from 'canonico';

type Sitio = { file: string; line: number };
type Consulta = { comando: 'buscar' | 'nodo' | 'vista'; argumento: string };

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

export function consultar(fuente: FuenteCanonica, ubicar: Ubicador, { comando, argumento }: Consulta): Respuesta {
  const sitioDe = (ruta: RutaDeFuente): Sitio => {
    const sitio = ubicar(ruta);
    return { file: sitio?.file ?? '(desconocido)', line: sitio?.range.start.line ?? 1 };
  };
  const nodos = recorrerNodos(fuente.model.nodes).map(({ nodo, ruta }) => ({ nodo, sitio: sitioDe([...ruta, 'name']) }));
  const vistas = fuente.views.map((vista, i) => ({ vista, sitio: sitioDe(['views', i, 'id']) }));
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
    ];
    const resultados = encontrados
      .map((r, orden) => ({ r, orden }))
      .sort((a, b) => rango(a.r.id) - rango(b.r.id) || a.orden - b.orden)
      .map(({ r }) => r);
    return { salida: { contractVersion: INSPECT_CONTRACT_VERSION, comando, consulta: argumento, resultados } };
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

/** Valida contra el contrato antes de emitir. */
export const comoJson = (salida: SalidaDeInspect): string => `${JSON.stringify(salidaDeInspectSchema.parse(salida), null, 2)}\n`;

const sitio = ({ file, line }: Sitio): string => `${file}:${line}`;
const titulo = (t: string): string => (t === '' ? '' : ` "${t}"`);

/** Texto para humanos: una linea por resultado. */
export function textoLegible(salida: SalidaDeInspect): string {
  const lineas: string[] = [];
  if (salida.comando === 'buscar') {
    for (const r of salida.resultados) lineas.push(r.kind === 'vista' ? `vista ${r.id} ${r.type} ${sitio(r)}` : `nodo ${r.id} ${r.type}${titulo(r.title)} ${sitio(r)}`);
    lineas.push(`${salida.resultados.length} ${salida.resultados.length === 1 ? 'resultado' : 'resultados'}`);
  } else if (salida.comando === 'nodo') {
    const { nodo } = salida;
    lineas.push(`${nodo.id} ${nodo.type}${titulo(nodo.title)} ${sitio(nodo)}`);
    if (nodo.description !== '') lineas.push(`  ${nodo.description}`);
    if (nodo.parent !== undefined) lineas.push(`Padre: ${nodo.parent}`);
    if (nodo.children.length > 0) lineas.push(`Hijos: ${nodo.children.join(', ')}`);
    if (nodo.attributes.length > 0) lineas.push(`Atributos: ${nodo.attributes.map((a) => `${a.name}: ${a.type}`).join(', ')}`);
    lineas.push('Aristas:');
    for (const a of salida.aristas) {
      const otro = a.direction === 'out' ? a.to : a.from;
      lineas.push(`  ${a.direction === 'out' ? '->' : '<-'} ${otro}${a.label === undefined ? '' : ` "${a.label}"`} ${sitio(a)}`);
    }
    lineas.push('Vistas:');
    for (const v of salida.vistas) lineas.push(`  ${v.id} ${sitio(v)}`);
  } else {
    const { vista } = salida;
    lineas.push(`${vista.id} ${vista.type} ${sitio(vista)}`);
    lineas.push('Nodos:');
    for (const n of vista.nodos) lineas.push(`  ${n.id} ${n.type}${titulo(n.title)} ${sitio(n)}`);
    lineas.push('Aristas:');
    for (const a of vista.aristas) lineas.push(`  ${a.from} -> ${a.to}${a.label === undefined ? '' : ` "${a.label}"`}${a.count > 1 ? ` (x${a.count})` : ''} ${sitio(a)}`);
  }
  return `${lineas.join('\n')}\n`;
}
