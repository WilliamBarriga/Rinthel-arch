/** Componentes de Tema de la Vista dibujada: se vuelven a pedir con cada estado; si la carga falla se conservan los anteriores. */
import { useMemo } from 'react';

import type { ComponentesDeTema } from 'render';

import type { ClienteDeDev } from './cliente';
import { crearCargadorDeCodigo } from './componentes';
import { useLecturaPorVersion } from './marco/use-lectura-por-version';

export function useComponentes(cliente: ClienteDeDev, version: number | undefined, fetchFn: typeof fetch, confirmar: (mensaje: string) => boolean): ComponentesDeTema | undefined {
  const cargar = useMemo(() => crearCargadorDeCodigo({ fetch: fetchFn, confirmar }), [fetchFn, confirmar]);
  const lectura = useLecturaPorVersion(
    cliente,
    version,
    version === undefined ? undefined : { clave: 'componentes', conservarAnteFallo: true, pedir: async () => ({ ok: true, dato: await cargar() }) },
  );
  return lectura.tipo === 'dato' ? lectura.dato : undefined;
}
