/** Text positions in the Langium AST and issues with a suggestion. Pure. */
import { CODES, nearestCandidates } from 'canonical';
import type { Issue, TextRange } from 'canonical';
import { CstUtils, GrammarUtils } from 'langium';
import type { AstNode } from 'langium';

interface LangiumRange {
  start: { line: number; character: number };
  end: { line: number; character: number };
}

/** 1-based range (end excluded) of an AST property; `1:1` if the CST does not know it. */
export function rangeOf(node: AstNode, property: string): TextRange {
  return toRange(GrammarUtils.findNodeForProperty(node.$cstNode, property)?.range);
}

/**
 * Range of a mark word (`planned`) together with the space separating it from what precedes it on its line: deleting it
 * leaves the text as if it had never been written.
 */
export function rangeOfMark(node: AstNode, property: string): TextRange {
  const mark = GrammarUtils.findNodeForProperty(node.$cstNode, property);
  if (mark === undefined) return toRange(undefined);
  const previous = CstUtils.getPreviousNode(mark, false);
  const from = previous !== undefined && previous.range.end.line === mark.range.start.line ? previous.range.end : mark.range.start;
  return toRange({ start: from, end: mark.range.end });
}

/** Like `rangeOf`, for the `index`-th value of a multi-valued property. */
export function rangeOfIndex(node: AstNode, property: string, index: number): TextRange {
  return toRange(GrammarUtils.findNodesForProperty(node.$cstNode, property)[index]?.range);
}

/** Empty range at a 0-based Langium position. */
export function emptyPoint(point: { line: number; character: number }): TextRange {
  return toRange({ start: point, end: point });
}

export function toRange(range: LangiumRange | undefined): TextRange {
  return {
    start: { line: (range?.start.line ?? 0) + 1, column: (range?.start.character ?? 0) + 1 },
    end: { line: (range?.end.line ?? 0) + 1, column: (range?.end.character ?? 0) + 1 },
  };
}

/**
 * Error issue on the text property `property` of `node`, with a `fix` if there is
 * a single close candidate among `existing` and a `hint` if there are several.
 */
export function issueWithSuggestion<T extends AstNode>(
  base: { code: string; message: string; /** Already decided candidates (an old name); without them they are searched among `existing`. */ candidatos?: readonly string[] },
  file: string,
  node: T,
  property: Extract<keyof T, string>,
  existing: Iterable<string>,
): Issue {
  const { start, end } = rangeOf(node, property);
  const { candidatos: decided, ...rest } = base;
  const issue: Issue = { ...rest, severity: 'error', file, ...start };
  const candidates = decided ?? nearestCandidates(node[property] as string, existing);
  const [single] = candidates;
  if (candidates.length === 1 && single !== undefined) {
    issue.fix = { file, range: { start, end }, replacement: single };
  } else if (candidates.length > 1) {
    issue.hint = `Candidates: ${candidates.join(', ')}`;
  }
  return issue;
}

/** Issue base of a `parseState` error: an old name (`old-catalog-value`) carries its already decided candidate. */
export function stateErrorBase(error: { code: string; message: string; candidatos: readonly string[] }): { code: string; message: string; candidatos?: readonly string[] } {
  return error.code === CODES.E_OLD_CATALOG_VALUE ? error : { code: error.code, message: error.message };
}
