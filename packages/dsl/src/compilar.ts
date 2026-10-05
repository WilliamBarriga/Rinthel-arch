/**
 * Compilador del DSL de texto: parsea cada archivo con la gramatica derivada de
 * LikeC4 (Langium) y traduce el AST a la Fuente canonica. Puro: no lee disco.
 */
import { CODIGOS, fuenteCanonicaSchema } from 'canonico';
import type { FuenteCanonica, Issue, Nodo, TipoDeNodo } from 'canonico';
import {
  EmptyFileSystem,
  GrammarUtils,
  createDefaultCoreModule,
  createDefaultSharedCoreModule,
  inject,
} from 'langium';
import type { LangiumCoreServices, ParseResult } from 'langium';

import { DiagramasGeneratedModule, DiagramasGeneratedSharedModule } from './generated/module';
import type { Documento, Element } from './generated/ast';

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
  const raices: { archivo: string; elementos: Element[] }[] = [];

  for (const archivo of Object.keys(workspace).sort()) {
    const texto = workspace[archivo] as string;
    const resultado = servicios().parser.LangiumParser.parse<Documento>(texto);
    issues.push(...issuesDeSintaxis(archivo, texto, resultado));

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
      raices.push({ archivo, elementos: modelo.elements });
    }
  }

  const declarados = new Set(tiposDeNodo.map((tipo) => tipo.name));
  const nodos: Nodo[] = [];
  for (const { archivo, elementos } of raices) {
    for (const elemento of elementos) {
      nodos.push(compilarElemento(elemento, '', archivo, declarados, issues));
    }
  }

  issues.sort(compararIssues);
  if (issues.some((issue) => issue.severity === 'error')) return { issues };
  return {
    canonico: fuenteCanonicaSchema.parse({
      specification: { nodeTypes: tiposDeNodo },
      model: { nodes: nodos },
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
    const rango = GrammarUtils.findNodeForProperty(elemento.$cstNode, 'type')?.range;
    issues.push({
      code: CODIGOS.E_UNKNOWN_NODE_TYPE,
      severity: 'error',
      file: archivo,
      line: (rango?.start.line ?? 0) + 1,
      column: (rango?.start.character ?? 0) + 1,
      message: `Tipo de nodo '${elemento.type}' no declarado en specification`,
    });
  }
  const id = prefijo === '' ? elemento.name : `${prefijo}.${elemento.name}`;
  return {
    id,
    type: elemento.type,
    title: elemento.title ?? elemento.name,
    description: elemento.description ?? '',
    children: elemento.elements.map((hijo) => compilarElemento(hijo, id, archivo, declarados, issues)),
  };
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
