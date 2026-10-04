/**
 * `cli` — comandos `validate`, `build` y `export`.
 *
 * Interfaz publica. Todo lo que no sale de este archivo (ni de `exports` del
 * `package.json`) es privado y puede cambiar sin avisar.
 *
 * Hoy:
 * - `paquete`: identidad del paquete, observable por cualquier consumidor.
 *
 * Previsto (spec #19, aun sin implementar): `validate` (contrato JSON
 * versionado con `issues` y `fix`), `build` (compila, valida y escribe la
 * geometria cacheada) y `export` (SVG, PNG con resvg y HTML autocontenido),
 * con `--workspace`, `--theme`, `--theme-path`, `--json`, `--max-issues` y
 * `--strict`.
 *
 * Invariantes:
 * - Unico paquete con I/O de disco: lee el Workspace y escribe la salida
 *   derivada en `<workspace>/.diagrams/`; el nucleo recibe el mapa en memoria.
 * - `validate` nunca reescribe archivos y siempre devuelve todos los issues en
 *   una sola pasada.
 * - Codigos de salida: 0 limpio, 1 con issues, 2 fallo de uso.
 * - Importa solo paquetes anteriores en la cadena
 *   `canonico -> dsl -> layout -> render -> shell / cli`, por nombre de paquete
 *   y unicamente por lo que declara `exports` de ese paquete. Nunca importa de
 *   `shell`.
 *
 * Modos de error:
 * - Issues de validacion/compilacion: datos en la salida, con la posicion.
 * - Fallo de uso (ruta inexistente, opcion mala): mensaje en stderr y codigo 2.
 * - Excepcion solo para fallos internos.
 *
 * Configuracion requerida: `--workspace <ruta>`.
 */
export const paquete = 'cli';
