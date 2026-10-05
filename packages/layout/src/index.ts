/**
 * `layout` — calcula la geometria de una Vista (ELK y Pin).
 *
 * `layoutView(vista, tema, opciones)` recibe una `VistaResuelta` y devuelve la
 * `Geometria`: caja por Nodo visible, con `x`/`y` relativos al Grupo padre. Los
 * Grupos colapsados son hojas. El tamano de cada Nodo sale del texto y de las
 * fuentes del Tema (`fonts`, `tokens.fontSize`), sin DOM. `claveDeLayout` dice
 * cuando hace falta relayoutar: cambia con estructura, textos y fuentes, nunca
 * con paleta, colores o iconos.
 *
 * Invariantes: determinista (misma entrada, misma geometria); `INCLUDE_CHILDREN`
 * sin `considerModelOrder` (ADR 0004); el mismo codigo corre en Node y en Web
 * Worker. Los `Pin` se aplicaran despues de ELK como posicion relativa al Grupo
 * padre (ADR 0004); todavia no se leen.
 * Modos de error: fallos internos de ELK se propagan como rechazo de la promesa.
 * Configuracion requerida: ninguna; `opciones.elk` inyecta otro motor (p. ej. el
 * de Web Worker del shell).
 * Solo importa paquetes anteriores en la cadena `canonico -> dsl -> layout`.
 */
export const paquete = 'layout';

export { claveDeLayout, layoutView } from './layout';
export type { CajaDeNodo, Geometria, OpcionesDeLayout } from './layout';
