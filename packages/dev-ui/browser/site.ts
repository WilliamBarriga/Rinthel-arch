/** Code site `file:line`: its type, how it is written, parsed and taken from an `inspect` output. Pure. */
import type { InspectOutput } from 'canonical';

/** Same pair as `inspect` (`file`, `line`); `line` starts at 1. */
export interface CodeSite {
  file: string;
  line: number;
}

/** `main.dg:12`. */
export const siteText = ({ file, line }: CodeSite): string => `${file}:${line}`;

/** `main.dg:12` -> site; anything else, `undefined`. */
export function writtenSite(query: string): CodeSite | undefined {
  const m = /^(\S+):(\d+)$/.exec(query.trim());
  if (m === null || Number(m[2]) < 1) return undefined;
  return { file: m[1]!, line: Number(m[2]) };
}

/** Where the queried element is declared (Node, View or Interaction); `undefined` for `search` and `theme`. */
export function exitSite(output: InspectOutput): CodeSite | undefined {
  const s = output.command === 'node' ? output.node : output.command === 'view' ? output.view : output.command === 'interaction' ? output.interaction : undefined;
  return s === undefined ? undefined : { file: s.file, line: s.line };
}
