import { hashDeContenido } from 'canonico';
import type { Issue, MotivoDeRechazo, TextPosition, TextRange } from 'canonico';
import { compile } from 'dsl';
import type { ArchivosDelWorkspace } from 'dsl';

/** Vive en `canonico` (puro, lo usa tambien el editor del navegador); se reexporta por compatibilidad. */
export { hashDeContenido };

export interface EdicionConHash {
  file: string;
  /** Rango 1-based, fin excluido (el mismo de `IssueFix`). */
  range: TextRange;
  replacement: string;
  /** `hashDeContenido` del archivo tal como lo vio el llamador. */
  hash: string;
}

/** Con `ok: false` no se escribe nada. */
export type ResultadoDeEdicion<T> =
  | ({ ok: true } & T)
  | { ok: false; reason: MotivoDeRechazo; message: string; file?: string };

export const rechazo = (reason: MotivoDeRechazo, message: string, file?: string) =>
  ({ ok: false, reason, message, ...(file === undefined ? {} : { file }) }) as const;

/** Offset de una posicion 1-based; `undefined` si cae fuera del texto. */
export function offsetDe(texto: string, { line, column }: TextPosition): number | undefined {
  let inicio = 0;
  for (let n = 1; n < line; n++) {
    const salto = texto.indexOf('\n', inicio);
    if (salto === -1) return undefined;
    inicio = salto + 1;
  }
  const offset = inicio + column - 1;
  const finDeLinea = texto.indexOf('\n', inicio);
  const limite = finDeLinea === -1 ? texto.length : finDeLinea;
  return column >= 1 && offset <= limite ? offset : undefined;
}

/** Un error es el mismo si comparte codigo y archivo, aunque cambie su message o su linea. */
const clave = (issue: Issue) => `${issue.code}|${issue.file}`;

/** Los errores preexistentes no bloquean una edicion ajena. */
export const erroresPorClave = (issues: readonly Issue[]): Map<string, number> => {
  const conteo = new Map<string, number>();
  for (const i of issues) if (i.severity === 'error') conteo.set(clave(i), (conteo.get(clave(i)) ?? 0) + 1);
  return conteo;
};

/**
 * Devuelve el mapa nuevo sin mutar la entrada. Todo o nada: rechaza si un hash no coincide, un rango es invalido,
 * dos ediciones se solapan o el resultado tiene mas errores por codigo y archivo que `erroresAntes`.
 * Los `issues` son los del Workspace resultante.
 */
export function aplicarSobre(
  archivos: ArchivosDelWorkspace,
  ediciones: readonly EdicionConHash[],
  erroresAntes: Map<string, number>,
): ResultadoDeEdicion<{ archivos: ArchivosDelWorkspace; issues: Issue[] }> {
  const r = reemplazarTexto(archivos, ediciones);
  if (!r.ok) return r;
  const resultado = r.archivos;
  const despues = compile(resultado).issues;
  const conteo = new Map(erroresAntes);
  const nuevo = despues.find((i) => {
    if (i.severity !== 'error') return false;
    const restantes = conteo.get(clave(i)) ?? 0;
    conteo.set(clave(i), restantes - 1);
    return restantes <= 0;
  });
  if (nuevo !== undefined) return rechazo('invalid', `The edit introduces an error: ${nuevo.message}`, nuevo.file);
  return { ok: true, archivos: resultado, issues: despues };
}

/**
 * Como `aplicarSobre` pero sin la auto-prueba de errores: rechaza solo por archivo, hash, rango o solape. Es la de los
 * guardados del editor, que se escriben aunque no compilen (ADR 0007).
 */
export function reemplazarTexto(archivos: ArchivosDelWorkspace, ediciones: readonly EdicionConHash[]): ResultadoDeEdicion<{ archivos: ArchivosDelWorkspace }> {
  const porArchivo = new Map<string, { inicio: number; fin: number; texto: string }[]>();
  for (const { file, range, replacement, hash } of ediciones) {
    const actual = archivos[file];
    if (actual === undefined) return rechazo('unknown-file', `File '${file}' does not exist`, file);
    if (hash !== hashDeContenido(actual)) {
      return rechazo('stale-hash', `File '${file}' changed since it was read`, file);
    }
    const inicio = offsetDe(actual, range.start);
    const fin = offsetDe(actual, range.end);
    if (inicio === undefined || fin === undefined || fin < inicio) {
      return rechazo('invalid-range', `Range outside file '${file}'`, file);
    }
    porArchivo.set(file, [...(porArchivo.get(file) ?? []), { inicio, fin, texto: replacement }]);
  }

  const resultado: Record<string, string> = { ...archivos };
  for (const [file, lista] of porArchivo) {
    const orden = [...lista].sort((a, b) => b.inicio - a.inicio || b.fin - a.fin);
    let texto = archivos[file] as string;
    let limite = Infinity;
    for (const { inicio, fin, texto: nuevo } of orden) {
      if (fin > limite) return rechazo('overlapping-edits', `Overlapping edits in '${file}'`, file);
      texto = texto.slice(0, inicio) + nuevo + texto.slice(fin);
      limite = inicio;
    }
    resultado[file] = texto;
  }
  return { ok: true, archivos: resultado };
}

/** `aplicarSobre` contando los errores previos del propio mapa. */
export function aplicarEdiciones(
  archivos: ArchivosDelWorkspace,
  ediciones: readonly EdicionConHash[],
): ResultadoDeEdicion<{ archivos: ArchivosDelWorkspace; issues: Issue[] }> {
  return aplicarSobre(archivos, ediciones, erroresPorClave(compile(archivos).issues));
}
