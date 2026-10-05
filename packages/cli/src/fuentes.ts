import type { Tema } from 'canonico';
import type { FuenteIncrustada } from 'render';

/** Formatos de fuente que el Workspace puede traer, de mayor a menor preferencia. */
const FORMATOS: readonly [extension: string, mime: string][] = [
  ['woff2', 'font/woff2'],
  ['woff', 'font/woff'],
  ['ttf', 'font/ttf'],
  ['otf', 'font/otf'],
];

/** Ruta (la primera en orden) del archivo `<familia>.<extension>` en cualquier carpeta. */
export function archivoDeFuente(
  rutas: readonly string[],
  familia: string,
  extension: string,
): string | undefined {
  return rutas.find((candidata) => candidata.split('/').pop() === `${familia}.${extension}`);
}

/** Familias de un valor CSS `font-family` (`"Inter, sans-serif"` -> `Inter`, `sans-serif`). */
export function familiasDe(valor: string): string[] {
  return valor.split(',').map((familia) => familia.trim().replace(/^["']|["']$/g, '')).filter((familia) => familia !== '');
}

/**
 * Fuentes del Tema que el Workspace aporta como archivo: `<Familia>.woff2` (o
 * `woff`, `ttf`, `otf`) en cualquier carpeta, con el contenido en base64. Una
 * familia sin archivo (`sans-serif`, una fuente del sistema) no se incrusta.
 */
export function fuentesDelTema(tema: Tema, archivos: Readonly<Record<string, string>>): FuenteIncrustada[] {
  const rutas = Object.keys(archivos).sort();
  const familias = [...new Set(Object.values(tema.fonts).flatMap(familiasDe))];
  return familias.flatMap((family) => {
    for (const [extension, mime] of FORMATOS) {
      const ruta = archivoDeFuente(rutas, family, extension);
      if (ruta !== undefined) return [{ family, mime, data: archivos[ruta] as string }];
    }
    return [];
  });
}
