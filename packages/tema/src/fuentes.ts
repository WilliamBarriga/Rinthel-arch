/**
 * Fuentes del Tema (ADR 0008, seccion Fuentes): un Tema nombra familias en `fonts` y los archivos
 * viven en el Workspace (`woff2|woff|ttf|otf`), auto-hospedados. Este modulo es la unica regla que
 * asocia familia y archivo, y que arma la pila `font-family` con la reserva declarada. Puro.
 *
 * Convencion de nombres (la de Fontsource): `<familia-en-kebab>-<subset>-<peso>-<estilo>.<ext>`, p. ej.
 * `caveat-latin-700-normal.woff2`; tambien vale `<Familia>.<ext>` (peso 400, normal).
 */

export interface CaraDeFuente {
  familia: string;
  peso: number;
  estilo: 'normal' | 'italic';
  /** Ruta del archivo en el Workspace, tal como la dio el adaptador. */
  ruta: string;
}

/** Una familia declarada en `fonts` sin archivo en el Workspace; `clave` es la entrada (`body`, `mono`...). */
export interface FuenteFaltante {
  clave: string;
  familia: string;
}

const GENERICAS = new Set(['serif', 'sans-serif', 'monospace', 'cursive', 'fantasy', 'system-ui', 'ui-serif', 'ui-sans-serif', 'ui-monospace', 'ui-rounded', 'emoji', 'math', 'fangsong']);
const EXTENSION = /\.(woff2|woff|ttf|otf)$/i;
/** Entrada de `fonts` que no es una familia: la pila de reserva que se agrega al final. */
const RESERVA = 'fallback';

/** Familias de un valor de `fonts` (`"Inter, sans-serif"` es una lista), sin comillas. */
const familiasDe = (valor: string): string[] =>
  valor
    .split(',')
    .map((f) => f.trim().replace(/["'\\]/g, ''))
    .filter((f) => f !== '');

const kebab = (familia: string): string => familia.toLowerCase().replace(/\s+/g, '-');
const esGenerica = (familia: string): boolean => GENERICAS.has(familia.toLowerCase());
const escaparRegex = (texto: string): string => texto.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

function caraDe(familia: string, ruta: string): CaraDeFuente | undefined {
  const archivo = ruta.slice(ruta.lastIndexOf('/') + 1);
  if (!EXTENSION.test(archivo)) return undefined;
  const nombre = archivo.replace(EXTENSION, '').toLowerCase();
  if (nombre === familia.toLowerCase() || nombre === kebab(familia)) return { familia, peso: 400, estilo: 'normal', ruta };
  const partes = new RegExp(`^${escaparRegex(kebab(familia))}-[a-z]+(?:-ext)?-(\\d{3})-(normal|italic)$`).exec(nombre);
  return partes === null ? undefined : { familia, peso: Number(partes[1]), estilo: partes[2] as 'normal' | 'italic', ruta };
}

/**
 * Caras de fuente que `archivos` (rutas de archivos del Workspace) aportan a las familias de `fonts`,
 * ordenadas por familia, peso y estilo, y las familias declaradas sin ningun archivo. Las genericas CSS no piden archivo.
 */
export function resolverFuentes(fonts: Readonly<Record<string, string>>, archivos: readonly string[]): { caras: CaraDeFuente[]; faltantes: FuenteFaltante[] } {
  const caras = new Map<string, CaraDeFuente>();
  const faltantes: FuenteFaltante[] = [];
  const vistas = new Set<string>();
  for (const [clave, valor] of Object.entries(fonts)) {
    if (clave === RESERVA) continue;
    for (const familia of familiasDe(valor)) {
      if (esGenerica(familia) || vistas.has(familia)) continue;
      vistas.add(familia);
      const propias = archivos.flatMap((ruta) => caraDe(familia, ruta) ?? []);
      if (propias.length === 0) faltantes.push({ clave, familia });
      for (const cara of propias) caras.set(`${cara.familia}|${cara.peso}|${cara.estilo}`, cara);
    }
  }
  const ordenadas = [...caras.values()].sort((a, b) => a.familia.localeCompare(b.familia) || a.peso - b.peso || a.estilo.localeCompare(b.estilo) || a.ruta.localeCompare(b.ruta));
  return { caras: ordenadas, faltantes };
}

/** Entradas de `fonts` con una familia no generica y sin reserva: ni `fallback` en el Tema ni una generica en su propia lista. */
export function fuentesSinReserva(fonts: Readonly<Record<string, string>>): string[] {
  if (RESERVA in fonts) return [];
  return Object.entries(fonts).flatMap(([clave, valor]) => {
    const familias = familiasDe(valor);
    return familias.some((f) => !esGenerica(f)) && !familias.some(esGenerica) ? [clave] : [];
  });
}

/** Valor CSS de `font-family`: familias con nombre entre comillas, genericas tal cual y la reserva declarada al final (si hace falta). */
export function pilaDeFuente(valor: string, reserva?: string): string {
  const familias = familiasDe(valor);
  const pila = reserva === undefined || familias.every(esGenerica) ? familias : [...familias, ...familiasDe(reserva).filter((f) => !familias.includes(f))];
  return pila.map((f) => (esGenerica(f) ? f : `"${f}"`)).join(', ');
}
