import { CODIGOS, resolveView } from 'canonico';
import type { FuenteCanonica, GeometriaCacheada, Issue, Tema, Ubicador, Vista } from 'canonico';
import { compile } from 'dsl';
import type { ArchivosDelWorkspace, PosicionDePin, ResultadoDeCompilacion } from 'dsl';
import { claveDeLayout, layoutView } from 'layout';
import type { Geometria } from 'layout';
import { TEMA_NEUTRO, estiloResuelto, leerOps } from 'tema';
import type { EstiloResuelto } from 'tema';

/** Archivos derivados, por ruta relativa a `<workspace>/.diagrams/`. */
export type SalidaDeBuild = Record<string, string>;

export interface OpcionesDeSesion {
  /** Tema global; una Vista con `theme` propio lo anula. */
  tema?: string;
}

export interface ResultadoDeConstruir {
  /** `canonico.json` y `geometria/<vista>.json`; vacio si el Workspace tiene errores. */
  archivos: SalidaDeBuild;
  /** Todos los issues: los de compilacion y los que solo se conocen tras el layout. */
  issues: Issue[];
}

/** Estado compilado de un Workspace en un momento dado; valor inmutable. */
export interface Sesion {
  /** Fuente canonica; ausente si la compilacion tiene errores. */
  readonly fuente: FuenteCanonica | undefined;
  /** Ubicador de la Fuente (archivo y rango de cada valor); ausente junto a `fuente`. */
  readonly ubicar: Ubicador | undefined;
  /** Issues de compilacion mas `W_OVERLAPPING_PINS` (layout solo en Vistas con 2 o mas Pins). */
  diagnosticar(): Promise<Issue[]>;
  /** Archivos de `build` (geometria de todas las Vistas) y los issues. */
  construir(): Promise<ResultadoDeConstruir>;
  /** Geometria cacheable de una Vista, perezosa y memoizada; `undefined` si la Vista no existe. */
  geometria(vista: string): Promise<GeometriaCacheada | undefined>;
  /** Estilo resuelto (Metricas y pintura) del Tema de una Vista; `undefined` si la Vista no existe. Sincrono: no necesita layout. */
  estilo(vista: string): EstiloResuelto | undefined;
  /** Ids de las Vistas cuya geometria ya se pidio (calculada o en curso). */
  vistasConGeometria(): string[];
  /** Otra Sesion para estos archivos; la actual no cambia y su geometria se reutiliza por `layoutKey`. */
  actualizar(archivos: ArchivosDelWorkspace): Sesion;
}

/** Archivo en que se declara una Vista; `undefined` si no existe o la Sesion no tiene Fuente. */
export function archivoDeVista(sesion: Pick<Sesion, 'fuente' | 'ubicar'>, vista: string): string | undefined {
  const indice = sesion.fuente?.views.findIndex(({ id }) => id === vista) ?? -1;
  return indice < 0 ? undefined : sesion.ubicar?.(['views', indice, 'id'])?.file;
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

interface EntradaDeGeometria {
  /** `layoutKey` mas los Pins de la Vista: lo unico de que depende la geometria. */
  clave: string;
  resultado: Promise<GeometriaCacheada>;
}

type Memo = ReadonlyMap<string, EntradaDeGeometria>;

function crear(
  archivos: ArchivosDelWorkspace,
  opciones: OpcionesDeSesion,
  compilado: ResultadoDeCompilacion,
  previa: Memo,
): Sesion {
  const { canonico: fuente, pins } = compilado;
  const memo = new Map<string, EntradaDeGeometria>();

  const claveDe = (vista: string): { clave: string; tema: Tema; resuelta: NonNullable<ReturnType<typeof resolveView>> } | undefined => {
    if (fuente === undefined) return undefined;
    const declarada = fuente.views.find(({ id }) => id === vista);
    const resuelta = resolveView(fuente, vista);
    if (declarada === undefined || resuelta === undefined) return undefined;
    const tema = temaDeVista(fuente, declarada, opciones.tema);
    return { clave: JSON.stringify([tema.name, claveDeLayout(resuelta, tema)]), tema, resuelta };
  };

  const geometria = (vista: string): Promise<GeometriaCacheada | undefined> => {
    const datos = claveDe(vista);
    if (datos === undefined) return Promise.resolve(undefined);
    const existente = memo.get(vista);
    if (existente !== undefined) return existente.resultado;
    const heredada = previa.get(vista);
    const resultado =
      heredada !== undefined && heredada.clave === datos.clave
        ? heredada.resultado
        : layoutView(datos.resuelta, datos.tema).then((geometry) => ({
            view: vista,
            theme: datos.tema.name,
            layoutKey: claveDeLayout(datos.resuelta, datos.tema),
            geometry,
          }));
    memo.set(vista, { clave: datos.clave, resultado });
    return resultado;
  };

  const avisos = async (vistas: readonly string[]): Promise<Issue[]> => {
    const issues: Issue[] = [];
    for (const vista of vistas) {
      const cacheada = await geometria(vista);
      if (cacheada !== undefined) issues.push(...avisosDePins(vista, cacheada.geometry, pins));
    }
    return issues;
  };

  const sesion: Sesion = {
    fuente,
    ubicar: compilado.ubicar,
    async diagnosticar() {
      if (fuente === undefined) return [...compilado.issues];
      const conPins = fuente.views.filter(({ id }) => pins.filter((pin) => pin.view === id).length >= 2);
      return [...compilado.issues, ...(await avisos(conPins.map(({ id }) => id)))];
    },
    async construir() {
      if (fuente === undefined) return { archivos: {}, issues: [...compilado.issues] };
      const salida: SalidaDeBuild = { 'canonico.json': json(fuente) };
      for (const { id } of fuente.views) {
        const cacheada = await geometria(id);
        if (cacheada !== undefined) salida[`geometria/${id}.json`] = json(cacheada);
      }
      const issues = [...compilado.issues, ...(await avisos(fuente.views.map(({ id }) => id)))];
      return { archivos: salida, issues };
    },
    geometria,
    estilo: (vista) => {
      const datos = claveDe(vista);
      if (datos === undefined || fuente === undefined) return undefined;
      const declarada = fuente.views.find(({ id }) => id === vista);
      const tipos = Object.fromEntries(fuente.specification.nodeTypes.map((tipo) => [tipo.name, typeof tipo['color'] === 'string' ? tipo['color'] : undefined]));
      return estiloResuelto(datos.tema, { tipos, ...(declarada?.themePatch !== undefined && { vista: leerOps(declarada.themePatch) }) });
    },
    vistasConGeometria: () => [...memo.keys()],
    actualizar: (nuevos) => crear(nuevos, opciones, compile(nuevos), memo),
  };
  return sesion;
}

/**
 * Abre una Sesion sobre el mapa de archivos del Workspace: compila una vez y deja
 * el layout bajo demanda. Pura; no lee disco ni observa cambios.
 */
export function abrirSesion(archivos: ArchivosDelWorkspace, opciones: OpcionesDeSesion = {}): Sesion {
  return crear(archivos, opciones, compile(archivos), new Map());
}
