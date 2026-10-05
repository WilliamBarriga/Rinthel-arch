/**
 * Compilador del DSL de texto: parsea cada archivo con la gramatica derivada de
 * LikeC4 (Langium) y traduce el AST a la Fuente canonica. Puro: no lee disco.
 */
import { CODIGOS, fuenteCanonicaSchema } from 'canonico';
import type { Arista, Extremo, FuenteCanonica, Issue, Nodo, TextRange, TipoDeNodo } from 'canonico';
import {
  EmptyFileSystem,
  GrammarUtils,
  createDefaultCoreModule,
  createDefaultSharedCoreModule,
  inject,
} from 'langium';
import type { AstNode, LangiumCoreServices, ParseResult } from 'langium';

import { DiagramasGeneratedModule, DiagramasGeneratedSharedModule } from './generated/module';
import type { Documento, Edge, Element, Endpoint } from './generated/ast';
import { candidatosCercanos } from './sugerencias';

/** Mapa ruta -> texto del Workspace. El nucleo no lee disco. */
export type ArchivosDelWorkspace = Readonly<Record<string, string>>;

export interface ResultadoDeCompilacion {
  /** Presente solo si no hay issues con severidad `error`. */
  canonico?: FuenteCanonica;
  /** Todos los issues, ordenados por archivo, linea, columna y codigo. */
  issues: Issue[];
}

let memoServicios: LangiumCoreServices | undefined;

/** Servicios de Langium, construidos una vez (memo inmutable: no guarda estado entre llamadas). */
function servicios(): LangiumCoreServices {
  if (memoServicios === undefined) {
    const shared = inject(createDefaultSharedCoreModule(EmptyFileSystem), DiagramasGeneratedSharedModule);
    memoServicios = inject(createDefaultCoreModule({ shared }), DiagramasGeneratedModule);
    shared.ServiceRegistry.register(memoServicios);
  }
  return memoServicios;
}

export function compile(workspace: ArchivosDelWorkspace): ResultadoDeCompilacion {
  const issues: Issue[] = [];
  const tiposDeNodo: TipoDeNodo[] = [];
  const conSintaxisRota = new Set<string>();
  const raices: { archivo: string; elementos: Element[]; aristas: Edge[] }[] = [];

  for (const archivo of Object.keys(workspace).sort()) {
    const texto = workspace[archivo] as string;
    const resultado = servicios().parser.LangiumParser.parse<Documento>(texto);
    const deSintaxis = issuesDeSintaxis(archivo, texto, resultado);
    issues.push(...deSintaxis);
    if (deSintaxis.length > 0) conSintaxisRota.add(archivo);

    for (const spec of resultado.value.specifications) {
      for (const decl of spec.nodeTypes) {
        const tipo: TipoDeNodo = { name: decl.name, description: '' };
        for (const prop of decl.props) {
          const valor = prop.value;
          if (prop.key === 'description') tipo.description = valor;
          else tipo[prop.key] = valor;
        }
        tiposDeNodo.push(tipo);
      }
    }
    for (const modelo of resultado.value.models) {
      raices.push({ archivo, elementos: modelo.elements, aristas: modelo.edges });
    }
  }

  const declarados = new Set(tiposDeNodo.map((tipo) => tipo.name));
  const nodos: Nodo[] = [];
  for (const { archivo, elementos } of raices) {
    for (const elemento of elementos) {
      nodos.push(compilarElemento(elemento, '', archivo, declarados, issues));
    }
  }

  const atributosPorNodo = new Map<string, string[]>();
  recogerAtributos(nodos, atributosPorNodo);
  const aristas: Arista[] = [];
  for (const { archivo, aristas: delArchivo } of raices) {
    // Con sintaxis rota el AST es parcial: sus Aristas darian falsos colgantes.
    if (conSintaxisRota.has(archivo)) continue;
    for (const arista of delArchivo) {
      aristas.push(compilarArista(arista, archivo, atributosPorNodo, issues));
    }
  }

  issues.sort(compararIssues);
  if (issues.some((issue) => issue.severity === 'error')) return { issues };
  return {
    canonico: fuenteCanonicaSchema.parse({
      specification: { nodeTypes: tiposDeNodo },
      model: { nodes: nodos, edges: aristas },
    }),
    issues,
  };
}

function compilarElemento(
  elemento: Element,
  prefijo: string,
  archivo: string,
  declarados: ReadonlySet<string>,
  issues: Issue[],
): Nodo {
  if (!declarados.has(elemento.type)) {
    issues.push({
      code: CODIGOS.E_UNKNOWN_NODE_TYPE,
      severity: 'error',
      file: archivo,
      ...rangoDe(elemento, 'type').start,
      message: `Tipo de nodo '${elemento.type}' no declarado en specification`,
    });
  }
  const id = prefijo === '' ? elemento.name : `${prefijo}.${elemento.name}`;
  return {
    id,
    type: elemento.type,
    title: elemento.title ?? elemento.name,
    description: elemento.description ?? '',
    attributes: elemento.attrs.flatMap((bloque) =>
      bloque.items.map((item) => ({ name: item.name, type: item.type, notes: item.notes ?? '' })),
    ),
    children: elemento.elements.map((hijo) => compilarElemento(hijo, id, archivo, declarados, issues)),
  };
}

// Las Aristas se validan aqui (con posicion y `fix`) y, como red estructural,
// en el esquema de `canonico`; no es duplicacion evitable: el esquema no ve el texto.
// `E_DANGLING_EDGE` no lleva `related`: no hay un segundo sitio que senalar.
function compilarArista(
  arista: Edge,
  archivo: string,
  atributosPorNodo: ReadonlyMap<string, readonly string[]>,
  issues: Issue[],
): Arista {
  return {
    from: compilarExtremo(arista.from, archivo, atributosPorNodo, issues),
    to: compilarExtremo(arista.to, archivo, atributosPorNodo, issues),
    ...(arista.fromCardinality !== undefined && { fromCardinality: arista.fromCardinality }),
    ...(arista.toCardinality !== undefined && { toCardinality: arista.toCardinality }),
  };
}

/** Compila un extremo; un Nodo inexistente o un Atributo inexistente es un issue. */
function compilarExtremo(
  extremo: Endpoint,
  archivo: string,
  atributosPorNodo: ReadonlyMap<string, readonly string[]>,
  issues: Issue[],
): Extremo {
  const compilado: Extremo = {
    node: extremo.node,
    ...(extremo.attribute !== undefined && { attribute: extremo.attribute }),
  };

  const atributos = atributosPorNodo.get(extremo.node);
  if (atributos === undefined) {
    issues.push(
      issueConSugerencia(
        { code: CODIGOS.E_DANGLING_EDGE, message: `Arista colgante: el Nodo '${extremo.node}' no existe en el Modelo` },
        archivo, extremo, 'node', atributosPorNodo.keys(),
      ),
    );
  } else if (extremo.attribute !== undefined && !atributos.includes(extremo.attribute)) {
    issues.push(
      issueConSugerencia(
        { code: CODIGOS.E_UNKNOWN_ATTRIBUTE, message: `El Nodo '${extremo.node}' no tiene el Atributo '${extremo.attribute}'` },
        archivo, extremo, 'attribute', atributos,
      ),
    );
  }
  return compilado;
}

/**
 * Issue de error sobre la propiedad `propiedad` del extremo, con `fix` si hay un
 * unico candidato cercano entre `existentes` y `hint` si hay varios.
 */
function issueConSugerencia(
  base: { code: string; message: string },
  archivo: string,
  extremo: Endpoint,
  propiedad: 'node' | 'attribute',
  existentes: Iterable<string>,
): Issue {
  const { start: inicio, end: fin } = rangoDe(extremo, propiedad);
  const issue: Issue = { ...base, severity: 'error', file: archivo, ...inicio };
  const candidatos = candidatosCercanos(extremo[propiedad] as string, existentes);
  const [unico] = candidatos;
  if (candidatos.length === 1 && unico !== undefined) {
    issue.fix = { file: archivo, range: { start: inicio, end: fin }, replacement: unico };
  } else if (candidatos.length > 1) {
    issue.hint = `Candidatos: ${candidatos.join(', ')}`;
  }
  return issue;
}

/** Rango 1-based (fin excluido) de una propiedad del AST; `1:1` si el CST no lo conoce. */
function rangoDe(nodo: AstNode, propiedad: string): TextRange {
  const rango = GrammarUtils.findNodeForProperty(nodo.$cstNode, propiedad)?.range;
  return {
    start: { line: (rango?.start.line ?? 0) + 1, column: (rango?.start.character ?? 0) + 1 },
    end: { line: (rango?.end.line ?? 0) + 1, column: (rango?.end.character ?? 0) + 1 },
  };
}

/** Nombres de Atributo (en orden) de cada Nodo, a cualquier profundidad. */
function recogerAtributos(nodos: readonly Nodo[], destino: Map<string, string[]>): void {
  for (const nodo of nodos) {
    destino.set(nodo.id, nodo.attributes.map((atributo) => atributo.name));
    recogerAtributos(nodo.children, destino);
  }
}

function issuesDeSintaxis(
  archivo: string,
  texto: string,
  resultado: ParseResult<Documento>,
): Issue[] {
  const sintaxis = (message: string, line: number, column: number): Issue => ({
    code: CODIGOS.E_SYNTAX_ERROR,
    severity: 'error',
    file: archivo,
    line,
    column,
    message,
  });
  return [
    ...resultado.lexerErrors.map((error) => sintaxis(error.message, error.line ?? 1, error.column ?? 1)),
    ...resultado.parserErrors.map((error) => {
      const { startLine, startColumn } = error.token;
      // En EOF Langium da NaN o -1 como posicion: se usa el final del texto.
      return startLine !== undefined && startColumn !== undefined && startLine >= 1 && startColumn >= 1
        ? sintaxis(error.message, startLine, startColumn)
        : sintaxis(error.message, ...finDeTexto(texto));
    }),
  ];
}

/** Posicion 1-based justo despues del ultimo caracter (errores en EOF). */
function finDeTexto(texto: string): [number, number] {
  const lineas = texto.split(/\r\n|\r|\n/);
  return [lineas.length, (lineas[lineas.length - 1] as string).length + 1];
}

function compararIssues(a: Issue, b: Issue): number {
  return (
    a.file.localeCompare(b.file) || a.line - b.line || a.column - b.column || a.code.localeCompare(b.code)
  );
}
