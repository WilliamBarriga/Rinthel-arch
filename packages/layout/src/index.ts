/**
 * `layout` — calcula la geometria de una Vista (ELK y Pin).
 *
 * `layoutView(vista, tema, opciones)` recibe una `VistaResuelta` y devuelve la
 * `Geometria`: caja por Nodo visible, con `x`/`y` relativos al Grupo padre, y ruta
 * ortogonal por Arista (`idDeArista`), en coordenadas del lienzo. Los
 * Grupos colapsados son hojas. Un Nodo hoja con Atributos mide cabecera mas una
 * fila por Atributo y las Aristas a `nodo#atributo` terminan en la fila del
 * Atributo; un Grupo abierto no lista Atributos. Las `Metricas` y la colocacion de
 * Slots son del paquete `tema` (`tablaDeMetricas`: una entrada por Tipo de nodo, Grupo
 * abierto, Grupo colapsado y etiqueta de Arista; `colocarNodo`, `colocarEnCaja`): `layout`
 * las usa para medir y `render` para dibujar, asi lo reservado y lo dibujado no
 * divergen. Cada caja de un Nodo hoja lleva `slots`, el rectangulo (relativo a la
 * caja) de cada Slot que el Tema muestra. El tamano de cada Nodo sale del texto y
 * de las Metricas, sin DOM; `opciones.metricas` las sobrescribe (y `render` debe
 * recibir las mismas). `claveDeLayout` dice cuando
 * hace falta relayoutar: cambia con estructura, textos, Pins y Metricas, nunca con
 * paleta, colores o iconos. `claveDeEstructura` es la misma sin Pins y
 * `aplicarPinsAGeometria(vista, base, tema)` aplica los Pins a una geometria calculada
 * sin ellos: mover un Pin no requiere volver a ejecutar ELK.
 *
 * `indiceDeGeometria(vista, geometria)` es la unica respuesta a las cajas
 * absolutas (lienzo), el padre de cada Nodo y las raices; `render` y `shell` la consumen.
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
 * Solo importa paquetes anteriores en la cadena `canonico -> tema -> dsl -> layout`.
 */
export { aplicarPinsAGeometria, claveDeEstructura, claveDeLayout, layoutView } from './layout';
export { indiceDeGeometria } from './indice';
export type { IndiceDeGeometria } from './indice';
export type { CajaDeNodo, Geometria, OpcionesDeLayout, Punto, RutaDeArista } from './layout';
