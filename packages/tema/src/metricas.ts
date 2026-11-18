/**
 * Metricas: espaciado y escala del Tema que `layout` usa para medir y `render` para dibujar. Solo dependen de
 * fuentes, tamano de texto y disposicion de Slots; las Capas de pintura nunca las cambian.
 */
import type { NodoResuelto, Tema } from 'canonico';

import { definicionDe } from './catalogo';
import { anchoDeTexto } from './medicion';
import type { MedicionDeMetricas, MedidasDeTexto } from './medicion';
import type { NombreDeSlot } from './catalogo';
import type { CajaDeSlots } from './disposicion';
import { NOMBRES_DE_TEXTO_DE_FILA } from './fila';
import type { TextoDeFila } from './fila';
import { cascada } from './parches';
import type { CapaDeTema, TipoDeDiagrama } from './parches';
import { metricasDeSecuencia } from './secuencia';
import type { MetricasDeSecuencia } from './secuencia';
import { alturaDeCabecera } from './slots';
import { resolverTema, temaParaDiagrama } from './tema';
import type { TemaResuelto } from './tema';

export interface Metricas {
  fontSize: number;
  /** Ancho medio de un caracter, relativo al tamano. */
  factorDeAncho: number;
  /** Entran en la clave de layout. */
  fuentes: Record<string, string>;
  /** Entra en la clave de layout. */
  medicion: MedicionDeMetricas;
  /** Por `claveDeTexto`; ausente al estimar. No entra en la clave. */
  anchos?: Readonly<Record<string, number>>;
  disposicion: CajaDeSlots;
  /** Lo que el Tema fija a un Slot de texto; lo que falta sale de `DEFINICION_DE_SLOT`. */
  medidaDeTexto: Readonly<Partial<Record<NombreDeSlot, { size?: number; leading?: number; mono?: boolean; peso?: number; prefijo?: string; borde?: number }>>>;
  /** Estilo `text` del Slot `title` que cambia su ancho, ademas de `size`. */
  titulo: {
    /** En em. */
    tracking: number;
    mayusculas: boolean;
    /** Margen a cada lado del texto del chip, en px. */
    relleno: number;
    borde: number;
    punto: boolean;
    /** Con relleno o borde se mide a su ancho natural en vez de estirarse. */
    caja: boolean;
  };
  /** La forma del Nodo exige una caja cuadrada (p. ej. `circle`). */
  cajaCuadrada: boolean;
  /** `min-width` de la raiz de la disposicion o el del nucleo. */
  anchoMinimo: number;
  /** Holgura tras el contenido: `slack` de la raiz de la disposicion o el del nucleo. */
  paddingHorizontal: number;
  /** Solo en Vista ER: chips de clave y `?` de los opcionales. */
  marcasDeClave?: true;
  /** Vista ER, en px; ausente, el del Slot `attrs` (los chips, 0.8 de el). */
  tamanoDeFila?: Partial<Record<TextoDeFila, number>>;
  /** Solo en Vista de secuencia. */
  secuencia?: MetricasDeSecuencia;
  margenDeTexto: number;
  /** Alto del Slot `title`. */
  cabecera: number;
  fila: number;
  /** `top` deja sitio al titulo. */
  paddingGrupo: { top: number; left: number; bottom: number; right: number };
  /** Lado del Slot `icon` (sin estilo `icon`, el tamano de texto) y margen del icono de un Grupo respecto a su borde. */
  iconoLado: number;
  /** `variant dot`: se muestra aunque el Tipo no declare icono. */
  iconoEsPunto: boolean;
  margenIcono: number;
  /** Desde el borde superior. */
  baseDeTitulo: number;
  margenDeControl: number;
  /** Relativas al tamano de texto del Tema. */
  escalaEtiqueta: number;
  escalaAtributo: number;
  escalaCardinalidad: number;
  /** `altoDeEtiqueta` es relacion alto/tamano. */
  holguraDeEtiqueta: number;
  altoDeEtiqueta: number;
  /** `pad-y`, a cada lado. */
  holguraVerticalDeEtiqueta: number;
  fuenteDeEtiqueta: string;
  /** Sin el, el normal. */
  pesoDeEtiqueta?: number;
}

const TAMANO_DE_TEXTO_POR_DEFECTO = 14;

/** px; 14 si falta. */
function tamanoDeTexto(fontSize: string | undefined): number {
  const declarado = Number.parseFloat(fontSize ?? '');
  return Number.isFinite(declarado) && declarado > 0 ? declarado : TAMANO_DE_TEXTO_POR_DEFECTO;
}

type EstilosDeSlot = TemaResuelto['nodo']['textos'];

function estiloDeTitulo(textos: EstilosDeSlot): Metricas['titulo'] {
  const props = textos.title?.props ?? {};
  return {
    tracking: Number(props['tracking'] ?? 0),
    mayusculas: props['transform'] === 'uppercase',
    relleno: Number(props['pad'] ?? 0),
    borde: props['border'] === undefined ? 0 : Number(props['border-width'] ?? 1),
    punto: props['dot'] !== undefined,
    caja: props['fill'] !== undefined || props['border'] !== undefined,
  };
}

function entradaDe(resuelto: TemaResuelto, pila: readonly CapaDeTema[], medidas: MedidasDeTexto | undefined, { slots, textos }: { slots: CajaDeSlots; textos: EstilosDeSlot } = resuelto.nodo): Metricas {
  const fontSize = tamanoDeTexto(resuelto.tokens.fontSize);
  const etiqueta = resuelto.arista.etiqueta?.props as { scale?: number; pad?: number; 'pad-y'?: number; font?: string; weight?: number } | undefined;
  const proporcional = !/mono/i.test(resuelto.fonts.body);
  return {
    fontSize,
    factorDeAncho: proporcional ? 0.55 : 0.6,
    fuentes: resuelto.fonts,
    medicion: medidas === undefined ? { nivel: 'estimado', fuentes: {} } : { nivel: 'medido', fuentes: medidas.fuentes },
    ...(medidas !== undefined && { anchos: medidas.anchos }),
    disposicion: slots,
    medidaDeTexto: Object.fromEntries(
      Object.entries(textos).flatMap(([slot, texto]) => {
        const { size, leading, font, weight, prefix, border } = texto.props as { size?: number; leading?: number; font?: string; weight?: number; prefix?: string; border?: string };
        const mono = font === 'mono';
        const peso = weight === undefined || weight === 400 ? undefined : weight;
        // La del titulo ya cuenta el borde en `titulo.borde`.
        const borde = texto.tipo === 'chip' && border !== undefined ? Number(texto.props['border-width'] ?? 1) : undefined;
        const medida = {
          ...(size !== undefined && { size }),
          ...(leading !== undefined && { leading }),
          ...(mono && { mono }),
          ...(peso !== undefined && { peso }),
          ...(prefix !== undefined && prefix !== '' && { prefijo: prefix }),
          ...(borde !== undefined && borde > 0 && { borde }),
        };
        return Object.keys(medida).length === 0 ? [] : [[slot, medida]];
      }),
    ),
    cajaCuadrada: pila.some((capa) => definicionDe(capa.primitiva.tipo).cajaMinima === 'cuadrado'),
    anchoMinimo: slots.anchoMinimo ?? 120,
    paddingHorizontal: slots.holgura ?? 32,
    margenDeTexto: 10,
    cabecera: Math.ceil(fontSize * 3.4),
    fila: Math.ceil(fontSize * 1.8),
    paddingGrupo: { top: 32, left: 16, bottom: 16, right: 16 },
    iconoLado: Number(textos.icon?.props['side'] ?? fontSize),
    iconoEsPunto: textos.icon?.props['variant'] === 'dot',
    margenIcono: 6,
    baseDeTitulo: fontSize + 8,
    margenDeControl: 12,
    titulo: estiloDeTitulo(textos),
    escalaEtiqueta: etiqueta?.scale ?? 0.85,
    escalaAtributo: 0.85,
    escalaCardinalidad: 0.8,
    holguraDeEtiqueta: 2 * (etiqueta?.pad ?? 4),
    altoDeEtiqueta: 1.4,
    holguraVerticalDeEtiqueta: 2 * (etiqueta?.['pad-y'] ?? 0),
    fuenteDeEtiqueta: etiqueta?.font === 'mono' ? resuelto.fonts.mono : resuelto.fonts.body,
    ...(etiqueta?.weight !== undefined && etiqueta.weight !== 400 && { pesoDeEtiqueta: etiqueta.weight }),
  };
}

/** `tipos` solo tiene los Tipos cuyas Metricas difieren de `base`. No depende de estados ni de pintura. */
export interface TablaDeMetricas {
  base: Metricas;
  tipos: Record<string, Metricas>;
  grupoAbierto: Metricas;
  grupoColapsado: Metricas;
  etiqueta: Metricas;
}

/** Alto de fila por px de texto cuando el Tema fija `size` sin `height`. */
const ESPACIO_DE_LINEA_DE_FILA = 1.4;

function tamanosDeFila(textos: NonNullable<TemaResuelto['fila']>['textos'] | undefined, fontSize: number): Partial<Record<TextoDeFila, number>> {
  const salida: Partial<Record<TextoDeFila, number>> = {};
  for (const nombre of NOMBRES_DE_TEXTO_DE_FILA) {
    const size = textos?.[nombre]?.props['size'];
    if (typeof size === 'number') salida[nombre] = fontSize * size;
  }
  return salida;
}

export function tablaDeMetricas(tema: Tema, diagrama: TipoDeDiagrama | undefined, medidas?: MedidasDeTexto): TablaDeMetricas {
  const tabla = tablaSinMarcas(tema, diagrama, medidas);
  if (diagrama === 'sequence') {
    const secuencia = metricasDeSecuencia(resolverTema(tema).secuencia);
    const con = (m: Metricas): Metricas => ({ ...m, secuencia });
    return { base: con(tabla.base), tipos: Object.fromEntries(Object.entries(tabla.tipos).map(([tipo, m]) => [tipo, con(m)])), grupoAbierto: con(tabla.grupoAbierto), grupoColapsado: con(tabla.grupoColapsado), etiqueta: con(tabla.etiqueta) };
  }
  if (diagrama !== 'er') return tabla;
  const fila = resolverTema(tema).fila;
  const conMarcas = (m: Metricas): Metricas => {
    const tamano = tamanosDeFila(fila?.textos, m.fontSize);
    const mayor = Math.max(0, ...Object.values(tamano));
    const alto = fila?.alto ?? (mayor > 0 ? Math.max(m.fila, Math.ceil(mayor * ESPACIO_DE_LINEA_DE_FILA)) : undefined);
    return { ...m, ...(alto !== undefined && { fila: alto }), ...(Object.keys(tamano).length > 0 && { tamanoDeFila: tamano }), marcasDeClave: true };
  };
  return { base: conMarcas(tabla.base), tipos: Object.fromEntries(Object.entries(tabla.tipos).map(([tipo, m]) => [tipo, conMarcas(m)])), grupoAbierto: conMarcas(tabla.grupoAbierto), grupoColapsado: conMarcas(tabla.grupoColapsado), etiqueta: conMarcas(tabla.etiqueta) };
}

function tablaSinMarcas(tema: Tema, diagrama: TipoDeDiagrama | undefined, medidas?: MedidasDeTexto): TablaDeMetricas {
  const resuelto = temaParaDiagrama(resolverTema(tema), diagrama);
  const base = entradaDe(resuelto, cascada(resuelto), medidas);
  const claveBase = JSON.stringify(base);
  const tipos: Record<string, Metricas> = {};
  for (const tipo of Object.keys(resuelto.nodo.tipos).sort()) {
    const entrada = entradaDe(resuelto, cascada(resuelto, { tipo }), medidas);
    if (JSON.stringify(entrada) !== claveBase) tipos[tipo] = entrada;
  }
  return { base, tipos, grupoAbierto: entradaDeGrupo(resuelto, false, medidas), grupoColapsado: entradaDeGrupo(resuelto, true, medidas), etiqueta: base };
}

/**
 * Abierto: el padding superior suma el alto de la cabecera, asi los hijos nunca la tocan. Colapsado: una hoja con
 * los Slots y estilos del Nodo salvo lo que cambie `collapsed`.
 */
function entradaDeGrupo(resuelto: TemaResuelto, colapsado: boolean, medidas?: MedidasDeTexto): Metricas {
  const { grupo } = resuelto;
  const textos = colapsado ? { ...resuelto.nodo.textos, ...grupo.colapsado.textos } : grupo.textos;
  const slots = colapsado ? (grupo.colapsado.slots ?? resuelto.nodo.slots) : grupo.slots;
  const entrada = entradaDe(resuelto, cascada(resuelto, { colapsado }, 'grupo'), medidas, { slots, textos });
  if (colapsado) return entrada;
  const escala = entrada.medidaDeTexto.title?.size ?? 1;
  const abierto = { ...entrada, cajaCuadrada: false, anchoMinimo: 0, paddingHorizontal: 2 * entrada.margenDeControl, cabecera: Math.ceil(entrada.fontSize * escala * 1.7) };
  const { top, left, bottom, right } = grupo.padding;
  return { ...abierto, paddingGrupo: { top: alturaDeCabecera(abierto) + top, left, bottom, right } };
}

/** Entrada base de la tabla: Nodo sin Tipo. */
export function metricasDe(tema: Tema, diagrama: TipoDeDiagrama | undefined): Metricas {
  return tablaDeMetricas(tema, diagrama).base;
}

/** La base si el Tema no le da caja propia al Tipo. */
export function metricasDeNodo(tabla: TablaDeMetricas, tipo?: string): Metricas {
  return tipo !== undefined && Object.hasOwn(tabla.tipos, tipo) ? tabla.tipos[tipo]! : tabla.base;
}

/** Grupo colapsado o Nodo hoja de su Tipo. */
export function metricasDeHoja(tabla: TablaDeMetricas, nodo: Pick<NodoResuelto, 'type' | 'collapsed'>): Metricas {
  return nodo.collapsed ? tabla.grupoColapsado : metricasDeNodo(tabla, nodo.type);
}

export function tablaUniforme(metricas: Metricas): TablaDeMetricas {
  return { base: metricas, tipos: {}, grupoAbierto: metricas, grupoColapsado: metricas, etiqueta: metricas };
}

export const comoTabla = (m: Metricas | TablaDeMetricas): TablaDeMetricas => ('grupoAbierto' in m ? m : tablaUniforme(m));

/** Igual si y solo si ningun elemento cambia de caja. */
export function claveDeMetricas(tabla: TablaDeMetricas): string {
  return JSON.stringify(tabla, (clave, valor: unknown) => (clave === 'anchos' ? undefined : valor));
}

export function tamanoDeEtiqueta(texto: string, metricas: Metricas): { width: number; height: number } {
  const tamano = metricas.fontSize * metricas.escalaEtiqueta;
  return {
    width: Math.ceil(anchoDeTexto(metricas, metricas.fuenteDeEtiqueta, tamano, texto, metricas.pesoDeEtiqueta)) + metricas.holguraDeEtiqueta,
    height: Math.ceil(tamano * metricas.altoDeEtiqueta) + metricas.holguraVerticalDeEtiqueta,
  };
}

/** px. Tramo final minimo de una Arista ER hacia una tabla y tamano por defecto del pie de gallo. */
export const LARGO_DE_MARCADOR_ER = 12;

export const textoDeGuarda = (guarda: string): string => `[${guarda}]`;

/** px; un texto mas largo se envuelve por palabras. */
export const ANCHO_MAXIMO_DE_NOTA = 200;
/** Relleno y esquina doblada de una Nota, en px. */
export const RELLENO_DE_NOTA = 8;
export const ESQUINA_DE_NOTA = 10;

/** Incluye el espacio: es lo que `cajaDeNota` mide. */
export function palabrasDeNota(texto: string): string[] {
  return [...new Set([' ', ...texto.split(/\s+/).filter((palabra) => palabra !== '')])];
}

/** El de la etiqueta, sin la escala. */
export function estiloDeTextoDeNota(metricas: Metricas): { familia: string; tamano: number; peso?: number } {
  return { familia: metricas.fuenteDeEtiqueta, tamano: metricas.fontSize, ...(metricas.pesoDeEtiqueta !== undefined && { peso: metricas.pesoDeEtiqueta }) };
}

/** Texto envuelto por palabras a `ANCHO_MAXIMO_DE_NOTA`, mas relleno y esquina doblada. */
export function cajaDeNota(texto: string, metricas: Metricas): { width: number; height: number; lines: string[]; lineHeight: number } {
  const { familia, tamano, peso } = estiloDeTextoDeNota(metricas);
  const ancho = (t: string): number => anchoDeTexto(metricas, familia, tamano, t, peso);
  const espacio = ancho(' ');
  const lineas: { texto: string; ancho: number }[] = [];
  for (const palabra of texto.split(/\s+/).filter((p) => p !== '')) {
    const w = ancho(palabra);
    const ultima = lineas.at(-1);
    if (ultima !== undefined && ultima.ancho + espacio + w <= ANCHO_MAXIMO_DE_NOTA) {
      ultima.texto += ` ${palabra}`;
      ultima.ancho += espacio + w;
    } else {
      lineas.push({ texto: palabra, ancho: w });
    }
  }
  if (lineas.length === 0) lineas.push({ texto: '', ancho: 0 });
  const lineHeight = Math.ceil(tamano * metricas.altoDeEtiqueta);
  return {
    width: Math.ceil(Math.max(...lineas.map((l) => l.ancho))) + 2 * RELLENO_DE_NOTA + ESQUINA_DE_NOTA / 2,
    height: lineas.length * lineHeight + 2 * RELLENO_DE_NOTA,
    lines: lineas.map((l) => l.texto),
    lineHeight,
  };
}
