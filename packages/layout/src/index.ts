/**
 * `layout` — calcula la geometria de una Vista (ELK y Pin).
 *
 * `layoutView(vista, tema, opciones)` recibe una `VistaResuelta` y devuelve la
 * `Geometria`: caja por Nodo visible, con `x`/`y` relativos al Grupo padre, y ruta
 * ortogonal por Arista (`idDeArista`), en coordenadas del lienzo. Los
 * Grupos colapsados son hojas. Un Nodo hoja con Atributos mide cabecera mas una
 * fila por Atributo y las Aristas a `nodo#atributo` terminan en la fila del
 * Atributo; un Grupo abierto no lista Atributos. `Metricas` (`metricasDe(tema)`)
 * son los numeros de espaciado y escala que `layout` usa para medir y `render`
 * para dibujar, junto con `yDeFila`, `atributosVisibles` y `textoDeAtributo`:
 * lo reservado y lo dibujado no divergen. Los Atributos se miden a la escala
 * con que se dibujan. El tamano de cada Nodo sale del texto y de las Metricas
 * (derivadas de `fonts` y `tokens.fontSize`), sin DOM; `opciones.metricas` las
 * sobrescribe (y `render` debe recibir las mismas). `claveDeLayout` dice cuando
 * hace falta relayoutar: cambia con estructura, textos y Metricas, nunca con
 * paleta, colores o iconos.
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
export { claveDeLayout, layoutView } from './layout';
export { atributosVisibles, metricasDe, textoDeAtributo, yDeFila } from './metricas';
export type { Metricas } from './metricas';
export type { CajaDeNodo, Geometria, OpcionesDeLayout, Punto, RutaDeArista } from './layout';
