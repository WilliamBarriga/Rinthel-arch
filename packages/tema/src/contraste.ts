/**
 * Accesibilidad del Tema (ADR 0008): contraste por Tipo y estado, `solo-color`
 * y leyenda derivada. Solo calcula; que sea warning y no bloquee el render lo
 * decide quien emite el issue. Puro y determinista.
 */
import type { Tema } from 'canonico';

import { CATALOGO } from './catalogo';
import type { DefinicionDePropiedad, NombreDePrimitiva } from './catalogo';
import { hexARgb } from './color';
import { estiloResuelto } from './estilo';
import { muestra } from './metricas';
import { resolverTema } from './tema';
import type { CapaPintada } from './estilo';
import type { Estado } from './parches';

type Rgb = readonly [number, number, number];

/** Minimos WCAG: texto normal y partes graficas. */
export const MINIMO_TEXTO = 4.5;
export const MINIMO_GRAFICO = 3;

function leerColor(texto: string): { rgb: Rgb; alfa: number } | undefined {
  const hex = hexARgb(texto);
  if (hex !== undefined) return { rgb: hex, alfa: 1 };
  const m = /^rgba\(\s*(\d+),\s*(\d+),\s*(\d+),\s*([\d.]+)\s*\)$/.exec(texto);
  return m === null ? undefined : { rgb: [Number(m[1]), Number(m[2]), Number(m[3])], alfa: Number(m[4]) };
}

/** Color opaco: el translucido se compone sobre `fondo`. */
function opaco(texto: string, fondo: Rgb): Rgb | undefined {
  const color = leerColor(texto);
  if (color === undefined) return undefined;
  return color.rgb.map((c, i) => c * color.alfa + (fondo[i] as number) * (1 - color.alfa)) as unknown as Rgb;
}

const luminancia = (rgb: Rgb): number => {
  const [r, g, b] = rgb.map((c) => {
    const s = c / 255;
    return s <= 0.03928 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4;
  }) as [number, number, number];
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
};

const razon = (a: Rgb, b: Rgb): number => {
  const [la, lb] = [luminancia(a), luminancia(b)];
  return (Math.max(la, lb) + 0.05) / (Math.min(la, lb) + 0.05);
};

/** Razon de contraste WCAG entre dos colores (hex o `rgba(...)`, este sobre blanco); `undefined` si alguno no se entiende. */
export function razonDeContraste(a: string, b: string): number | undefined {
  const [ca, cb] = [opaco(a, [255, 255, 255]), opaco(b, [255, 255, 255])];
  return ca === undefined || cb === undefined ? undefined : razon(ca, cb);
}

export interface AdvertenciaDeContraste {
  /** Tipo de nodo evaluado. */
  tipo: string;
  estado: 'base' | Estado;
  parte: 'texto' | 'grafico';
  /** Capa de la pila que pone el color evaluado, para `related`. */
  capa: string;
  razon: number;
  minimo: number;
  mensaje: string;
}

const ultima = (pila: readonly CapaPintada[], tipos: readonly NombreDePrimitiva[]): CapaPintada | undefined =>
  [...pila].reverse().find((capa) => tipos.includes(capa.tipo));

function evaluar(pila: readonly CapaPintada[], fondo: Rgb, texto: Rgb): Array<{ parte: 'texto' | 'grafico'; capa: string; razon: number; color: string }> {
  const resultados: Array<{ parte: 'texto' | 'grafico'; capa: string; razon: number; color: string }> = [];
  const relleno = ultima(pila, ['solid', 'gradient']);
  const colores = relleno === undefined ? [] : (relleno.tipo === 'solid' ? ['color'] : ['from', 'to']).map((k) => String(relleno.props[k]));
  const fondos = colores.map((c) => ({ c, rgb: opaco(c, fondo) })).filter((x): x is { c: string; rgb: Rgb } => x.rgb !== undefined);
  if (relleno !== undefined && fondos.length > 0) {
    const peor = fondos.map((f) => ({ ...f, r: razon(texto, f.rgb) })).sort((a, b) => a.r - b.r)[0]!;
    resultados.push({ parte: 'texto', capa: relleno.nombre, razon: peor.r, color: peor.c });
  } else resultados.push({ parte: 'texto', capa: 'tokens', razon: razon(texto, fondo), color: 'fondo' });
  const borde = ultima(pila, ['border']);
  const trazo = borde === undefined ? undefined : opaco(String(borde.props['color']), fondo);
  if (borde !== undefined && trazo !== undefined) resultados.push({ parte: 'grafico', capa: borde.nombre, razon: razon(trazo, fondo), color: String(borde.props['color']) });
  return resultados;
}

/**
 * Advertencias de contraste del Tema por Tipo de nodo y estado: el texto
 * (`tokens.foreground`) contra el relleno vigente (4.5:1) y el borde contra el
 * fondo de la pagina (3:1). `tipos` mapea cada Tipo a su color de Paleta. Un
 * estado solo avisa si empeora lo que ya avisaba el base.
 */
export function advertenciasDeContraste(tema: Tema, tipos: Readonly<Record<string, string | undefined>>): AdvertenciaDeContraste[] {
  const estilo = estiloResuelto(tema, { tipos });
  const fondo = hexARgb(resolverTema(tema).tokens.background) ?? ([255, 255, 255] as const);
  const texto = hexARgb(resolverTema(tema).tokens.foreground) ?? ([0, 0, 0] as const);
  const avisos: AdvertenciaDeContraste[] = [];
  for (const [tipo, pintura] of Object.entries(estilo.pintura.nodo.tipos)) {
    const base = evaluar(pintura.capas, fondo, texto);
    const pilas: Array<['base' | Estado, readonly CapaPintada[]]> = [['base', pintura.capas], ...(Object.entries(pintura.estados) as Array<[Estado, CapaPintada[]]>)];
    for (const [estado, pila] of pilas) {
      for (const r of estado === 'base' ? base : evaluar(pila, fondo, texto)) {
        const minimo = r.parte === 'texto' ? MINIMO_TEXTO : MINIMO_GRAFICO;
        if (r.razon >= minimo) continue;
        if (estado !== 'base' && base.some((b) => b.parte === r.parte && Math.abs(b.razon - r.razon) < 1e-9)) continue;
        const que = r.parte === 'texto' ? 'El texto' : 'El borde';
        avisos.push({
          tipo,
          estado,
          parte: r.parte,
          capa: r.capa,
          razon: r.razon,
          minimo,
          mensaje: `${que} del Tipo '${tipo}' (estado ${estado}) tiene contraste ${r.razon.toFixed(2)}:1 con ${r.color}; el minimo es ${minimo}:1`,
        });
      }
    }
  }
  return avisos;
}

export interface TipoParaLeyenda {
  name: string;
  /** Nombre de Paleta del color del Tipo. */
  color?: string | undefined;
  icon?: string | undefined;
}

const quitarColor = (capa: CapaPintada) => ({
  nombre: capa.nombre,
  tipo: capa.tipo,
  props: Object.fromEntries(Object.entries(capa.props).filter(([k]) => (CATALOGO[capa.tipo].propiedades as Record<string, DefinicionDePropiedad | undefined>)[k]?.tipo !== 'color')),
  encima: capa.encima ?? false,
});

/**
 * Pares de Tipos que se distinguen unicamente por color de Paleta: misma pila
 * de Capas (sin contar colores) en reposo y en cada estado, mismo icono, y
 * colores pintados distintos. Orden de declaracion. Si el Nodo muestra la
 * insignia (`badge`, el nombre del Tipo en texto) ningun par es solo-color.
 */
export function tiposSoloColor(tema: Tema, tipos: readonly TipoParaLeyenda[]): Array<[string, string]> {
  const estilo = estiloResuelto(tema, { tipos: Object.fromEntries(tipos.map((t) => [t.name, t.color])) });
  if (muestra(estilo.metricas, 'badge')) return [];
  const firma = (t: TipoParaLeyenda) => {
    const p = estilo.pintura.nodo.tipos[t.name]!;
    const pilas = [p.capas, ...Object.entries(p.estados).sort(([a], [b]) => a.localeCompare(b)).map(([, pila]) => pila!)];
    return { estructura: JSON.stringify([t.icon ?? null, pilas.map((pila) => pila.map(quitarColor))]), completa: JSON.stringify([pilas]) };
  };
  const firmas = tipos.map(firma);
  const pares: Array<[string, string]> = [];
  for (let i = 0; i < tipos.length; i++) {
    for (let j = i + 1; j < tipos.length; j++) {
      if (firmas[i]!.estructura === firmas[j]!.estructura && firmas[i]!.completa !== firmas[j]!.completa) pares.push([tipos[i]!.name, tipos[j]!.name]);
    }
  }
  return pares;
}

export interface EntradaDeLeyenda {
  tipo: string;
  /** Primitiva de la Familia forma del Tipo (`rect` si no declara otra). */
  forma: string;
  /** Color pintado del Tipo (valor de Paleta), o `undefined` si no tiene. */
  color: string | undefined;
}

export interface Leyenda {
  entradas: EntradaDeLeyenda[];
  /** Hay Tipos que solo difieren por color: la leyenda debe mostrarse sola. */
  necesaria: boolean;
}

/** Leyenda derivada del Tema (Tipo, forma, color) para los Tipos dados. */
export function leyendaDelTema(tema: Tema, tipos: readonly TipoParaLeyenda[]): Leyenda {
  const estilo = estiloResuelto(tema, { tipos: Object.fromEntries(tipos.map((t) => [t.name, t.color])) });
  const paleta = resolverTema(tema).palette;
  return {
    necesaria: tiposSoloColor(tema, tipos).length > 0,
    entradas: tipos.map((t) => ({
      tipo: t.name,
      forma: ultima(estilo.pintura.nodo.tipos[t.name]!.capas, ['rect', 'pill', 'cut', 'circle'])?.tipo ?? 'rect',
      color: t.color === undefined ? undefined : Object.hasOwn(paleta, t.color) ? paleta[t.color] : undefined,
    })),
  };
}
