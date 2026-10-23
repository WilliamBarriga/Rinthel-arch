/**
 * Clasificador de cambios de `dev` (enmienda de Temas del ADR 0005): compara lo ultimo bueno con lo nuevo y
 * dice que debe rehacer el visor. Puro.
 *
 * - `estructura`: cambia algo que mueve el layout (Modelo, Vistas, Metricas del Tema de una Vista) o una
 *   fuente tipografica. Un cambio que solo toca `theme`/`themePatch` de una Vista con Metricas iguales no cuenta.
 * - `codigo`: cambia un `.tsx` y nada mas fuerte.
 * - `pintura`: lo demas (Capas pintadas, animacion, paleta...); el Estilo resuelto se reaplica sin relayout.
 */
import type { FuenteCanonica, TipoDeCambio } from 'canonico';
import { TEMA_NEUTRO, claveDeMetricas, tablaDeMetricas } from 'tema';

/** Lo que `dev` sabe de un instante: la Fuente buena y el hash de cada recurso (`.tsx`, fuentes). */
export interface InstanteDeDev {
  fuente: FuenteCanonica | undefined;
  recursos: Readonly<Record<string, string>>;
}

const EXTENSION_DE_CODIGO = '.tsx';

const cambiaron = (a: Readonly<Record<string, string>>, b: Readonly<Record<string, string>>, quiere: (ruta: string) => boolean): boolean =>
  [...new Set([...Object.keys(a), ...Object.keys(b)])].some((ruta) => quiere(ruta) && a[ruta] !== b[ruta]);

/** Lo de la Fuente que decide el layout: todo salvo los Temas, y por Vista las Metricas de su Tema. */
function claveDeEstructura(fuente: FuenteCanonica): string {
  const temaDe = (nombre: string | undefined) => fuente.themes.find((t) => t.name === (nombre ?? TEMA_NEUTRO.name)) ?? TEMA_NEUTRO;
  return JSON.stringify({
    specification: fuente.specification,
    model: fuente.model,
    vistas: fuente.views.map(({ theme, themePatch: _parche, ...resto }) => [resto, claveDeMetricas(tablaDeMetricas(temaDe(theme)))]),
  });
}

export function clasificarCambio(antes: InstanteDeDev, despues: InstanteDeDev & { fuente: FuenteCanonica }): TipoDeCambio {
  if (antes.fuente === undefined) return 'estructura';
  if (claveDeEstructura(antes.fuente) !== claveDeEstructura(despues.fuente)) return 'estructura';
  if (cambiaron(antes.recursos, despues.recursos, (ruta) => !ruta.endsWith(EXTENSION_DE_CODIGO))) return 'estructura';
  if (cambiaron(antes.recursos, despues.recursos, (ruta) => ruta.endsWith(EXTENSION_DE_CODIGO))) return 'codigo';
  return 'pintura';
}
