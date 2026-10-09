/**
 * Recarga de Tema al guardar (ADR 0006). El nucleo no lee archivos: el consumidor
 * (cli, dev server) entrega el Tema ya resuelto por un puerto de suscripcion.
 */
import { useEffect, useState } from 'react';

import type { Tema } from 'canonico';

/**
 * Puerto: `alCambiar` se invoca con el Tema ya resuelto cada vez que se guarda el
 * archivo de tema; devuelve la funcion que cancela la suscripcion.
 */
export type SuscripcionDeTema = (alCambiar: (tema: Tema) => void) => () => void;

/**
 * Tema vigente: `inicial` hasta que llegue una actualizacion. Un `inicial` nuevo
 * (el padre cambio de Tema) vuelve a mandar sobre las actualizaciones previas.
 */
export function useTemaVigente(inicial: Tema, actualizaciones: SuscripcionDeTema | undefined): Tema {
  const [recargado, setRecargado] = useState<{ base: Tema; tema: Tema }>();
  useEffect(() => {
    if (actualizaciones === undefined) return undefined;
    return actualizaciones((tema) => setRecargado({ base: inicial, tema }));
  }, [actualizaciones, inicial]);
  return recargado !== undefined && recargado.base === inicial ? recargado.tema : inicial;
}
