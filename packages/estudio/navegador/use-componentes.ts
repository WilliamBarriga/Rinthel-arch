/**
 * Componentes de Tema de la Vista dibujada: se vuelven a pedir con cada estado por el cliente; si la carga falla se
 * reporta y se conservan los anteriores.
 */
import { useMemo } from 'react';

import type { ComponentesDeTema } from 'render';

import type { ClienteDeDev } from './cliente';
import { crearCargadorDeComponentes } from './componentes';
import { useLecturaPorVersion } from './marco/use-lectura-por-version';

export function useComponentes(cliente: ClienteDeDev, version: number | undefined, confirmar: (mensaje: string) => boolean, reportar: (mensaje: string) => void): ComponentesDeTema | undefined {
  const cargar = useMemo(() => crearCargadorDeComponentes(cliente, confirmar), [cliente, confirmar]);
  const lectura = useLecturaPorVersion(
    cliente,
    version,
    version === undefined
      ? undefined
      : {
          clave: 'componentes',
          conservarAnteFallo: true,
          pedir: async () => {
            const carga = await cargar();
            if (carga.ok) return carga;
            const mensaje = `No se pudieron cargar los Componentes de Tema: ${carga.mensaje}`;
            reportar(mensaje);
            return { ok: false, mensaje };
          },
        },
  );
  return lectura.tipo === 'dato' ? lectura.dato : undefined;
}
