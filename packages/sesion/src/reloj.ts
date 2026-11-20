/** Reloj inyectado del Workspace vivo y del Registro de actividad vivo (el nucleo no tiene reloj propio). `programar` devuelve como cancelar. */
export interface Reloj {
  programar(fn: () => void, ms: number): () => void;
}
