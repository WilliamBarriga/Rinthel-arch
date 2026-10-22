/**
 * `layout` — calcula la geometria de una Vista (ELK y Pin).
 *
 * `layoutView(vista, tema, opciones)` recibe una `VistaResuelta` y devuelve la
 * `Geometria`: caja por Nodo visible, con `x`/`y` relativos al Grupo padre, y ruta
 * ortogonal por Arista (`idDeArista`), en coordenadas del lienzo. Los
 * Grupos colapsados son hojas. Un Nodo hoja con Atributos mide cabecera mas una
 * fila por Atributo y las Aristas a `nodo#atributo` terminan en la fila del
 * Atributo; un Grupo abierto no lista Atributos. `alturasDeNodo`, `yDeFila`,
 * `atributosVisibles` y `textoDeAtributo` son esa misma medida, para que `render`
 * dibuje lo que `layout` reservo. El tamano de cada Nodo sale del texto y de las
 * fuentes del Tema (`fonts`, `tokens.fontSize`), sin DOM. `claveDeLayout` dice
 * cuando hace falta relayoutar: cambia con estructura, textos y fuentes, nunca
 * con paleta, colores o iconos.
 *
 * Invariantes: determinista (misma entrada, misma geometria); `INCLUDE_CHILDREN`
 * sin `considerModelOrder` (ADR 0003); el mismo codigo corre en Node y en Web
 * Worker. Los `pin` de los overrides se aplican despues de ELK como posicion
 * relativa al Grupo padre (ADR 0003): solo se re-enrutan las Aristas que tocan
 * Nodos movidos, y un Pin sobre un Nodo ausente de la Vista se ignora.
 * `Geometria.pinsSolapados` lista los pares de Pins que se solapan, para que
 * `validate` emita `W_OVERLAPPING_PINS` con la posicion del texto.
 * Modos de error: fallos internos de ELK se propagan como rechazo de la promesa.
 * Configuracion requerida: ninguna; `opciones.elk` inyecta otro motor (p. ej. el
 * de Web Worker del shell).
 * Solo importa paquetes anteriores en la cadena `canonico -> dsl -> layout`.
 */
export { ESCALA_ETIQUETA, claveDeLayout, layoutView } from './layout';
export { alturasDeNodo, atributosVisibles, textoDeAtributo, yDeFila } from './medidas';
export type { CajaDeNodo, Geometria, OpcionesDeLayout, Punto, RutaDeArista } from './layout';
