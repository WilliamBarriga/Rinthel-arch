/** Estado de `dev` por SSE: se queda con el de mayor `version` y se lo pasa a las Geometrias antes de dibujarlo. */
import { useCallback, useEffect, useRef, useState } from 'react';

import type { EstadoDeDev } from '../../src/protocolo';
import type { ClienteDeDev } from '../cliente';
import type { GeometriasDeDev } from '../lienzo/geometrias';

/**
 * `vigente` da el ultimo estado recibido (el que usa la Escritura), aunque el render aun no lo haya visto. Un evento
 * `estado` malformado no lo reemplaza: va a `reportar`.
 */
export function useEstadoDeDev(cliente: ClienteDeDev, geometrias: GeometriasDeDev, reportar: (mensaje: string) => void): { estado: EstadoDeDev | undefined; vigente: () => EstadoDeDev | undefined; recibir: (estado: EstadoDeDev) => void } {
  const [estado, setEstado] = useState<EstadoDeDev>();
  const ultimo = useRef<EstadoDeDev | undefined>(undefined);
  const recibir = useCallback(
    (nuevo: EstadoDeDev): void => {
      if (ultimo.current !== undefined && nuevo.version < ultimo.current.version) return;
      ultimo.current = nuevo;
      geometrias.recibir(nuevo);
      setEstado(nuevo);
    },
    [geometrias],
  );
  useEffect(() => cliente.suscribir(recibir, (mensaje) => reportar(`${mensaje}; se conserva el estado vigente`)), [cliente, recibir, reportar]);
  const vigente = useCallback(() => ultimo.current, []);
  return { estado, vigente, recibir };
}
