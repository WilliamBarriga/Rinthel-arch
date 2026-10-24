import { CODIGOS, candidatosCercanos, resolveView } from 'canonico';
import type { FuenteCanonica, GeometriaCacheada, Issue, Tema, Ubicador, Vista } from 'canonico';
import { compile } from 'dsl';
import type { ArchivosDelWorkspace, OrigenDeTema, PosicionDePin, ResultadoDeCompilacion } from 'dsl';
import { claveDeLayout, layoutView } from 'layout';
import type { Geometria } from 'layout';
import { TEMA_NEUTRO, advertenciasDeContraste, estiloResuelto, leerOps, resolverFuentes, resolverTema, tiposSoloColor, usosDeCodigo } from 'tema';
import type { EstiloResuelto, UsoDeComponente } from 'tema';

/** Archivos derivados, por ruta relativa a `<workspace>/.diagrams/`. */
export type SalidaDeBuild = Record<string, string>;

/** Interfaz de un Componente de Tema tal como la conoce el adaptador (nombre exportado y, si lo declara, tipo de cada parametro). */
export interface InterfazDeComponente {
  /** Parametros que el componente declara; sin ellos, no se comprueban. */
  parametros?: Readonly<Record<string, 'numero' | 'texto'>>;
}

export interface OpcionesDeSesion {
  /** Tema global; una Vista con `theme` propio lo anula. */
  tema?: string;
  /**
   * Componentes de Tema que el adaptador conoce, por nombre. `sesion` nunca importa codigo: con este
   * registro (CLI, `dev`, pruebas) `validate` comprueba la interfaz de cada Capa `code`; sin el solo avisa
   * de que el Tema tiene codigo.
   */
  componentes?: Readonly<Record<string, InterfazDeComponente>>;
  /**
   * Rutas (relativas al Workspace, con `/`) de los archivos de fuente que el adaptador encontro. Con ellas
   * `diagnosticar` y `construir` exigen un archivo por cada familia de `fonts` (`E_THEME_FONT_MISSING`) y el
   * Estilo resuelto trae las caras; sin ellas (el adaptador no las conoce) no se comprueba.
   */
  archivosDeFuente?: readonly string[];
  /** Issues que el adaptador ya conoce (p. ej. un `.tsx` que no compila): se suman tal cual a los de `diagnosticar` y `construir`. */
  issuesDelAdaptador?: readonly Issue[];
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
  /** Origen de las Capas de cada Tema declarado en el texto (cadena `extends`, `part`, sitio de cada Capa); vacio sin Fuente. */
  readonly origenesDeTema: Readonly<Record<string, OrigenDeTema>>;
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
  actualizar(archivos: ArchivosDelWorkspace, cambios?: Pick<OpcionesDeSesion, 'componentes' | 'issuesDelAdaptador' | 'archivosDeFuente'>): Sesion;
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

/** Color de Paleta de cada Tipo de nodo de la Fuente. */
const coloresDeTipos = (fuente: FuenteCanonica): Record<string, string | undefined> =>
  Object.fromEntries(fuente.specification.nodeTypes.map((tipo) => [tipo.name, typeof tipo['color'] === 'string' ? tipo['color'] : undefined]));

/**
 * Warnings de accesibilidad (ADR 0008), nunca errores: `W_THEME_LOW_CONTRAST` por Tema,
 * Tipo y estado (situado en el nombre del Tema) y `W_THEME_COLOR_ONLY` por Vista cuando
 * dos de sus Tipos solo difieren por color (situado en el id de la Vista).
 */
function avisosDeAccesibilidad(fuente: FuenteCanonica, ubicar: Ubicador | undefined, global: string | undefined): Issue[] {
  /** Posicion del valor en `ruta`; `null` si su archivo no es fiable (no se avisa). */
  const sitio = (ruta: Parameters<Ubicador>[0]): { file: string; line: number; column: number } | null => {
    const donde = ubicar === undefined ? { file: '(canonico)', range: { start: { line: 1, column: 1 } } } : ubicar(ruta);
    return donde === null ? null : { file: donde.file, ...donde.range.start };
  };
  const colores = coloresDeTipos(fuente);
  const issues: Issue[] = [];
  fuente.themes.forEach((tema, i) => {
    const donde = sitio(['themes', i, 'name']);
    if (donde === null) return;
    for (const aviso of advertenciasDeContraste(tema, colores)) {
      issues.push({ code: CODIGOS.W_THEME_LOW_CONTRAST, severity: 'warning', ...donde, message: `Tema '${tema.name}': ${aviso.mensaje}`, hint: `ajusta la Capa '${aviso.capa}' o los colores de la Paleta` });
    }
  });
  fuente.views.forEach((declarada, i) => {
    const resuelta = resolveView(fuente, declarada.id);
    const donde = sitio(['views', i, 'id']);
    if (resuelta === undefined || donde === null) return;
    const usados = new Set(resuelta.nodes.map((n) => n.type));
    const tipos = fuente.specification.nodeTypes.filter((t) => usados.has(t.name)).map((t) => ({ name: t.name, color: colores[t.name], icon: t.icon }));
    for (const [a, b] of tiposSoloColor(temaDeVista(fuente, declarada, global), tipos)) {
      issues.push({
        code: CODIGOS.W_THEME_COLOR_ONLY,
        severity: 'warning',
        ...donde,
        message: `En la Vista '${declarada.id}', los Tipos '${a}' y '${b}' se distinguen solo por color`,
        hint: 'da al Tema una forma, un icono o un borde distinto por Tipo; el visor mostrara la leyenda',
      });
    }
  });
  return issues;
}

/**
 * Avisos de la via de escape en codigo (ADR 0008): `W_THEME_WITH_CODE` por Tema (y por Vista cuyo
 * override anade componentes) y, si el adaptador dio `componentes`, la comprobacion de la interfaz
 * (existe, parametros declarados y de su tipo). Nunca ejecuta ni lee codigo.
 */
function avisosDeCodigo(fuente: FuenteCanonica, ubicar: Ubicador | undefined, componentes: OpcionesDeSesion['componentes']): Issue[] {
  const sitio = (ruta: Parameters<Ubicador>[0]): { file: string; line: number; column: number } | null => {
    const donde = ubicar === undefined ? { file: '(canonico)', range: { start: { line: 1, column: 1 } } } : ubicar(ruta);
    return donde === null ? null : { file: donde.file, ...donde.range.start };
  };
  const issues: Issue[] = [];
  const revisar = (donde: { file: string; line: number; column: number }, que: string, usos: readonly UsoDeComponente[]): void => {
    if (usos.length === 0) return;
    const nombres = [...new Set(usos.map((uso) => uso.nombre))];
    issues.push({
      code: CODIGOS.W_THEME_WITH_CODE,
      severity: 'warning',
      ...donde,
      message: `${que} usa codigo (componentes: ${nombres.join(', ')}); revisalo antes de confiar en el Workspace`,
      hint: 'la Capa `code` corre codigo del Workspace sin sandbox',
    });
    if (componentes === undefined) return;
    for (const uso of usos) {
      const interfaz = componentes[uso.nombre];
      if (interfaz === undefined) {
        const cerca = candidatosCercanos(uso.nombre, Object.keys(componentes));
        issues.push({ code: CODIGOS.E_THEME_COMPONENT_MISSING, severity: 'error', ...donde, message: `${que}: el componente '${uso.nombre}' no existe en el Workspace`, ...(cerca.length > 0 && { hint: `quisiste decir ${cerca.map((c) => `'${c}'`).join(' o ')}` }) });
        continue;
      }
      if (interfaz.parametros === undefined) continue;
      for (const [clave, valor] of Object.entries(uso.parametros)) {
        const esperado = interfaz.parametros[clave];
        const tipo = typeof valor === 'number' ? 'numero' : 'texto';
        const problema = esperado === undefined ? `no declara el parametro '${clave}'` : esperado === tipo ? undefined : `espera '${clave}' como ${esperado}, no ${tipo}`;
        if (problema !== undefined) issues.push({ code: CODIGOS.E_THEME_COMPONENT_PARAMS, severity: 'error', ...donde, message: `${que}: el componente '${uso.nombre}' ${problema}` });
      }
    }
  };
  fuente.themes.forEach((tema, i) => {
    const donde = sitio(['themes', i, 'name']);
    if (donde !== null) revisar(donde, `Tema '${tema.name}'`, usosDeCodigo(tema));
  });
  fuente.views.forEach((declarada, i) => {
    if (declarada.themePatch === undefined) return;
    const donde = sitio(['views', i, 'id']);
    if (donde === null) return;
    const tema = temaDeVista(fuente, declarada, undefined);
    const base = new Set(usosDeCodigo(tema).map((uso) => JSON.stringify(uso)));
    revisar(donde, `La Vista '${declarada.id}'`, usosDeCodigo(tema, leerOps(declarada.themePatch)).filter((uso) => !base.has(JSON.stringify(uso))));
  });
  return issues;
}

/** `E_THEME_FONT_MISSING` por familia de `fonts` sin archivo, situado en el nombre del Tema; con la familia cercana si la hay. */
function avisosDeFuentes(fuente: FuenteCanonica, ubicar: Ubicador | undefined, archivos: readonly string[] | undefined): Issue[] {
  if (archivos === undefined) return [];
  const disponibles = [...new Set(archivos.flatMap((ruta) => /([^/]+?)(?:-[a-z]+(?:-ext)?-\d{3}-(?:normal|italic))?\.(?:woff2|woff|ttf|otf)$/i.exec(ruta)?.[1]?.toLowerCase() ?? []))];
  const issues: Issue[] = [];
  fuente.themes.forEach((tema, i) => {
    const donde = ubicar === undefined ? { file: '(canonico)', range: { start: { line: 1, column: 1 } } } : ubicar(['themes', i, 'name']);
    if (donde === null) return;
    for (const { clave, familia } of resolverFuentes(resolverTema(tema).fonts, archivos).faltantes) {
      const cerca = candidatosCercanos(familia.toLowerCase().replace(/\s+/g, '-'), disponibles);
      issues.push({
        code: CODIGOS.E_THEME_FONT_MISSING,
        severity: 'error',
        file: donde.file,
        ...donde.range.start,
        message: `Tema '${tema.name}': la fuente '${familia}' (fonts.${clave}) no tiene archivo en el Workspace`,
        hint: cerca.length > 0 ? `quisiste decir ${cerca.map((c) => `'${c}'`).join(' o ')}` : `copia ${familia.toLowerCase().replace(/\s+/g, '-')}-latin-400-normal.woff2 al Workspace, o usa una familia generica (sans-serif, monospace...)`,
      });
    }
  });
  return issues;
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
  const externos = opciones.issuesDelAdaptador ?? [];

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
    origenesDeTema: compilado.origenesDeTemas ?? {},
    async diagnosticar() {
      if (fuente === undefined) return [...compilado.issues, ...externos];
      const accesibilidad = [...avisosDeAccesibilidad(fuente, compilado.ubicar, opciones.tema), ...avisosDeCodigo(fuente, compilado.ubicar, opciones.componentes), ...avisosDeFuentes(fuente, compilado.ubicar, opciones.archivosDeFuente)];
      const conPins = fuente.views.filter(({ id }) => pins.filter((pin) => pin.view === id).length >= 2);
      return [...compilado.issues, ...externos, ...accesibilidad, ...(await avisos(conPins.map(({ id }) => id)))];
    },
    async construir() {
      if (fuente === undefined) return { archivos: {}, issues: [...compilado.issues, ...externos] };
      const salida: SalidaDeBuild = { 'canonico.json': json(fuente) };
      for (const { id } of fuente.views) {
        const cacheada = await geometria(id);
        if (cacheada !== undefined) salida[`geometria/${id}.json`] = json(cacheada);
      }
      const issues = [...compilado.issues, ...externos, ...avisosDeAccesibilidad(fuente, compilado.ubicar, opciones.tema), ...avisosDeCodigo(fuente, compilado.ubicar, opciones.componentes), ...avisosDeFuentes(fuente, compilado.ubicar, opciones.archivosDeFuente), ...(await avisos(fuente.views.map(({ id }) => id)))];
      return { archivos: salida, issues };
    },
    geometria,
    estilo: (vista) => {
      const datos = claveDe(vista);
      if (datos === undefined || fuente === undefined) return undefined;
      const declarada = fuente.views.find(({ id }) => id === vista);
      const tipos = Object.fromEntries(fuente.specification.nodeTypes.map((tipo) => [tipo.name, typeof tipo['color'] === 'string' ? tipo['color'] : undefined]));
      return estiloResuelto(datos.tema, { tipos, ...(opciones.archivosDeFuente !== undefined && { archivosDeFuente: opciones.archivosDeFuente }), ...(declarada?.themePatch !== undefined && { vista: leerOps(declarada.themePatch) }) });
    },
    vistasConGeometria: () => [...memo.keys()],
    actualizar: (nuevos, cambios = {}) => crear(nuevos, { ...opciones, ...cambios }, compile(nuevos), memo),
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
