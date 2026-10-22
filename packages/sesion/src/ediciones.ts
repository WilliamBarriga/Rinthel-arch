import type { Issue, TextPosition, TextRange } from 'canonico';
import { compile } from 'dsl';
import type { ArchivosDelWorkspace } from 'dsl';

/** Edicion de texto sobre un archivo del Workspace, con el hash del contenido que vio quien la pide. */
export interface EdicionConHash {
  file: string;
  /** Rango 1-based, fin excluido (el mismo de `IssueFix`). */
  range: TextRange;
  replacement: string;
  /** `hashDeContenido` del archivo tal como lo vio el llamador. */
  hash: string;
}

/** Intencion de mover un Pin: el servidor calcula el texto; el llamador no conoce la sintaxis. */
export interface IntencionDePin {
  vista: string;
  /** Id cualificado del Nodo. */
  nodo: string;
  x: number;
  y: number;
  /** `hashDeContenido` del archivo que contiene la Vista, tal como lo vio el llamador. */
  hash: string;
}

export type MotivoDeRechazo =
  | 'hash-desactualizado'
  | 'archivo-desconocido'
  | 'rango-invalido'
  | 'ediciones-solapadas'
  | 'vista-desconocida'
  | 'invalida';

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
 * devueltos son los del Workspace resultante.
 */
export function aplicarEdiciones(
  archivos: ArchivosDelWorkspace,
  ediciones: readonly EdicionConHash[],
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

  const conteo = new Map<string, number>();
  for (const i of compile(archivos).issues) if (i.severity === 'error') conteo.set(clave(i), (conteo.get(clave(i)) ?? 0) + 1);
  const despues = compile(resultado).issues;
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
 * Traduce la intencion de mover un Pin a la edicion minima: reemplaza `pin x,y` si el Nodo ya
 * lo tiene en la Vista, lo anade al override si existe sin pin, o crea `node <id> { pin x,y }`
 * al final de la Vista. Formato fijo: x e y se redondean a enteros y se limitan a +-100000; el resto del archivo no cambia. Rechaza hash viejo, Vista
 * desconocida y cualquier intencion cuyo resultado no compile limpio (p. ej. Nodo inexistente).
 */
export function edicionDePin(
  archivos: ArchivosDelWorkspace,
  intencion: IntencionDePin,
): ResultadoDeEdicion<{ ediciones: EdicionConHash[] }> {
  const { vista, nodo } = intencion;
  const [x, y] = [coordenadaDePin(intencion.x), coordenadaDePin(intencion.y)];
  const compilado = compile(archivos);
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

  const prueba = aplicarEdiciones(archivos, [hecha]);
  if (!prueba.ok) return prueba;
  return { ok: true, ediciones: [hecha] };
}
