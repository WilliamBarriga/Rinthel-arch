/**
 * What the hand-written schema readers (Prisma, SQL) share over their token lists. Each dialect keeps its own
 * tokenizer and statement splitter, since their lexical rules differ (comments, quoting, line-based vs `;`-based).
 */

export interface Token<Kind extends string = string> {
  text: string;
  /** 1-based. */
  line: number;
  kind: Kind;
}

/** Brackets by opener, for example `{ '(': ')' }`. */
export type Pairs = Readonly<Record<string, string>>;

export const PARENS: Pairs = { '(': ')' };
export const PARENS_AND_BRACKETS: Pairs = { '(': ')', '[': ']' };
export const BRACES: Pairs = { '{': '}' };

/**
 * Index of the token that closes the opener at `open`, or `undefined` if the list ends first. Every opener of `pairs`
 * nests and every closer unnests, without checking that they match (tolerant of malformed input).
 */
export function closing(tokens: readonly Token[], open: number, pairs: Pairs): number | undefined {
  const closers = new Set(Object.values(pairs));
  let depth = 0;
  for (let i = open; i < tokens.length; i++) {
    const text = (tokens[i] as Token).text;
    if (Object.hasOwn(pairs, text)) depth++;
    else if (closers.has(text) && --depth === 0) return i;
  }
  return undefined;
}

/** The comma-separated parts outside any bracket of `pairs`; empty parts are dropped. */
export function split<T extends Token>(tokens: readonly T[], pairs: Pairs): T[][] {
  const closers = new Set(Object.values(pairs));
  const parts: T[][] = [[]];
  let depth = 0;
  for (const token of tokens) {
    if (token.text === ',' && depth === 0) {
      parts.push([]);
      continue;
    }
    if (Object.hasOwn(pairs, token.text)) depth++;
    else if (closers.has(token.text)) depth--;
    parts[parts.length - 1]?.push(token);
  }
  return parts.filter((part) => part.length > 0);
}
