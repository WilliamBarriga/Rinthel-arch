import { CODIGOS, TEMA_NEUTRO } from 'canonico';
import type { FuenteCanonica, Issue, Tema, Vista } from 'canonico';
import { resolveView } from 'canonico';
import type { PosicionDePin } from 'dsl';
import { claveDeLayout, layoutView } from 'layout';
import type { Geometria } from 'layout';

/** Archivos derivados, por ruta relativa a `<workspace>/.diagrams/`. */
export type SalidaDeBuild = Record<string, string>;

export interface OpcionesDeBuild {
  /** Tema global; una Vista con `theme` propio lo anula. */
  tema?: string;
  pins: readonly PosicionDePin[];
}

export interface ResultadoDeBuild {
  archivos: SalidaDeBuild;
  /** Avisos que solo se conocen tras calcular la geometria. */
  issues: Issue[];
}

/** Forma de `geometria/<vista>.json`: la escribe `build` y la lee `export`. */
export interface GeometriaCacheada {
  view: string;
  theme: string;
  layoutKey: string;
  geometry: Geometria;
}

const json = (valor: unknown): string => `${JSON.stringify(valor, null, 2)}\n`;

function temaDeVista(fuente: FuenteCanonica, vista: Vista, global: string | undefined): Tema {
  const nombre = vista.theme ?? global ?? TEMA_NEUTRO.name;
  return fuente.themes.find((tema) => tema.name === nombre) ?? TEMA_NEUTRO;
}

/**
 * Calcula la geometria por defecto de cada Vista y arma los archivos de salida:
 * `canonico.json` y `geometria/<vista>.json`. Los pares de Pins solapados salen
 * como `W_OVERLAPPING_PINS` situados en el primer Pin del par.
 */
export async function construirBuild(
  fuente: FuenteCanonica,
  { tema, pins }: OpcionesDeBuild,
): Promise<ResultadoDeBuild> {
  const archivos: SalidaDeBuild = { 'canonico.json': json(fuente) };
  const issues: Issue[] = [];
  for (const vista of fuente.views) {
    const resuelta = resolveView(fuente, vista.id);
    if (resuelta === undefined) continue;
    const temaDeLaVista = temaDeVista(fuente, vista, tema);
    const geometry = await layoutView(resuelta, temaDeLaVista);
    const cacheada: GeometriaCacheada = {
      view: vista.id,
      theme: temaDeLaVista.name,
      layoutKey: claveDeLayout(resuelta, temaDeLaVista),
      geometry,
    };
    archivos[`geometria/${vista.id}.json`] = json(cacheada);
    for (const [a, b] of geometry.pinsSolapados) {
      const posicionDe = (nodo: string) => pins.find((pin) => pin.view === vista.id && pin.node === nodo);
      const primero = posicionDe(a);
      const segundo = posicionDe(b);
      if (primero === undefined || segundo === undefined) continue;
      issues.push({
        code: CODIGOS.W_OVERLAPPING_PINS,
        severity: 'warning',
        file: primero.file,
        line: primero.line,
        column: primero.column,
        message: `En la Vista '${vista.id}', los Pins de '${a}' y '${b}' se solapan`,
        related: [
          { file: segundo.file, line: segundo.line, column: segundo.column, message: `Pin de '${b}'` },
        ],
      });
    }
  }
  return { archivos, issues };
}
