/** Accesibilidad del Tema: contraste por Tipo y estado, `solo-color` y leyenda derivada. Solo calcula. */
import type { Tema, TipoDeMensaje } from 'canonico';

import { CATALOGO, definicionDe, primitivasDeFamilia } from './catalogo';
import type { DefinicionDePropiedad, NombreDePrimitiva } from './catalogo';
import { hexARgb } from './color';
import { estiloResuelto } from './estilo';
import { capasDeAristaEr } from './mensajes';
import { muestra } from './contenido';
import { resolverTema } from './tema';
import type { CapaPintada, PrimitivaPintada } from './estilo';
import type { Estado, TipoDeDiagrama } from './parches';

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

/** El translucido se compone sobre `fondo`. */
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

/** Razon WCAG entre hex o `rgba(...)` (compuesto sobre blanco); `undefined` si alguno no se entiende. */
export function razonDeContraste(a: string, b: string): number | undefined {
  const [ca, cb] = [opaco(a, [255, 255, 255]), opaco(b, [255, 255, 255])];
  return ca === undefined || cb === undefined ? undefined : razon(ca, cb);
}

export interface AdvertenciaDeContraste {
  tipo: string;
  estado: 'base' | Estado;
  parte: 'texto' | 'grafico';
  /** Capa que pone el color evaluado. */
  capa: string;
  razon: number;
  minimo: number;
  mensaje: string;
}

const ultima = (pila: readonly CapaPintada[], tipos: readonly NombreDePrimitiva[]): CapaPintada | undefined =>
  [...pila].reverse().find((capa) => tipos.includes(capa.tipo));

function evaluar(pila: readonly CapaPintada[], fondo: Rgb, texto: Rgb): Array<{ parte: 'texto' | 'grafico'; capa: string; razon: number; color: string }> {
  const resultados: Array<{ parte: 'texto' | 'grafico'; capa: string; razon: number; color: string }> = [];
  const relleno = [...pila].reverse().find((capa) => definicionDe(capa.tipo).fondoDeTexto !== undefined);
  const colores = relleno === undefined ? [] : (definicionDe(relleno.tipo).fondoDeTexto ?? []).map((k) => String(relleno.props[k]));
  const fondos = colores.map((c) => ({ c, rgb: opaco(c, fondo) })).filter((x): x is { c: string; rgb: Rgb } => x.rgb !== undefined);
  if (relleno !== undefined && fondos.length > 0) {
    const peor = fondos.map((f) => ({ ...f, r: razon(texto, f.rgb) })).sort((a, b) => a.r - b.r)[0]!;
    resultados.push({ parte: 'texto', capa: relleno.nombre, razon: peor.r, color: peor.c });
  } else resultados.push({ parte: 'texto', capa: 'tokens', razon: razon(texto, fondo), color: 'fondo' });
  const borde = ultima(pila, primitivasDeFamilia('borde'));
  const trazo = borde === undefined ? undefined : opaco(String(borde.props['color']), fondo);
  if (borde !== undefined && trazo !== undefined) resultados.push({ parte: 'grafico', capa: borde.nombre, razon: razon(trazo, fondo), color: String(borde.props['color']) });
  return resultados;
}

/**
 * Texto (`tokens.foreground`) contra el relleno (4.5:1) y borde contra el fondo de pagina (3:1), por Tipo y estado.
 * Un estado solo avisa si empeora el base. Ignora los parches de Tipo de diagrama.
 */
export function advertenciasDeContraste(tema: Tema, tipos: Readonly<Record<string, string | undefined>>): AdvertenciaDeContraste[] {
  const estilo = estiloResuelto(tema, { diagrama: undefined, tipos });
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
        const que = r.parte === 'texto' ? 'The text' : 'The border';
        avisos.push({
          tipo,
          estado,
          parte: r.parte,
          capa: r.capa,
          razon: r.razon,
          minimo,
          mensaje: `${que} of kind '${tipo}' (state ${estado}) has contrast ${r.razon.toFixed(2)}:1 with ${r.color}; the minimum is ${minimo}:1`,
        });
      }
    }
  }
  return avisos;
}

export interface TipoParaLeyenda {
  name: string;
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
 * Pares de Tipos con la misma pila sin colores (en reposo y en cada estado) y el mismo icono, pero colores distintos;
 * en orden de declaracion. Si el Nodo muestra `badge` no hay ninguno. `diagrama` `undefined`: sin parches de diagrama.
 */
export function tiposSoloColor(tema: Tema, diagrama: TipoDeDiagrama | undefined, tipos: readonly TipoParaLeyenda[]): Array<[string, string]> {
  const estilo = estiloResuelto(tema, { diagrama, tipos: Object.fromEntries(tipos.map((t) => [t.name, t.color])) });
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

const quitarColorDeMarcador = (marcador: PrimitivaPintada | undefined) => (marcador === undefined ? null : quitarColor({ nombre: '', tipo: marcador.tipo, props: marcador.props }));

function paresSoloColor<T extends string>(nombres: readonly T[], pintura: (nombre: T) => { capas: readonly CapaPintada[]; origen?: PrimitivaPintada | undefined; fin?: PrimitivaPintada | undefined }): Array<[T, T]> {
  const firmas = nombres.map((nombre) => {
    const { capas, origen, fin } = pintura(nombre);
    return { estructura: JSON.stringify([capas.map(quitarColor), quitarColorDeMarcador(origen), quitarColorDeMarcador(fin)]), completa: JSON.stringify([capas, origen ?? null, fin ?? null]) };
  });
  const pares: Array<[T, T]> = [];
  for (let i = 0; i < nombres.length; i++) {
    for (let j = i + 1; j < nombres.length; j++) {
      if (firmas[i]!.estructura === firmas[j]!.estructura && firmas[i]!.completa !== firmas[j]!.completa) pares.push([nombres[i]!, nombres[j]!]);
    }
  }
  return pares;
}

/** Solo entre los `tipos` dados, en su orden. */
export function mensajesSoloColor(tema: Tema, tipos: readonly TipoDeMensaje[]): Array<[TipoDeMensaje, TipoDeMensaje]> {
  const estilo = estiloResuelto(tema, { diagrama: 'sequence' });
  const { tipos: porTipo } = estilo.pintura.secuencia!.mensaje.base;
  return paresSoloColor(tipos, (kind) => porTipo[kind]!);
}

export function aristaIdentificanteSoloColor(tema: Tema): boolean {
  const { arista } = estiloResuelto(tema, { diagrama: 'er' }).pintura;
  return paresSoloColor(['identificante', 'no-identificante'] as const, (nombre) => ({ capas: capasDeAristaEr(arista, nombre === 'identificante') })).length > 0;
}

export interface EntradaDeLeyenda {
  tipo: string;
  /** `rect` si el Tipo no declara otra. */
  forma: string;
  /** Valor de Paleta. */
  color: string | undefined;
}

export interface Leyenda {
  entradas: EntradaDeLeyenda[];
  /** Hay Tipos que solo difieren por color. */
  necesaria: boolean;
}

export function leyendaDelTema(tema: Tema, diagrama: TipoDeDiagrama | undefined, tipos: readonly TipoParaLeyenda[]): Leyenda {
  const estilo = estiloResuelto(tema, { diagrama, tipos: Object.fromEntries(tipos.map((t) => [t.name, t.color])) });
  const paleta = resolverTema(tema).palette;
  return {
    necesaria: tiposSoloColor(tema, diagrama, tipos).length > 0,
    entradas: tipos.map((t) => ({
      tipo: t.name,
      forma: ultima(estilo.pintura.nodo.tipos[t.name]!.capas, primitivasDeFamilia('forma'))?.tipo ?? 'rect',
      color: t.color === undefined ? undefined : Object.hasOwn(paleta, t.color) ? paleta[t.color] : undefined,
    })),
  };
}
