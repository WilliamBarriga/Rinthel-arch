/**
 * Registro en disco: unico dueno en `cli` del Registro de actividad, que vive en la carpeta de salida de `workspace.ts`
 * (`<workspace>/.diagrams/actividad.jsonl`): el anexado con rotacion (lo usan `validate`, `build`, `inspect` y `edit`) y la
 * observacion (la usa `dev`). El esquema y el lector puro del registro son de `canonico`.
 * Invariantes: una linea por anexado, escrita con un solo `write` en modo append; al pasar 1 MB rota a
 * `actividad.1.jsonl` (una generacion). La observacion sondea con `fs.watchFile`, que funciona aunque el archivo aun no
 * exista y ve la rotacion (otro inodo, otro tamano).
 * Errores: `anexarAlRegistro` lanza si no puede escribir (quien anexa decide); `leer` de un registro ausente da `undefined`.
 */
import { appendFileSync, mkdirSync, readFileSync, renameSync, statSync, unwatchFile, watchFile } from 'node:fs';
import { join } from 'node:path';

import type { RegistroDeActividad } from 'sesion';

import { carpetaDeSalida } from './workspace';

const ARCHIVO_DEL_REGISTRO = 'actividad.jsonl';
const ARCHIVO_ROTADO = 'actividad.1.jsonl';
const LIMITE_DE_BYTES = 1024 * 1024;
/** Cada cuanto se mira el registro en disco. */
const INTERVALO_DE_SONDEO_MS = 250;

const rutaDelRegistro = (raiz: string): string => join(carpetaDeSalida(raiz), ARCHIVO_DEL_REGISTRO);

/** Anexa `linea` (con su salto) al registro de `raiz`, creando la carpeta de salida y rotando si hace falta. */
export function anexarAlRegistro(raiz: string, linea: string): void {
  const carpeta = carpetaDeSalida(raiz);
  mkdirSync(carpeta, { recursive: true });
  const ruta = rutaDelRegistro(raiz);
  let tamano = 0;
  try {
    tamano = statSync(ruta).size;
  } catch {
    // aun no existe
  }
  if (tamano > LIMITE_DE_BYTES) renameSync(ruta, join(carpeta, ARCHIVO_ROTADO));
  appendFileSync(ruta, linea);
}

/** El registro de `raiz` como lo espera el Workspace vivo, con un observador propio (el del Workspace ignora carpetas ocultas). */
export function registroEnDisco(raiz: string): RegistroDeActividad {
  const ruta = rutaDelRegistro(raiz);
  return {
    leer() {
      try {
        return readFileSync(ruta, 'utf8');
      } catch {
        return undefined;
      }
    },
    observar(alCambiar) {
      const oyente = (): void => alCambiar();
      watchFile(ruta, { interval: INTERVALO_DE_SONDEO_MS, persistent: false }, oyente);
      return () => unwatchFile(ruta, oyente);
    },
  };
}
