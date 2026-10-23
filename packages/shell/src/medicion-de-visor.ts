/**
 * Adaptador de medicion del visor (ADR 0008): mide con la fuente real. Antes de
 * medir cada texto espera `document.fonts.load(<fuente>, <texto>)` (`ready` y
 * `check` no bastan) y mide con el lienzo del navegador. Devuelve datos
 * (`MedidasDeTexto`) que el layout recibe como entrada, de modo que el Worker no
 * toca el DOM. Las fuentes son archivos del Workspace auto-hospedados (el
 * consumidor las declara con `@font-face`/`FontFace` desde el Workspace; aqui no
 * hay CDN); `hashes` lleva el hash (`hashDeFuente`) del archivo de cada familia.
 * Las dos costuras del navegador (`cargar`, `ancho`) son inyectables.
 */
import { claveDeTexto } from 'tema';
import type { MedidasDeTexto, TextoAMedir } from 'tema';

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
  if (contexto === null) throw new Error('El navegador no ofrece un lienzo 2D para medir texto');
  return (fuente, texto) => {
    contexto.font = fuente;
    return contexto.measureText(texto).width;
  };
}

/** Mide `textos` con las fuentes ya cargadas. */
export async function medirEnVisor(textos: readonly TextoAMedir[], opciones: OpcionesDeMedicion = {}): Promise<MedidasDeTexto> {
  const cargar = opciones.cargar ?? ((fuente, texto) => document.fonts.load(fuente, texto));
  const ancho = opciones.ancho ?? anchoConLienzo();
  const anchos: Record<string, number> = {};
  for (const { familia, tamano, texto } of textos) {
    const fuente = `${tamano}px ${familia}`;
    await cargar(fuente, texto);
    anchos[claveDeTexto(familia, tamano, texto)] = ancho(fuente, texto);
  }
  return { nivel: 'medido', fuentes: { ...opciones.hashes }, anchos };
}
