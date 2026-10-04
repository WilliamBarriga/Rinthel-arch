/**
 * `layout` — calcula la geometria de una Vista (ELK y Pin).
 *
 * Interfaz publica. Todo lo que no sale de este archivo (ni de `exports` del
 * `package.json`) es privado y puede cambiar sin avisar.
 *
 * Hoy:
 * - `paquete`: identidad del paquete, observable por cualquier consumidor.
 *
 * Previsto (spec #19, aun sin implementar):
 * `layoutView(vistaResuelta, theme, opciones) -> Geometria` (asincrona por ELK).
 * La `Geometria` trae por Nodo posicion relativa al Grupo padre y tamano, y por
 * Arista la ruta ortogonal con sus puertos.
 *
 * Invariantes:
 * - Determinista: la misma entrada produce la misma geometria; sirve igual en
 *   Node (build) y en Web Worker (shell).
 * - Los `Pin` se aplican despues de ELK como posicion relativa al Grupo padre y
 *   solo se re-enrutan las Aristas que tocan Nodos pineados.
 * - ELK es el adaptador de este modulo: vive en el borde y se inyecta como
 *   argumento, nunca se importa desde el nucleo de otros paquetes.
 * - Solo importa paquetes anteriores en la cadena
 *   `canonico -> dsl -> layout -> render -> shell / cli`, por nombre de paquete
 *   y unicamente por lo que declara `exports` de ese paquete.
 *
 * Modos de error:
 * - Entrada invalida (Vista resuelta o Tema incompletos): excepcion de uso, con
 *   el motivo en el mensaje.
 * - Fallos internos de ELK: se propagan como excepcion; no hay estado que
 *   mutar ni que dejar a medias.
 *
 * Configuracion requerida: motor de layout inyectado como argumento.
 */
export const paquete = 'layout';
