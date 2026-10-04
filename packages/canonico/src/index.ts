/**
 * `canonico` — esquema, validacion y resolucion de la Fuente canonica.
 *
 * Interfaz publica. Todo lo que no sale de este archivo (ni de `exports` del
 * `package.json`) es privado y puede cambiar sin avisar.
 *
 * Hoy (ticket #21):
 * - `fuenteCanonicaSchema`: esquema Zod de la Fuente canonica, limitado a
 *   Nodos y al catalogo de Tipos de nodo, mas los esquemas que lo componen
 *   (`nodoSchema`, `tipoDeNodoSchema`, `idDeNodoSchema`) y sus tipos.
 * - `Issue` (y `Severity`, `IssueFix`, `IssueRelated`, `TextPosition`,
 *   `TextRange`): contrato de salida de `validate` (ADR 0008). `hint`,
 *   `related` y `fix` son opcionales; `fix` solo se emite con un unico
 *   candidato inequivoco, con ambiguedad queda `hint`.
 * - `CODIGOS`: catalogo de codigos de issue estables de v1 (spec #19), con
 *   `CODIGOS_DEPRECADOS` y el tipo `Codigo`.
 * - `paquete`: identidad del paquete, observable por cualquier consumidor.
 *
 * Aun no hay validador: en #21 solo va el esquema, el tipo `Issue` y el
 * catalogo de codigos. `validate(canonico) -> issues`, `resolveView` y
 * `revealAt` llegan en tickets posteriores (spec #19).
 *
 * Invariantes:
 * - Nucleo puro: sin I/O, sin reloj, sin estado global. Las dependencias entran
 *   como argumento y las funciones devuelven resultados, no mutan.
 * - Los ids cualificados (`a.b.c`) definen la jerarquia del Modelo. Si el
 *   documento anida con `children`, cada Nodo debe estar bajo su padre
 *   jerarquico; un documento plano tambien es valido. Todo Nodo con prefijo
 *   jerarquico tiene ese padre declarado en el Modelo (no hay hijos huerfanos).
 * - El `type` de un Nodo es siempre un nombre declarado en
 *   `specification.nodeTypes`.
 * - Un color es un nombre de Paleta, nunca un valor literal (ADR 0006); el
 *   valor hex vive solo dentro del Tema.
 * - Los problemas de validacion y de compilacion son datos: lista de `issues`
 *   con `code` estable, `severity`, `file`, `line` y `column`, en orden
 *   determinista (archivo, linea, columna, codigo).
 * - Los codigos de issue se deprecan, nunca se reciclan (ADR 0008): un valor
 *   retirado pasa a `CODIGOS_DEPRECADOS` y no vuelve a usarse.
 * - Posiciones: `line` y `column` son 1-based. Un `fix.range` apunta al texto
 *   que se reemplaza con inicio incluido y final excluido.
 * - Solo importa paquetes anteriores en la cadena
 *   `canonico -> dsl -> layout -> render -> shell / cli`, por nombre de paquete
 *   y unicamente por lo que declara `exports` de ese paquete.
 *
 * Orden de llamadas: aun no hay funciones en la interfaz. Previsto (spec #19):
 * `validate(canonico) -> issues`, `resolveView(canonico, vistaId, estado?)` y
 * `revealAt(vistaResuelta, posicion)`; cada una es pura y recibe todo por
 * argumento.
 *
 * Modos de error:
 * - Invalidacion del dominio: se devuelve como `issues`; nunca lanza.
 * - Rechazo del esquema: `fuenteCanonicaSchema.safeParse` devuelve
 *   `success: false` con `error.issues` (zod), cada uno con `path` hasta el
 *   campo. Son errores de forma, no `Issue` del ADR 0008.
 * - Excepcion solo para fallos de uso (argumento fuera del contrato) o fallos
 *   internos.
 *
 * Configuracion requerida: ninguna.
 */
export const paquete = 'canonico';

export { fuenteCanonicaSchema, idDeNodoSchema, nodoSchema, tipoDeNodoSchema } from './esquema';
export type {
  CatalogoDeTiposDeNodo,
  FuenteCanonica,
  Modelo,
  Nodo,
  TipoDeNodo,
} from './esquema';

export type { Issue, IssueFix, IssueRelated, Severity, TextPosition, TextRange } from './issue';

export { CODIGOS, CODIGOS_DEPRECADOS } from './codigos';
export type { Codigo } from './codigos';
