/** Posiciones del texto en el AST de Langium y issues con sugerencia. Puro. */
import { CODES, nearestCandidates } from 'canonical';
import type { Issue, TextRange } from 'canonical';
import { CstUtils, GrammarUtils } from 'langium';
import type { AstNode } from 'langium';

interface RangoDeLangium {
  start: { line: number; character: number };
  end: { line: number; character: number };
}

/** Rango 1-based (fin excluido) de una propiedad del AST; `1:1` si el CST no lo conoce. */
export function rangoDe(nodo: AstNode, propiedad: string): TextRange {
  return aRango(GrammarUtils.findNodeForProperty(nodo.$cstNode, propiedad)?.range);
}

/**
 * Rango de una palabra marca (`planned`) junto con el espacio que la separa de lo anterior en su linea: borrarlo deja
 * el texto como si nunca se hubiera escrito.
 */
export function rangoDeMarca(nodo: AstNode, propiedad: string): TextRange {
  const marca = GrammarUtils.findNodeForProperty(nodo.$cstNode, propiedad);
  if (marca === undefined) return aRango(undefined);
  const previo = CstUtils.getPreviousNode(marca, false);
  const desde = previo !== undefined && previo.range.end.line === marca.range.start.line ? previo.range.end : marca.range.start;
  return aRango({ start: desde, end: marca.range.end });
}

/** Como `rangoDe`, para el `indice`-esimo valor de una propiedad multiple. */
export function rangoDeIndice(nodo: AstNode, propiedad: string, indice: number): TextRange {
  return aRango(GrammarUtils.findNodesForProperty(nodo.$cstNode, propiedad)[indice]?.range);
}

/** Rango vacio en una posicion 0-based de Langium. */
export function puntoVacio(punto: { line: number; character: number }): TextRange {
  return aRango({ start: punto, end: punto });
}

export function aRango(rango: RangoDeLangium | undefined): TextRange {
  return {
    start: { line: (rango?.start.line ?? 0) + 1, column: (rango?.start.character ?? 0) + 1 },
    end: { line: (rango?.end.line ?? 0) + 1, column: (rango?.end.character ?? 0) + 1 },
  };
}

/**
 * Issue de error sobre la propiedad textual `propiedad` de `nodo`, con `fix` si hay
 * un unico candidato cercano entre `existentes` y `hint` si hay varios.
 */
export function issueConSugerencia<T extends AstNode>(
  base: { code: string; message: string; /** Candidatos ya decididos (un nombre antiguo); sin ellos se buscan entre `existentes`. */ candidatos?: readonly string[] },
  archivo: string,
  nodo: T,
  propiedad: Extract<keyof T, string>,
  existentes: Iterable<string>,
): Issue {
  const { start: inicio, end: fin } = rangoDe(nodo, propiedad);
  const { candidatos: decididos, ...resto } = base;
  const issue: Issue = { ...resto, severity: 'error', file: archivo, ...inicio };
  const candidatos = decididos ?? nearestCandidates(nodo[propiedad] as string, existentes);
  const [unico] = candidatos;
  if (candidatos.length === 1 && unico !== undefined) {
    issue.fix = { file: archivo, range: { start: inicio, end: fin }, replacement: unico };
  } else if (candidatos.length > 1) {
    issue.hint = `Candidates: ${candidatos.join(', ')}`;
  }
  return issue;
}

/** Base de issue de un error de `parseState`: un nombre antiguo (`old-catalog-value`) lleva su candidato ya decidido. */
export function baseDeErrorDeEstado(error: { code: string; message: string; candidatos: readonly string[] }): { code: string; message: string; candidatos?: readonly string[] } {
  return error.code === CODES.E_OLD_CATALOG_VALUE ? error : { code: error.code, message: error.message };
}
