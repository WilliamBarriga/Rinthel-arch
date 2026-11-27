/**
 * Completado del editor (`CompletionSource` propio, sin LSP): palabras clave de la gramatica mas los ids de la ultima
 * Fuente buena. `type` decide el icono de CodeMirror: `keyword`, `variable` (Nodo), `class` (Tipo de Nodo), `namespace`
 * (Vista), `function` (Interaccion) y `type` (Tema).
 */
import type { Completion, CompletionContext, CompletionResult, CompletionSource } from '@codemirror/autocomplete';
import type { CanonicalForm } from 'canonical';

import { PALABRAS_CLAVE } from './palabras-clave';

const PALABRAS: readonly Completion[] = PALABRAS_CLAVE.map((label) => ({ label, type: 'keyword' }));

export function opcionesDeCompletado(fuente: CanonicalForm | undefined): Completion[] {
  if (fuente === undefined) return [...PALABRAS];
  const de = (ids: readonly string[], type: string, detail: string): Completion[] => ids.map((label) => ({ label, type, detail }));
  return [
    ...de(
      fuente.model.nodes.map((n) => n.id),
      'variable',
      'Node',
    ),
    ...de(
      fuente.specification.nodeTypes.map((t) => t.name),
      'class',
      'Node kind',
    ),
    ...de(
      fuente.views.map((v) => v.id),
      'namespace',
      'View',
    ),
    ...de(
      fuente.model.interactions.map((i) => i.id),
      'function',
      'Interaction',
    ),
    ...de(
      fuente.themes.map((t) => t.name),
      'type',
      'Theme',
    ),
    ...PALABRAS,
  ];
}

/** Ids con punto (`sistema.api`) y guion (`ease-in`) cuentan como una palabra. */
const PALABRA = /[\w.-]+/;

/** `fuente` se lee en cada consulta: siempre la ultima buena. */
export function completarDsl(fuente: () => CanonicalForm | undefined): CompletionSource {
  return (contexto: CompletionContext): CompletionResult | null => {
    const palabra = contexto.matchBefore(PALABRA);
    if (palabra === null && !contexto.explicit) return null;
    return { from: palabra?.from ?? contexto.pos, options: opcionesDeCompletado(fuente()), validFor: /^[\w.-]*$/ };
  };
}
