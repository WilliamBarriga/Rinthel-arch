/**
 * Resaltado del DSL con `StreamLanguage` (sin Langium en el navegador): palabras clave de la gramatica (extraidas en
 * build), cadenas, comentarios de linea y de bloque, numeros, colores `#rrggbb` y flechas. Los colores salen de los
 * tokens `--ui-sint-*` del chrome.
 */
import { HighlightStyle, StreamLanguage, syntaxHighlighting } from '@codemirror/language';
import type { StreamParser } from '@codemirror/language';
import type { Extension } from '@codemirror/state';
import { tags } from '@lezer/highlight';

import { PALABRAS_CLAVE } from './palabras-clave';

const CLAVES = new Set(PALABRAS_CLAVE);

interface EstadoDelLexer {
  enComentario: boolean;
}

export const parserDelDsl: StreamParser<EstadoDelLexer> = {
  name: 'diagramas',
  startState: () => ({ enComentario: false }),
  token(stream, estado) {
    if (estado.enComentario) {
      if (stream.skipTo('*/')) {
        stream.match('*/');
        estado.enComentario = false;
      } else stream.skipToEnd();
      return 'comment';
    }
    if (stream.eatSpace()) return null;
    if (stream.match('//')) {
      stream.skipToEnd();
      return 'comment';
    }
    if (stream.match('/*')) {
      estado.enComentario = true;
      return 'comment';
    }
    if (stream.match(/^"(?:[^"\\]|\\.)*"?/)) return 'string';
    if (stream.match(/^#[0-9a-fA-F]{3,8}\b/)) return 'number';
    if (stream.match(/^-?\d+(?:\.\d+)?/)) return 'number';
    if (stream.match(/^(?:->|<-|\*\*|\*)/)) return 'operator';
    const palabra = stream.match(/^[A-Za-z_][\w.-]*/);
    if (palabra !== null && palabra !== false && palabra !== true) return CLAVES.has(palabra[0]) ? 'keyword' : 'variableName';
    stream.next();
    return null;
  },
  languageData: { commentTokens: { line: '//', block: { open: '/*', close: '*/' } } },
};

const estilo = HighlightStyle.define([
  { tag: tags.keyword, color: 'var(--ui-sint-kw)' },
  { tag: tags.variableName, color: 'var(--ui-sint-id)' },
  { tag: tags.string, color: 'var(--ui-sint-cadena)' },
  { tag: tags.number, color: 'var(--ui-sint-numero)' },
  { tag: tags.comment, color: 'var(--ui-tenue)', fontStyle: 'italic' },
  { tag: tags.operator, color: 'var(--ui-acento)' },
]);

export function lenguajeDelDsl(): Extension {
  return [StreamLanguage.define(parserDelDsl), syntaxHighlighting(estilo)];
}
