import { CODIGOS, TEMA_NEUTRO } from 'canonico';
import type { FuenteCanonica, GeometriaCacheada, Issue, Tema, Vista } from 'canonico';
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

const json = (valor: unknown): string => `${JSON.stringify(valor, null, 2)}\n`;

function temaDeVista(fuente: FuenteCanonica, vista: Vista, global: string | undefined): Tema {
  const nombre = vista.theme ?? global ?? TEMA_NEUTRO.name;
  return fuente.themes.find((tema) => tema.name === nombre) ?? TEMA_NEUTRO;
}

/**
 * `W_OVERLAPPING_PINS` de una Vista: un aviso por par de Pins solapados, situado
 * en el primer Pin del par y con el segundo en `related`. Un par sin posicion de
 * texto conocida (Pin que no viene del DSL) no se avisa.
 */
function avisosDePins(vista: string, geometry: Geometria, pins: readonly PosicionDePin[]): Issue[] {
  const posicionDe = (nodo: string) => pins.find((pin) => pin.view === vista && pin.node === nodo);
  return geometry.pinsSolapados.flatMap(([a, b]) => {
    const [primero, segundo] = [posicionDe(a), posicionDe(b)];
    if (primero === undefined || segundo === undefined) return [];
    return [
      {
        code: CODIGOS.W_OVERLAPPING_PINS,
        severity: 'warning' as const,
        file: primero.file,
        line: primero.line,
        column: primero.column,
        message: `En la Vista '${vista}', los Pins de '${a}' y '${b}' se solapan`,
        related: [{ file: segundo.file, line: segundo.line, column: segundo.column, message: `Pin de '${b}'` }],
      },
    ];
  });
}

/**
 * `W_OVERLAPPING_PINS` para `validate`: el solape solo se conoce tras el layout,
 * asi que se calcula la geometria de las Vistas con al menos dos Pins (las demas
 * no pueden solaparse). No escribe nada.
 */
export async function avisosDePinsSolapados(
  fuente: FuenteCanonica,
  { tema, pins }: OpcionesDeBuild,
): Promise<Issue[]> {
  const issues: Issue[] = [];
  for (const vista of fuente.views) {
    if (pins.filter((pin) => pin.view === vista.id).length < 2) continue;
    const resuelta = resolveView(fuente, vista.id);
    if (resuelta === undefined) continue;
    const geometry = await layoutView(resuelta, temaDeVista(fuente, vista, tema));
    issues.push(...avisosDePins(vista.id, geometry, pins));
  }
  return issues;
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
    issues.push(...avisosDePins(vista.id, geometry, pins));
  }
  return { archivos, issues };
}
