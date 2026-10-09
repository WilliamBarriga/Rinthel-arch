/**
 * Ubicador de `validate` (canonico): traduce la ruta de un valor de la Fuente
 * canonica al texto del DSL que lo origino. Las listas de la Fuente conservan el
 * orden del AST, asi que el indice `i` de la Fuente es el `i`-esimo del AST.
 */
import type { FuenteCanonica, SitioDeTexto, TextRange, Ubicador } from 'canonico';

import type { Edge, Element, NodeTypeDecl, View } from './generated/ast';
import { rangoDe, rangoDeIndice } from './posiciones';

export interface DatosDelUbicador {
  fuente: FuenteCanonica;
  /** Nodos por id cualificado, con su AST y archivo. */
  nodos: ReadonlyMap<string, { archivo: string; ast: Element }>;
  /** Aristas compiladas, en el mismo orden que `fuente.model.edges`. */
  aristas: readonly { archivo: string; ast: Edge }[];
  /** Tipos de nodo, en el mismo orden que `fuente.specification.nodeTypes`. */
  tipos: readonly { archivo: string; ast: NodeTypeDecl }[];
  /** Vistas, en el mismo orden que `fuente.views`. */
  vistas: readonly { archivo: string; ast: View }[];
  /** Archivos con sintaxis rota: su AST es parcial y daria falsos positivos. */
  conSintaxisRota: ReadonlySet<string>;
}

type Ruta = readonly (string | number)[];

const sitio = (file: string, range: TextRange): SitioDeTexto => ({ file, range });

export function crearUbicador(datos: DatosDelUbicador): Ubicador {
  return (ruta) => {
    const [seccion, indice, ...resto] = ruta;
    if (seccion === 'model' && indice === 'nodes') return deNodo(datos, ruta);
    if (seccion === 'model' && indice === 'edges') return deArista(datos, resto);
    if (seccion === 'specification') return deTipo(datos, resto);
    if (seccion === 'views') return deVista(datos, indice as number, resto);
    return null;
  };
}

/** Camina `ruta` por la Fuente hasta el Nodo y busca su declaracion por id. */
function deNodo({ fuente, nodos }: DatosDelUbicador, ruta: Ruta): SitioDeTexto | null {
  let actual: unknown = fuente;
  for (const clave of ruta.slice(0, -1)) actual = (actual as Record<string | number, unknown>)[clave];
  const declarado = nodos.get((actual as { id: string }).id);
  if (declarado === undefined) return null;
  return sitio(declarado.archivo, rangoDe(declarado.ast, ruta.at(-1) as string));
}

function deArista({ aristas }: DatosDelUbicador, [i, lado, campo]: Ruta): SitioDeTexto | null {
  const arista = aristas[i as number];
  if (arista === undefined) return null;
  return sitio(arista.archivo, rangoDe(arista.ast[lado as 'from' | 'to'], campo as string));
}

/** Valor de la propiedad `clave` (`icon` o `color`) del `i`-esimo Tipo de nodo. */
function deTipo({ tipos, conSintaxisRota }: DatosDelUbicador, [i, clave]: Ruta): SitioDeTexto | null {
  const tipo = tipos[i as number];
  const prop = tipo?.ast.props.find((candidata) => candidata.key === clave);
  if (tipo === undefined || prop === undefined || conSintaxisRota.has(tipo.archivo)) return null;
  return sitio(tipo.archivo, rangoDe(prop, 'value'));
}

function deVista(datos: DatosDelUbicador, indice: number, ruta: Ruta): SitioDeTexto | null {
  const vista = datos.vistas[indice];
  if (vista === undefined || datos.conSintaxisRota.has(vista.archivo)) return null;
  const { archivo, ast } = vista;
  const [campo, i, ...cola] = ruta;
  const props = ast.props;

  if (campo === 'theme') {
    const tema = props.find((prop) => prop.$type === 'ViewTheme');
    return tema === undefined ? null : sitio(archivo, rangoDe(tema, 'value'));
  }
  if (campo === 'overrides') {
    const override = props.filter((prop) => prop.$type === 'NodeOverride')[i as number];
    if (override === undefined) return null;
    if (cola[0] === 'node') return sitio(archivo, rangoDe(override, 'node'));
    const color = override.props.find((prop) => prop.$type === 'OverrideColor');
    return color === undefined ? null : sitio(archivo, rangoDe(color, 'value'));
  }
  if (campo === 'links') {
    const enlace = props.filter((prop) => prop.$type === 'ViewLink')[i as number];
    return enlace === undefined ? null : sitio(archivo, rangoDe(enlace, 'view'));
  }
  if (campo === 'collapsed' || campo === 'expanded') {
    const clase = campo === 'collapsed' ? 'ViewCollapsed' : 'ViewExpanded';
    let resto = i as number;
    for (const prop of props) {
      if (prop.$type !== clase) continue;
      if (resto < prop.targets.length) return sitio(archivo, rangoDeIndice(prop, 'targets', resto));
      resto -= prop.targets.length;
    }
    return null;
  }
  if (campo === 'steps') {
    const paso = props.flatMap((prop) => (prop.$type === 'ViewSteps' ? prop.steps : []))[i as number];
    const [accion, k, propiedad] = cola;
    const clase = accion === 'show' ? 'StepShow' : 'StepHide';
    const item = paso?.actions.flatMap((a) => (a.$type === clase ? a.items : []))[k as number];
    return item === undefined ? null : sitio(archivo, rangoDe(item, propiedad as string));
  }
  return null;
}
