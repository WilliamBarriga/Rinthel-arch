/**
 * Editor completion (own `CompletionSource`, no LSP): grammar keywords plus the ids of the last good Source. `type`
 * picks the CodeMirror icon: `keyword`, `variable` (Node), `class` (Node type), `namespace` (View), `function`
 * (Interaction) and `type` (Theme).
 */
import type { Completion, CompletionContext, CompletionResult, CompletionSource } from '@codemirror/autocomplete';
import type { CanonicalForm } from 'canonical';

import { KEYWORDS } from './keywords';

const WORDS: readonly Completion[] = KEYWORDS.map((label) => ({ label, type: 'keyword' }));

export function completionOptions(source: CanonicalForm | undefined): Completion[] {
  if (source === undefined) return [...WORDS];
  const labelsOf = (ids: readonly string[], type: string, detail: string): Completion[] => ids.map((label) => ({ label, type, detail }));
  return [
    ...labelsOf(
      source.model.nodes.map((n) => n.id),
      'variable',
      'Node',
    ),
    ...labelsOf(
      source.specification.nodeTypes.map((t) => t.name),
      'class',
      'Node kind',
    ),
    ...labelsOf(
      source.views.map((v) => v.id),
      'namespace',
      'View',
    ),
    ...labelsOf(
      source.model.interactions.map((i) => i.id),
      'function',
      'Interaction',
    ),
    ...labelsOf(
      source.themes.map((t) => t.name),
      'type',
      'Theme',
    ),
    ...WORDS,
  ];
}

/** Ids with a dot (`sistema.api`) and a hyphen (`ease-in`) count as one word. */
const WORD = /[\w.-]+/;

/** `source` is read on each query: always the last good one. */
export function completeDsl(source: () => CanonicalForm | undefined): CompletionSource {
  return (context: CompletionContext): CompletionResult | null => {
    const word = context.matchBefore(WORD);
    if (word === null && !context.explicit) return null;
    return { from: word?.from ?? context.pos, options: completionOptions(source()), validFor: /^[\w.-]*$/ };
  };
}
