/**
 * DSL highlighting with `StreamLanguage` (no Langium in the browser): grammar keywords (extracted at build time),
 * strings, line and block comments, numbers, `#rrggbb` colors and arrows. The colors come from the chrome's
 * `--ui-sint-*` tokens.
 */
import { HighlightStyle, StreamLanguage, syntaxHighlighting } from '@codemirror/language';
import type { StreamParser } from '@codemirror/language';
import type { Extension } from '@codemirror/state';
import { tags } from '@lezer/highlight';

import { KEYWORDS } from './keywords';

const KEYS = new Set(KEYWORDS);

interface LexerState {
  inComment: boolean;
}

export const dslParser: StreamParser<LexerState> = {
  name: 'diagramas',
  startState: () => ({ inComment: false }),
  token(stream, state) {
    if (state.inComment) {
      if (stream.skipTo('*/')) {
        stream.match('*/');
        state.inComment = false;
      } else stream.skipToEnd();
      return 'comment';
    }
    if (stream.eatSpace()) return null;
    if (stream.match('//')) {
      stream.skipToEnd();
      return 'comment';
    }
    if (stream.match('/*')) {
      state.inComment = true;
      return 'comment';
    }
    if (stream.match(/^"(?:[^"\\]|\\.)*"?/)) return 'string';
    if (stream.match(/^#[0-9a-fA-F]{3,8}\b/)) return 'number';
    if (stream.match(/^-?\d+(?:\.\d+)?/)) return 'number';
    if (stream.match(/^(?:->|<-|\*\*|\*)/)) return 'operator';
    const word = stream.match(/^[A-Za-z_][\w.-]*/);
    if (word !== null && word !== false && word !== true) return KEYS.has(word[0]) ? 'keyword' : 'variableName';
    stream.next();
    return null;
  },
  languageData: { commentTokens: { line: '//', block: { open: '/*', close: '*/' } } },
};

const style = HighlightStyle.define([
  { tag: tags.keyword, color: 'var(--ui-sint-kw)' },
  { tag: tags.variableName, color: 'var(--ui-sint-id)' },
  { tag: tags.string, color: 'var(--ui-sint-cadena)' },
  { tag: tags.number, color: 'var(--ui-sint-numero)' },
  { tag: tags.comment, color: 'var(--ui-tenue)', fontStyle: 'italic' },
  { tag: tags.operator, color: 'var(--ui-acento)' },
]);

export function dslLanguage(): Extension {
  return [StreamLanguage.define(dslParser), syntaxHighlighting(style)];
}
