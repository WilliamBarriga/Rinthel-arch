/** Gestos: cada Intencion se reduce a que ubicar y que texto escribir. Interno: se entra por `aplicarIntencion`. */
import type { FuenteCanonica, IntencionDeOrden, IntencionDePin, Issue, TextRange, Ubicador } from 'canonico';
import { compile } from 'dsl';
import type { ArchivosDelWorkspace } from 'dsl';

import { aplicarSobre, erroresPorClave, hashDeContenido, offsetDe, rechazo } from './ediciones';
import type { EdicionConHash, ResultadoDeEdicion } from './ediciones';

export type ResultadoDeGesto = ResultadoDeEdicion<{
  archivos: ArchivosDelWorkspace;
  ediciones: EdicionConHash[];
  issues: Issue[];
}>;

/** Archivo -> `hashDeContenido` del texto que vio quien emite la Intencion. Un archivo sin entrada se aplica sobre el vigente. */
export type Visto = Readonly<Record<string, string>>;

type Rechazo = Extract<ResultadoDeGesto, { ok: false }>;

/**
 * `reemplazar` un rango por `por`, o `insertar` una sentencia en el sitio vacio `en` (antes de una llave de cierre):
 * en su propia linea si esa llave esta sola, en la misma linea si no.
 */
type Escritura = { file: string } & ({ reemplazar: TextRange; por: string } | { en: TextRange; insertar: string });

interface Contexto {
  declarada: FuenteCanonica['views'][number];
  indice: number;
  ubicar: Ubicador;
  texto: (file: string) => string;
}

function edicionDe(escritura: Escritura, texto: string): EdicionConHash {
  const { file } = escritura;
  const hash = hashDeContenido(texto);
  if ('reemplazar' in escritura) return { file, range: escritura.reemplazar, replacement: escritura.por, hash };
  const { en, insertar } = escritura;
  const linea = texto.split('\n')[en.start.line - 1] ?? '';
  const previo = linea.slice(0, en.start.column - 1);
  if (previo.trim() === '') {
    const inicio = { line: en.start.line, column: 1 };
    return { file, range: { start: inicio, end: inicio }, replacement: `${previo}  ${insertar}\n`, hash };
  }
  return { file, range: en, replacement: `${/\s$/.test(previo) ? '' : ' '}${insertar} `, hash };
}

/** Comprueba `visto` contra el archivo que se toca y auto-prueba la edicion (todo o nada); 2 compilaciones en total. */
function gesto(
  archivos: ArchivosDelWorkspace,
  vista: string,
  visto: Visto | undefined,
  describir: (contexto: Contexto) => Escritura | Rechazo,
): ResultadoDeGesto {
  const compilado = compile(archivos);
  const { canonico: fuente, ubicar } = compilado;
  if (fuente === undefined || ubicar === undefined) {
    const primero = compilado.issues.find((i) => i.severity === 'error');
    return rechazo('invalida', `El Workspace tiene errores: ${primero?.message ?? ''}`, primero?.file);
  }
  const indice = fuente.views.findIndex(({ id }) => id === vista);
  const declarada = fuente.views[indice];
  if (declarada === undefined) return rechazo('vista-desconocida', `La Vista '${vista}' no existe`);

  const texto = (file: string) => archivos[file] as string;
  const escritura = describir({ declarada, indice, ubicar, texto });
  if ('ok' in escritura) return escritura;
  const { file } = escritura;
  const hashVisto = visto?.[file];
  if (hashVisto !== undefined && hashVisto !== hashDeContenido(texto(file))) {
    return rechazo('hash-desactualizado', `El archivo '${file}' cambio desde que se leyo`, file);
  }
  const edicion = edicionDe(escritura, texto(file));
  const aplicada = aplicarSobre(archivos, [edicion], erroresPorClave(compilado.issues));
  if (!aplicada.ok) return aplicada;
  return { ok: true, archivos: aplicada.archivos, ediciones: [edicion], issues: aplicada.issues };
}

/** Las coordenadas de un Pin se escriben como enteros en [-LIMITE_DE_PIN, LIMITE_DE_PIN]. */
const LIMITE_DE_PIN = 100_000;
const coordenadaDePin = (n: number): number => Math.min(LIMITE_DE_PIN, Math.max(-LIMITE_DE_PIN, Math.round(n))) + 0;

/**
 * Reemplaza el `pin` del override del Nodo, lo agrega a un override sin `pin`, o inserta `node <id> { pin x,y }`
 * antes de la `}` de la Vista. Un Nodo inexistente rechaza con `invalida`.
 */
export function moverPin(archivos: ArchivosDelWorkspace, intencion: IntencionDePin, visto?: Visto): ResultadoDeGesto {
  const { nodo } = intencion;
  const pin = `pin ${coordenadaDePin(intencion.x)},${coordenadaDePin(intencion.y)}`;
  return gesto(archivos, intencion.vista, visto, ({ declarada, indice, ubicar, texto }) => {
    const j = declarada.overrides.findIndex((o) => o.node === nodo);
    const sitio = j >= 0 ? ubicar(['views', indice, 'overrides', j, 'pin']) : ubicar(['views', indice, 'overrides']);
    if (sitio === null) return rechazo('invalida', `No se encontro donde escribir el Pin de '${nodo}'`);
    const { file, range } = sitio;
    const vacio = range.start.line === range.end.line && range.start.column === range.end.column;
    if (!vacio) return { file, reemplazar: range, por: pin };
    if (j < 0) return { file, en: range, insertar: `node ${nodo} { ${pin} }` };
    const sigue = texto(file)[offsetDe(texto(file), range.start) ?? 0];
    return { file, reemplazar: range, por: ` ${pin}${sigue === '}' ? ' ' : ''}` };
  });
}

/**
 * `orden` visible completo + las entradas de `viejo` que no se ven (ocultas por `collapsed` o `exclude`): cada
 * una queda justo despues de la entrada que la precedia en `viejo` (o al principio si ninguna sobrevive).
 */
function ordenConOcultas(orden: readonly string[], viejo: readonly string[]): string[] {
  const resultado = [...new Set(orden)];
  viejo.forEach((id, i) => {
    if (resultado.includes(id)) return;
    const previo = viejo.slice(0, i).filter((p) => resultado.includes(p)).at(-1);
    resultado.splice(previo === undefined ? 0 : resultado.indexOf(previo) + 1, 0, id);
  });
  return resultado;
}

/**
 * Reescribe el `order` completo de una Vista de secuencia (las entradas ocultas conservan su posicion relativa)
 * o lo inserta antes de la `}` de la Vista, aunque coincida con la primera aparicion. Un id que no es Nodo rechaza con `invalida`.
 */
export function ordenarLifelines(archivos: ArchivosDelWorkspace, intencion: IntencionDeOrden, visto?: Visto): ResultadoDeGesto {
  const { vista } = intencion;
  return gesto(archivos, vista, visto, ({ declarada, indice, ubicar }) => {
    if (declarada.type !== 'sequence') return rechazo('invalida', `La Vista '${vista}' no es de secuencia`);
    const total = declarada.order.length;
    const inicio = total > 0 ? ubicar(['views', indice, 'order', 0]) : ubicar(['views', indice, 'overrides']);
    const fin = total > 0 ? ubicar(['views', indice, 'order', total - 1]) : inicio;
    if (inicio === null || fin === null) return rechazo('invalida', `No se encontro donde escribir el order de '${vista}'`);
    const lista = ordenConOcultas(intencion.orden, declarada.order).join(', ');
    const { file } = inicio;
    if (total > 0) return { file, reemplazar: { start: inicio.range.start, end: fin.range.end }, por: lista };
    return { file, en: inicio.range, insertar: `order ${lista}` };
  });
}
