/**
 * Lo que `export` necesita de la salida de `build`: leerla del disco (ya como
 * texto) con su esquema y emparejar cada Vista con su geometria cacheada, su
 * Tema y su Vista resuelta. Es el unico sitio que decide cuando una Vista se
 * puede dibujar; SVG, PNG y HTML lo comparten.
 */
import { fuenteCanonicaSchema, geometriaCacheadaSchema, resolveView } from 'canonico';
import type { FuenteCanonica, GeometriaCacheada, Tema, VistaResuelta } from 'canonico';
import { claveDeLayout } from 'layout';
import type { Geometria } from 'layout';

/** Lo que recibe cada formato de `export`: salida de `build` mas el Workspace actual. */
export interface EntradaDeExport {
  fuente: FuenteCanonica;
  /** Geometria cacheada por id de Vista. */
  geometrias: Readonly<Record<string, GeometriaCacheada>>;
  /** Archivos del Workspace (`.dg` y `.svg`): de ahi salen los iconos. */
  workspace: Readonly<Record<string, string>>;
  /** Archivos de fuente del Workspace, ruta relativa -> base64. */
  fuentes: Readonly<Record<string, string>>;
}

/** Una Vista lista para dibujar: su Tema, su Vista resuelta y la geometria vigente. */
export interface VistaDibujable {
  id: string;
  theme: Tema;
  view: VistaResuelta;
  geometry: Geometria;
}

/**
 * `canonico.json` y `geometria/*.json` de la salida de `build` (ruta relativa a
 * `.diagrams/` -> texto), validados con su esquema. Lanza si falta o no cumple.
 */
export function leerSalidaDeBuild(cache: Readonly<Record<string, string>>): Pick<EntradaDeExport, 'fuente' | 'geometrias'> {
  const fuente = fuenteCanonicaSchema.parse(JSON.parse(cache['canonico.json'] ?? 'null'));
  const geometrias = Object.fromEntries(
    Object.entries(cache)
      .filter(([ruta]) => ruta.startsWith('geometria/'))
      .map(([, texto]) => {
        const cacheada = geometriaCacheadaSchema.parse(JSON.parse(texto));
        return [cacheada.view, cacheada] as const;
      }),
  );
  return { fuente, geometrias };
}

/**
 * Cada Vista de la Fuente con su geometria. Lanza si a una Vista le falta la
 * geometria o su Tema, o si la geometria se calculo con otra estructura, textos
 * o fuentes de Tema (`layoutKey`): la salida de `build` esta obsoleta o alterada
 * y mezclarla con el Workspace actual daria un dibujo incoherente.
 */
export function vistasDibujables({ fuente, geometrias }: EntradaDeExport): VistaDibujable[] {
  return fuente.views.map(({ id }) => {
    const cacheada = geometrias[id];
    const view = resolveView(fuente, id);
    if (cacheada === undefined || view === undefined) throw new Error(`Falta la geometria de la Vista '${id}'`);
    const theme = fuente.themes.find(({ name }) => name === cacheada.theme);
    if (theme === undefined) throw new Error(`El Tema '${cacheada.theme}' no esta en la Fuente canonica`);
    if (cacheada.layoutKey !== claveDeLayout(view, theme)) {
      throw new Error(
        `La geometria cacheada de la Vista '${id}' no coincide con la Fuente canonica de .diagrams/ ` +
          `(salida de build obsoleta o alterada): ejecuta 'build' antes de 'export'`,
      );
    }
    return { id, theme, view, geometry: cacheada.geometry };
  });
}
