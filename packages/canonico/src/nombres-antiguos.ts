/**
 * Tabla de nombres antiguos (espanol) -> nuevos (ingles) del contrato publico. Un nombre antiguo no es un alias:
 * es un Issue de severidad `error` cuyo `fix` lo reescribe. La tabla es el unico sitio que sabe de los pares; cada
 * punto que valida un nombre consulta `renombreAntiguo` y arma el Issue con `issueDeRenombre` (o, si ya fabrica el
 * Issue por su cuenta, usa `candidato` de `ErrorDeCatalogo`).
 * Categorias de valores de catalogo: `motion`, `effect`, `state` y `theme` (#229). Los renombres de archivos y
 * carpetas del Workspace (#230) usan la misma forma con su propia tabla y codigo.
 */
import type { Issue, TextRange } from './issue';

export interface Renombre<Categoria extends string = string> {
  categoria: Categoria;
  antiguo: string;
  nuevo: string;
}

export type CategoriaDeCatalogo = 'motion' | 'effect' | 'state' | 'theme';

const par = (categoria: CategoriaDeCatalogo, antiguo: string, nuevo: string): Renombre<CategoriaDeCatalogo> => ({ categoria, antiguo, nuevo });

/** Valores de catalogo renombrados a ingles (#229). `aura` no cambia. */
export const VALORES_DE_CATALOGO_ANTIGUOS: readonly Renombre<CategoriaDeCatalogo>[] = Object.freeze([
  par('motion', 'flujo', 'stream'),
  par('motion', 'pulso', 'pulse'),
  par('motion', 'respiracion', 'breathe'),
  par('motion', 'giro', 'spin'),
  par('effect', 'fundido', 'fade'),
  par('effect', 'deslizar', 'slide'),
  par('effect', 'escala', 'zoom'),
  par('state', 'seleccionado', 'selected'),
  par('state', 'atenuado', 'dimmed'),
  par('state', 'foco', 'focus'),
  par('state', 'fantasma', 'ghost'),
  par('state', 'en-ruta', 'on-path'),
  par('theme', 'alto-contraste', 'high-contrast'),
  par('theme', 'claro-suave', 'soft-light'),
]);

/** El nombre nuevo de `escrito` si es un nombre antiguo de `categoria` en `tabla`; `undefined` si no. */
export function renombreAntiguo<C extends string>(tabla: readonly Renombre<C>[], categoria: C, escrito: string): string | undefined {
  return tabla.find((r) => r.categoria === categoria && r.antiguo === escrito)?.nuevo;
}

/** Issue `error` con `fix` que reescribe lo escrito en `rango` por `nuevo`. */
export function issueDeRenombre(code: string, mensaje: string, archivo: string, rango: TextRange, nuevo: string): Issue {
  return { code, severity: 'error', file: archivo, ...rango.start, message: mensaje, fix: { file: archivo, range: rango, replacement: nuevo } };
}

/** Mensaje comun de un valor de catalogo antiguo. */
export const mensajeDeValorAntiguo = (categoria: CategoriaDeCatalogo, antiguo: string, nuevo: string): string =>
  `'${antiguo}' is an old ${categoria} name; use '${nuevo}'`;
