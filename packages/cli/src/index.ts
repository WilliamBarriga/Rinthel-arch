/**
 * `cli` — comandos `validate`, `build` y `export`.
 *
 * Invariantes: unico paquete con I/O de disco (lee Workspace, escribe en
 * `<workspace>/.diagrams/`); `validate` nunca reescribe y devuelve todos los
 * issues en una pasada. Modos de error: issues como datos en salida;
 * fallo de uso -> stderr + codigo 2; excepcion solo para fallos internos.
 * Configuracion requerida: `--workspace <ruta>`. Solo importa paquetes
 * anteriores en la cadena `canonico -> dsl -> layout -> render -> shell / cli`.
 */
export const paquete = 'cli';
