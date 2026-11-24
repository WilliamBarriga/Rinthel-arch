/**
 * Previsualizacion de Temas de la galeria: el lienzo dibuja la Vista activa con `temaPrevio` sin escribir. El estado
 * vive en los proveedores del estudio (`useEstadoDePrevisualizacion`); la galeria lo cambia (`usePrevisualizacionDeTema`)
 * y el lienzo lo aplica a la Fuente dibujada (`useFuentePrevisualizada`).
 */
import { createContext, useContext, useEffect, useMemo, useState } from 'react';

import type { FuenteCanonica, GeometriaCacheada } from 'canonico';

import type { ClienteDeDev } from '../cliente';
import type { Dibujable } from '../lienzo/geometrias';
import { useLecturaPorVersion } from '../marco/use-lectura-por-version';

export interface PrevisualizacionDeTema {
  /** `undefined` si no hay previsualizacion. */
  temaPrevio: string | undefined;
  /** Previsualiza la Vista activa con otro Tema, o vuelve al suyo con `undefined`. Cambiar de Vista la descarta. */
  previsualizarTema(tema: string | undefined): void;
}

export const ContextoDePrevisualizacion = createContext<PrevisualizacionDeTema | undefined>(undefined);

export function usePrevisualizacionDeTema(): PrevisualizacionDeTema {
  const contexto = useContext(ContextoDePrevisualizacion);
  if (contexto === undefined) throw new Error('usePrevisualizacionDeTema fuera de <Estudio>');
  return contexto;
}

/** El valor del contexto: la previsualizacion se descarta al cambiar la Vista activa. */
export function useEstadoDePrevisualizacion(vista: string | undefined): PrevisualizacionDeTema {
  const [temaPrevio, previsualizarTema] = useState<string>();
  useEffect(() => previsualizarTema(undefined), [vista]);
  return useMemo(() => ({ temaPrevio, previsualizarTema }), [temaPrevio]);
}

interface Dibujada {
  fuente: FuenteCanonica;
  geometrias: Dibujable['geometrias'];
}

/**
 * Con `tema`, la Vista activa se dibuja con ese Tema: su `theme` se sustituye en la Fuente y su Geometria se pide con
 * `?tema=` (mientras no llega, la calcula el Worker). Sin `tema`, todo pasa tal cual.
 */
export function useFuentePrevisualizada(cliente: ClienteDeDev, version: number, { fuente, geometrias }: Dibujada, vista: string, tema: string | undefined): Dibujada {
  const lectura = useLecturaPorVersion<GeometriaCacheada>(
    cliente,
    version,
    tema === undefined
      ? undefined
      : {
          clave: JSON.stringify([vista, tema]),
          pedir: async (c) => {
            const r = await c.geometria(vista, { tema });
            return r.ok ? { ok: true, valor: r.geometria } : { ok: false, message: r.error ?? 'The geometry did not arrive' };
          },
        },
  );
  const previa = lectura.tipo === 'dato' ? lectura.dato : undefined;
  return useMemo(() => {
    if (tema === undefined) return { fuente, geometrias };
    const conTema = { ...fuente, views: fuente.views.map((v) => (v.id === vista ? { ...v, theme: tema } : v)) };
    const { [vista]: _delTemaPropio, ...resto } = geometrias;
    return { fuente: conTema, geometrias: previa === undefined ? resto : { ...resto, [vista]: previa } };
  }, [fuente, geometrias, vista, tema, previa]);
}
