/**
 * Metricas: los numeros de espaciado y escala derivados del Tema que `layout`
 * usa para medir y `render` para dibujar. Un solo modulo, para que lo reservado
 * y lo dibujado no puedan divergir. Solo dependen de la caja y de los Slots
 * (fuentes, tamano de texto, que Slots se muestran y en que orden): las Capas
 * de pintura nunca las cambian. Sin medir texto real (el layout corre en Node
 * y en Worker, sin DOM): el ancho se estima por caracter segun el tamano y la
 * familia de la fuente del Tema; una medicion real entraria aqui, como
 * adaptador de `metricasDe`.
 */
import type { Atributo, NodoResuelto, Tema } from 'canonico';

import { CATALOGO } from './catalogo';
import { anchoDeTexto } from './medicion';
import type { MedicionDeMetricas, MedidasDeTexto } from './medicion';
import type { DefinicionDePrimitiva, NombreDeSlot } from './catalogo';
import { cascada } from './parches';
import type { CapaDeTema } from './parches';
import { resolverTema } from './tema';
import type { TemaResuelto } from './tema';

export interface Metricas {
  /** Tamano del texto del Tema. */
  fontSize: number;
  /** Ancho medio de un caracter, relativo al tamano. */
  factorDeAncho: number;
  /** Familias del Tema; entran en la clave de layout y dicen con que familia se mide cada Slot. */
  fuentes: Record<string, string>;
  /** Origen de las medidas de texto (estimado o medido, con el hash de cada fuente); entra en la clave de layout. */
  medicion: MedicionDeMetricas;
  /** Anchos medidos por `claveDeTexto`; ausente al estimar. No entra en la clave (ver `claveDeMetricas`). */
  anchos?: Readonly<Record<string, number>>;
  /** Slots del Nodo que el Tema muestra, en orden visual. */
  slots: readonly NombreDeSlot[];
  /** La forma del Nodo exige una caja cuadrada (p. ej. `circle`); sale de la regla de caja minima de las Primitivas. */
  cajaCuadrada: boolean;
  /** Ancho minimo de un Nodo hoja. */
  anchoMinimo: number;
  /** Suma de los margenes izquierdo y derecho del texto de un Nodo hoja. */
  paddingHorizontal: number;
  /** Margen izquierdo del titulo y de los Atributos. */
  margenDeTexto: number;
  /** Alto del Slot `title` de un Nodo. */
  cabecera: number;
  /** Alto de cada fila del Slot `attrs`. */
  fila: number;
  /** Margen interior de un Grupo abierto; `top` deja sitio al titulo. */
  paddingGrupo: { top: number; left: number; bottom: number; right: number };
  /** Lado de la caja del icono y margen entre el icono y el borde del Nodo. */
  iconoLado: number;
  margenIcono: number;
  /** Linea base del titulo de un Grupo abierto y del control de colapso, desde el borde superior. */
  baseDeTitulo: number;
  /** Distancia del control de colapso al borde derecho. */
  margenDeControl: number;
  /** Tamano de texto respecto al del Tema. */
  escalaEtiqueta: number;
  escalaAtributo: number;
  escalaCardinalidad: number;
  /** Holgura horizontal y relacion alto/tamano de la caja de una etiqueta de Arista. */
  holguraDeEtiqueta: number;
  altoDeEtiqueta: number;
}

const TAMANO_DE_TEXTO_POR_DEFECTO = 14;

/** Tamano de texto en px del Tema (`tokens.fontSize`, p. ej. `"16px"`); 14 si falta. */
function tamanoDeTexto(fontSize: string | undefined): number {
  const declarado = Number.parseFloat(fontSize ?? '');
  return Number.isFinite(declarado) && declarado > 0 ? declarado : TAMANO_DE_TEXTO_POR_DEFECTO;
}

function entradaDe(resuelto: TemaResuelto, pila: readonly CapaDeTema[], medidas?: MedidasDeTexto): Metricas {
  const fontSize = tamanoDeTexto(resuelto.tokens.fontSize);
  // Solo la etiqueta de Arista cuenta en las Metricas: trazos y marcadores son pintura.
  const etiqueta = resuelto.arista.etiqueta?.props as { scale?: number; pad?: number } | undefined;
  const proporcional = !/mono/i.test(resuelto.fonts.body);
  return {
    fontSize,
    factorDeAncho: proporcional ? 0.55 : 0.6,
    fuentes: resuelto.fonts,
    medicion: medidas === undefined ? { nivel: 'estimado', fuentes: {} } : { nivel: 'medido', fuentes: medidas.fuentes },
    ...(medidas !== undefined && { anchos: medidas.anchos }),
    slots: resuelto.nodo.slots,
    cajaCuadrada: pila.some((capa) => (CATALOGO[capa.primitiva.tipo] as DefinicionDePrimitiva).cajaMinima === 'cuadrado'),
    anchoMinimo: 120,
    paddingHorizontal: 32,
    margenDeTexto: 10,
    cabecera: Math.ceil(fontSize * 3.4),
    fila: Math.ceil(fontSize * 1.8),
    paddingGrupo: { top: 32, left: 16, bottom: 16, right: 16 },
    iconoLado: fontSize,
    margenIcono: 6,
    baseDeTitulo: fontSize + 8,
    margenDeControl: 12,
    escalaEtiqueta: etiqueta?.scale ?? 0.85,
    escalaAtributo: 0.85,
    escalaCardinalidad: 0.8,
    holguraDeEtiqueta: 2 * (etiqueta?.pad ?? 4),
    altoDeEtiqueta: 1.4,
  };
}

/**
 * Tabla de Metricas por elemento (ADR 0008): una entrada para el Nodo sin Tipo
 * (`base`), una por cada Tipo cuyas Metricas difieren de la base, y las de Grupo
 * abierto, Grupo colapsado (una hoja) y etiqueta de Arista. Un Tipo que el Tema no
 * menciona, o cuya caja coincide con la base, usa la entrada base. Solo el estado
 * base (y el colapsado de un Grupo) puede cambiar la caja: la tabla no mira estados
 * ni la pintura de las Capas, asi que repintar nunca cambia su clave.
 */
export interface TablaDeMetricas {
  base: Metricas;
  tipos: Record<string, Metricas>;
  grupoAbierto: Metricas;
  grupoColapsado: Metricas;
  etiqueta: Metricas;
}

export function tablaDeMetricas(tema: Tema, medidas?: MedidasDeTexto): TablaDeMetricas {
  const resuelto = resolverTema(tema);
  const base = entradaDe(resuelto, cascada(resuelto), medidas);
  const claveBase = JSON.stringify(base);
  const tipos: Record<string, Metricas> = {};
  for (const tipo of Object.keys(resuelto.nodo.tipos).sort()) {
    const entrada = entradaDe(resuelto, cascada(resuelto, { tipo }), medidas);
    if (JSON.stringify(entrada) !== claveBase) tipos[tipo] = entrada;
  }
  return { base, tipos, grupoAbierto: base, grupoColapsado: base, etiqueta: base };
}

/** Entrada base de la tabla: las Metricas de un Nodo sin Tipo (compatibilidad con quien mide un solo Nodo). */
export function metricasDe(tema: Tema): Metricas {
  return tablaDeMetricas(tema).base;
}

/** Entrada de un Nodo hoja de ese Tipo; la base si el Tema no le da caja propia. */
export function metricasDeNodo(tabla: TablaDeMetricas, tipo?: string): Metricas {
  return tipo !== undefined && Object.hasOwn(tabla.tipos, tipo) ? tabla.tipos[tipo]! : tabla.base;
}

/** Entrada de un Nodo sin hijos visibles: Grupo colapsado o Nodo hoja de su Tipo. Es la que usan `layout` y `render`. */
export function metricasDeHoja(tabla: TablaDeMetricas, nodo: Pick<NodoResuelto, 'type' | 'collapsed'>): Metricas {
  return nodo.collapsed ? tabla.grupoColapsado : metricasDeNodo(tabla, nodo.type);
}

/** Tabla en la que todo elemento usa las mismas Metricas (para forzarlas desde fuera, p. ej. en pruebas). */
export function tablaUniforme(metricas: Metricas): TablaDeMetricas {
  return { base: metricas, tipos: {}, grupoAbierto: metricas, grupoColapsado: metricas, etiqueta: metricas };
}

export const comoTabla = (m: Metricas | TablaDeMetricas): TablaDeMetricas => ('grupoAbierto' in m ? m : tablaUniforme(m));

/** Parte de la clave de estructura que aportan las Metricas: igual si y solo si ningun elemento cambia de caja. */
export function claveDeMetricas(tabla: TablaDeMetricas): string {
  return JSON.stringify(tabla, (clave, valor: unknown) => (clave === 'anchos' ? undefined : valor));
}

/**
 * Atributos que un Nodo muestra como filas: solo los de un Nodo hoja (un Grupo
 * abierto contiene Nodos; uno colapsado es hoja) y solo si el Tema lista el Slot
 * `attrs`. Una sola regla para `layout` (tamano y puertos) y `render` (dibujo).
 */
export function atributosVisibles(
  nodo: Pick<NodoResuelto, 'children' | 'attributes'>,
  metricas: Pick<Metricas, 'slots'>,
): readonly Atributo[] {
  return nodo.children.length === 0 && metricas.slots.includes('attrs') ? nodo.attributes : [];
}

/** Texto de la fila de un Atributo; `render` escribe lo mismo. */
export function textoDeAtributo(atributo: Atributo): string {
  return `${atributo.name}: ${atributo.type}`;
}

/** Caja de una etiqueta de Arista: texto a `escalaEtiqueta`, medido como el de los Nodos. */
export function tamanoDeEtiqueta(texto: string, metricas: Metricas): { width: number; height: number } {
  const tamano = metricas.fontSize * metricas.escalaEtiqueta;
  return {
    width: Math.ceil(anchoDeTexto(metricas, metricas.fuentes['body']!, tamano, texto)) + metricas.holguraDeEtiqueta,
    height: Math.ceil(tamano * metricas.altoDeEtiqueta),
  };
}
