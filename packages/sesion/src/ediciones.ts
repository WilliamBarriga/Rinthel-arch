import type { Issue, IntencionDePin, MotivoDeRechazo, TextPosition, TextRange } from 'canonico';
import { compile } from 'dsl';
import type { ArchivosDelWorkspace, ResultadoDeCompilacion } from 'dsl';

/** Edicion de texto sobre un archivo del Workspace, con el hash del contenido que vio quien la pide. */
export interface EdicionConHash {
  file: string;
  /** Rango 1-based, fin excluido (el mismo de `IssueFix`). */
  range: TextRange;
  replacement: string;
  /** `hashDeContenido` del archivo tal como lo vio el llamador. */
  hash: string;
}

export type ResultadoDeEdicion<T> =
  | ({ ok: true } & T)
  | { ok: false; motivo: MotivoDeRechazo; mensaje: string; file?: string };

/** Hash estable (53 bits, hex) del contenido de un archivo; no criptografico. Puro, sin `node:crypto`. */
export function hashDeContenido(texto: string): string {
  let h1 = 0xdeadbeef;
  let h2 = 0x41c6ce57;
  for (let i = 0; i < texto.length; i++) {
    const c = texto.charCodeAt(i);
    h1 = Math.imul(h1 ^ c, 2654435761);
    h2 = Math.imul(h2 ^ c, 1597334677);
  }
  h1 = Math.imul(h1 ^ (h1 >>> 16), 2246822507) ^ Math.imul(h2 ^ (h2 >>> 13), 3266489909);
  h2 = Math.imul(h2 ^ (h2 >>> 16), 2246822507) ^ Math.imul(h1 ^ (h1 >>> 13), 3266489909);
  return (4294967296 * (2097151 & h2) + (h1 >>> 0)).toString(16).padStart(14, '0');
}

const rechazo = (motivo: MotivoDeRechazo, mensaje: string, file?: string) =>
  ({ ok: false, motivo, mensaje, ...(file === undefined ? {} : { file }) }) as const;

/** Offset de una posicion 1-based; `undefined` si cae fuera del texto. */
function offsetDe(texto: string, { line, column }: TextPosition): number | undefined {
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

/** Clave estable ante cambios de mensaje o de linea: un error es el mismo si comparte codigo y archivo. */
const clave = (issue: Issue) => `${issue.code}|${issue.file}`;

/** Conteo de errores por `clave` (codigo y archivo): los preexistentes no bloquean una edicion ajena. */
const erroresPorClave = (issues: readonly Issue[]): Map<string, number> => {
  const conteo = new Map<string, number>();
  for (const i of issues) if (i.severity === 'error') conteo.set(clave(i), (conteo.get(clave(i)) ?? 0) + 1);
  return conteo;
};

/** Limite de coordenadas de un Pin: enteros dentro de este rango (formato fijo del DSL escrito). */
const LIMITE_DE_PIN = 100_000;
const coordenadaDePin = (n: number): number => Math.min(LIMITE_DE_PIN, Math.max(-LIMITE_DE_PIN, Math.round(n))) + 0;

/**
 * Aplica ediciones `{ file, range, replacement, hash }` sobre el mapa de archivos y devuelve
 * el mapa nuevo; no toca disco ni muta la entrada. Todo o nada: si algun hash no coincide con
 * el contenido actual, un rango es invalido, dos ediciones se solapan, o el resultado
 * introduce errores que antes no estaban (se cuentan por codigo y archivo: un error
 * preexistente cuyo mensaje cambia no cuenta como nuevo, uno adicional si), no se
 * devuelve ningun archivo. Los `issues`
 * devueltos son los del Workspace resultante. `erroresAntes` es el conteo de errores
 * del mapa de entrada ya hecho por quien llama: reutiliza compilaciones pagadas.
 */
function aplicarSobre(
  archivos: ArchivosDelWorkspace,
  ediciones: readonly EdicionConHash[],
  erroresAntes: Map<string, number>,
): ResultadoDeEdicion<{ archivos: ArchivosDelWorkspace; issues: Issue[] }> {
  const porArchivo = new Map<string, { inicio: number; fin: number; texto: string }[]>();
  for (const { file, range, replacement, hash } of ediciones) {
    const actual = archivos[file];
    if (actual === undefined) return rechazo('archivo-desconocido', `El archivo '${file}' no existe`, file);
    if (hash !== hashDeContenido(actual)) {
      return rechazo('hash-desactualizado', `El archivo '${file}' cambio desde que se leyo`, file);
    }
    const inicio = offsetDe(actual, range.start);
    const fin = offsetDe(actual, range.end);
    if (inicio === undefined || fin === undefined || fin < inicio) {
      return rechazo('rango-invalido', `Rango fuera del archivo '${file}'`, file);
    }
    porArchivo.set(file, [...(porArchivo.get(file) ?? []), { inicio, fin, texto: replacement }]);
  }

  const resultado: Record<string, string> = { ...archivos };
  for (const [file, lista] of porArchivo) {
    const orden = [...lista].sort((a, b) => b.inicio - a.inicio || b.fin - a.fin);
    let texto = archivos[file] as string;
    let limite = Infinity;
    for (const { inicio, fin, texto: nuevo } of orden) {
      if (fin > limite) return rechazo('ediciones-solapadas', `Ediciones solapadas en '${file}'`, file);
      texto = texto.slice(0, inicio) + nuevo + texto.slice(fin);
      limite = inicio;
    }
    resultado[file] = texto;
  }

  const despues = compile(resultado).issues;
  const conteo = new Map(erroresAntes);
  const nuevo = despues.find((i) => {
    if (i.severity !== 'error') return false;
    const restantes = conteo.get(clave(i)) ?? 0;
    conteo.set(clave(i), restantes - 1);
    return restantes <= 0;
  });
  if (nuevo !== undefined) return rechazo('invalida', `La edicion introduce un error: ${nuevo.message}`, nuevo.file);
  return { ok: true, archivos: resultado, issues: despues };
}

/**
 * Aplica ediciones `{ file, range, replacement, hash }` sobre el mapa de archivos y devuelve
 * el mapa nuevo; no toca disco ni muta la entrada. Misma semantica todo o nada que
 * `aplicarSobre`, con su `motivo` de rechazo.
 */
export function aplicarEdiciones(
  archivos: ArchivosDelWorkspace,
  ediciones: readonly EdicionConHash[],
): ResultadoDeEdicion<{ archivos: ArchivosDelWorkspace; issues: Issue[] }> {
  return aplicarSobre(archivos, ediciones, erroresPorClave(compile(archivos).issues));
}

/**
 * Gesto de editar un Pin (ADR 0005): fusa calcular la edicion minima, auto-probarla
 * una vez y aplicar en memoria. Devuelve los archivos nuevos (sin tocar disco), las
 * ediciones calculadas y los issues del Workspace resultante. Pura; reutiliza la
 * compilacion unica que localiza el Pin tambien para comparar errores, de modo que
 * un gesto paga 2 compilaciones del Workspace en total. `aplicarEdiciones` queda
 * exportada: es la entrada de las ediciones ya calculadas (`--edits`, `fix`).
 * Rechaza hash viejo, Vista desconocida y cualquier
 * intencion cuyo resultado no compile limpio (p. ej. Nodo inexistente).
 */
export function editarPin(
  archivos: ArchivosDelWorkspace,
  intencion: IntencionDePin,
): ResultadoDeEdicion<{ archivos: ArchivosDelWorkspace; ediciones: EdicionConHash[]; issues: Issue[] }> {
  const compilado = compile(archivos);
  const calculada = edicionDePinSobre(archivos, intencion, compilado);
  if (!calculada.ok) return calculada;
  const aplicada = aplicarSobre(archivos, calculada.ediciones, erroresPorClave(compilado.issues));
  if (!aplicada.ok) return aplicada;
  return { ok: true, archivos: aplicada.archivos, ediciones: calculada.ediciones, issues: aplicada.issues };
}

/** Calculo del Pin compartido; la auto-prueba la hace la aplicacion unica de `editarPin`. */
function edicionDePinSobre(
  archivos: ArchivosDelWorkspace,
  intencion: IntencionDePin,
  compilado: ResultadoDeCompilacion,
): ResultadoDeEdicion<{ ediciones: EdicionConHash[] }> {
  const { vista, nodo } = intencion;
  const [x, y] = [coordenadaDePin(intencion.x), coordenadaDePin(intencion.y)];
  const { canonico: fuente, ubicar } = compilado;
  if (fuente === undefined || ubicar === undefined) {
    const primero = compilado.issues.find((i) => i.severity === 'error');
    return rechazo('invalida', `El Workspace tiene errores: ${primero?.message ?? ''}`, primero?.file);
  }
  const indice = fuente.views.findIndex(({ id }) => id === vista);
  const declarada = fuente.views[indice];
  if (declarada === undefined) return rechazo('vista-desconocida', `La Vista '${vista}' no existe`);

  const j = declarada.overrides.findIndex((o) => o.node === nodo);
  const sitio = j >= 0 ? ubicar(['views', indice, 'overrides', j, 'pin']) : ubicar(['views', indice, 'overrides']);
  if (sitio === null) return rechazo('invalida', `No se encontro donde escribir el Pin de '${nodo}'`);
  const { file, range } = sitio;
  const texto = archivos[file] as string;
  if (intencion.hash !== hashDeContenido(texto)) {
    return rechazo('hash-desactualizado', `El archivo '${file}' cambio desde que se leyo`, file);
  }

  const pin = `pin ${x},${y}`;
  const vacio = range.start.line === range.end.line && range.start.column === range.end.column;
  const edicion = (rango: TextRange, replacement: string): EdicionConHash => ({
    file,
    range: rango,
    replacement,
    hash: intencion.hash,
  });
  let hecha: EdicionConHash;
  if (!vacio) {
    hecha = edicion(range, pin);
  } else if (j >= 0) {
    const sigue = texto[offsetDe(texto, range.start) ?? 0];
    hecha = edicion(range, ` ${pin}${sigue === '}' ? ' ' : ''}`);
  } else {
    // Antes de la `}` de la Vista: en su propia linea si esa `}` esta sola, en linea si no.
    const linea = texto.split('\n')[range.start.line - 1] ?? '';
    const previo = linea.slice(0, range.start.column - 1);
    const bloque = `node ${nodo} { ${pin} }`;
    if (previo.trim() === '') {
      const inicio = { line: range.start.line, column: 1 };
      hecha = edicion({ start: inicio, end: inicio }, `${previo}  ${bloque}\n`);
    } else {
      hecha = edicion(range, `${/\s$/.test(previo) ? '' : ' '}${bloque} `);
    }
  }

  return { ok: true, ediciones: [hecha] };
}
