/**
 * Que debe rehacer el visor de `dev` entre lo ultimo bueno y lo nuevo. Puro.
 * - `estructura`: cambia el layout (Modelo, Vistas, Metricas del Tema de cada Vista) o una fuente tipografica;
 *   tocar solo `theme`/`themePatch` de una Vista con Metricas iguales no cuenta.
 * - `codigo`: cambia un `.tsx` y nada mas fuerte.
 * - `pintura`: lo demas; el Estilo se reaplica sin relayout.
 */
import type { FuenteCanonica, TipoDeCambio } from 'canonico';
import { TEMA_NEUTRO, claveDeMetricas, tablaDeMetricas } from 'tema';

/** `recursos`: hash de cada `.tsx` y fuente. */
export interface InstanteDeDev {
  fuente: FuenteCanonica | undefined;
  recursos: Readonly<Record<string, string>>;
}

const EXTENSION_DE_CODIGO = '.tsx';

const cambiaron = (a: Readonly<Record<string, string>>, b: Readonly<Record<string, string>>, quiere: (ruta: string) => boolean): boolean =>
  [...new Set([...Object.keys(a), ...Object.keys(b)])].some((ruta) => quiere(ruta) && a[ruta] !== b[ruta]);

/** Todo salvo los Temas, y por Vista las Metricas de su Tema. */
function claveDeEstructura(fuente: FuenteCanonica): string {
  const temaDe = (nombre: string | undefined) => fuente.themes.find((t) => t.name === (nombre ?? TEMA_NEUTRO.name)) ?? TEMA_NEUTRO;
  return JSON.stringify({
    specification: fuente.specification,
    model: fuente.model,
    vistas: fuente.views.map(({ theme, themePatch: _parche, ...resto }) => [resto, claveDeMetricas(tablaDeMetricas(temaDe(theme), resto.type))]),
  });
}

export function clasificarCambio(antes: InstanteDeDev, despues: InstanteDeDev & { fuente: FuenteCanonica }): TipoDeCambio {
  if (antes.fuente === undefined) return 'estructura';
  if (claveDeEstructura(antes.fuente) !== claveDeEstructura(despues.fuente)) return 'estructura';
  if (cambiaron(antes.recursos, despues.recursos, (ruta) => !ruta.endsWith(EXTENSION_DE_CODIGO))) return 'estructura';
  if (cambiaron(antes.recursos, despues.recursos, (ruta) => ruta.endsWith(EXTENSION_DE_CODIGO))) return 'codigo';
  return 'pintura';
}
