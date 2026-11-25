/**
 * Medicion de texto en el visor con la fuente real: antes de medir cada texto espera `document.fonts.load(fuente, texto)`
 * (`ready` y `check` no bastan). El `@font-face` ya debe estar en la pagina (lo declara `VistaInteractiva` desde `fontFiles`).
 */
import { CODIGOS } from 'canonico';
import { claveDeTexto, pilaDeFuente, resolverFuentes } from 'tema';
import type { MedidasDeTexto, TextoAMedir } from 'tema';

import type { IssueDelVisor } from './avisos';

/**
 * Hash de la fuente de cada familia que el Tema declara en `fonts` (la entrada `hashes` de `medirEnVisor`):
 * los de sus archivos, en orden, a partir del hash de cada archivo del Workspace (`archivos`: ruta -> hash).
 * Una familia sin archivo no aparece.
 */
export function hashesDeFamilias(fonts: Readonly<Record<string, string>>, archivos: Readonly<Record<string, string>>): Record<string, string> {
  const porFamilia = new Map<string, string[]>();
  for (const cara of resolverFuentes(fonts, Object.keys(archivos)).caras) porFamilia.set(cara.familia, [...(porFamilia.get(cara.familia) ?? []), archivos[cara.ruta]!]);
  return Object.fromEntries([...porFamilia].map(([familia, hashes]) => [familia, hashes.join('+')]));
}

/**
 * Aviso (`theme-font-not-served`) de las familias no genericas que el Tema declara y el visor no puede pedir
 * por falta de `fontUrl`; vacio si todas son genericas. Es un issue de visor: su `file` es el Tema, sin enlace al editor.
 */
export function avisoDeFuentesSinServir(fonts: Readonly<Record<string, string>>): IssueDelVisor[] {
  const familias = resolverFuentes(fonts, []).faltantes.map((f) => f.familia);
  if (familias.length === 0) return [];
  return [
    {
      code: CODIGOS.W_THEME_FONT_NOT_SERVED,
      severity: 'warning',
      file: '(visor)',
      line: 1,
      column: 1,
      message: `The viewer received no fontUrl: ${familias.join(', ')} is measured and painted with the fallback; provide fontUrl and fontFiles to use the declared font`,
      href: '#',
    },
  ];
}

export interface OpcionesDeMedicion {
  /** Hash del archivo de fuente de cada familia que el Tema declara. */
  hashes?: Record<string, string>;
  /** Espera a que la fuente CSS (`"14px Inter"`) este lista para `texto`. Por defecto `document.fonts.load`. */
  cargar?: (fuente: string, texto: string) => Promise<unknown>;
  /** Ancho en px de `texto` con la fuente CSS. Por defecto `CanvasRenderingContext2D.measureText`. */
  ancho?: (fuente: string, texto: string) => number;
}

function anchoConLienzo(): (fuente: string, texto: string) => number {
  const contexto = document.createElement('canvas').getContext('2d');
  if (contexto === null) throw new Error('The browser offers no 2D canvas to measure text');
  return (fuente, texto) => {
    contexto.font = fuente;
    return contexto.measureText(texto).width;
  };
}

/** Mide `textos` con el lienzo del navegador, tras cargar la fuente de cada uno. */
export async function medirEnVisor(textos: readonly TextoAMedir[], opciones: OpcionesDeMedicion = {}): Promise<MedidasDeTexto> {
  const cargar = opciones.cargar ?? ((fuente, texto) => document.fonts.load(fuente, texto));
  const ancho = opciones.ancho ?? anchoConLienzo();
  const anchos: Record<string, number> = {};
  for (const { familia, tamano, texto, peso } of textos) {
    const fuente = `${peso === undefined ? '' : `${peso} `}${tamano}px ${pilaDeFuente(familia)}`;
    await cargar(fuente, texto);
    anchos[claveDeTexto(familia, tamano, texto, peso)] = ancho(fuente, texto);
  }
  return { nivel: 'medido', fuentes: { ...opciones.hashes }, anchos };
}
