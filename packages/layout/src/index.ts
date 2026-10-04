/**
 * `layout` — calcula la geometria de una Vista (ELK y Pin).
 *
 * Invariantes: determinista; `Pin` se aplican despues de ELK como posicion
 * relativa al Grupo padre; solo re-enrutan aristas que tocan nodos pineados.
 * Modos de error: entrada invalida lanza excepcion de uso; fallos internos
 * de ELK se propagan. Configuracion requerida: motor inyectado como argumento.
 * Solo importa paquetes anteriores en la cadena `canonico -> dsl -> layout`.
 */
export const paquete = 'layout';
