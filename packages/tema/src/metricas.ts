/**
 * Metricas: los numeros de espaciado y escala derivados del Tema que `layout`
 * usa para medir y `render` para dibujar. Un solo modulo, para que lo reservado
 * y lo dibujado no puedan divergir. Solo dependen de la caja y de los Slots
 * (fuentes, tamano de texto, la disposicion de Slots): las Capas
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
import { slotsDe } from './disposicion';
import type { CajaDeSlots } from './disposicion';
import { cascada } from './parches';
import type { CapaDeTema } from './parches';
import { alturaDeCabecera } from './slots';
import type { ContenidoDeNodo } from './slots';
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
  /** Mini-layout de los Slots del Nodo que el Tema muestra (un Slot fuera del arbol no se pinta ni se mide). */
  disposicion: CajaDeSlots;
  /** `size`, `leading`, `font mono` y `weight` que el Tema fija a un Slot de texto (los que no, usan los de `DEFINICION_DE_SLOT`); cambian el alto y el ancho que reserva. */
  medidaDeTexto: Readonly<Partial<Record<NombreDeSlot, { size?: number; leading?: number; mono?: boolean; peso?: number; prefijo?: string }>>>;
  /** Estilo `text` del Slot `title` que cambia su ancho (ademas de `size`): ver `textoDeSlot` en `slots.ts`. */
  titulo: {
    /** Separacion entre letras, en em. */
    tracking: number;
    mayusculas: boolean;
    /** Margen a cada lado del texto, en px (chip), y grosor de su borde. */
    relleno: number;
    borde: number;
    /** Lleva un punto antes del texto. */
    punto: boolean;
    /** Tiene caja propia (relleno o borde): se mide a su ancho natural en vez de estirarse. */
    caja: boolean;
  };
  /** La forma del Nodo exige una caja cuadrada (p. ej. `circle`); sale de la regla de caja minima de las Primitivas. */
  cajaCuadrada: boolean;
  /** Ancho minimo de un Nodo hoja: el `min-width` de la raiz de la disposicion o el del nucleo. */
  anchoMinimo: number;
  /** Holgura tras el contenido de un Nodo hoja: el `slack` de la raiz de la disposicion o el del nucleo. */
  paddingHorizontal: number;
  /** Margen izquierdo del titulo y de los Atributos. */
  margenDeTexto: number;
  /** Alto del Slot `title` de un Nodo. */
  cabecera: number;
  /** Alto de cada fila del Slot `attrs`. */
  fila: number;
  /** Margen interior de un Grupo abierto; `top` deja sitio al titulo. */
  paddingGrupo: { top: number; left: number; bottom: number; right: number };
  /** Lado del Slot `icon` (de su estilo `icon`, o el tamano de texto) y margen del icono de un Grupo respecto a su borde. */
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
  /** Margen vertical que la etiqueta suma a su alto (`pad-y`, a cada lado) y familia con la que se mide (`font`). */
  holguraVerticalDeEtiqueta: number;
  fuenteDeEtiqueta: string;
  /** Peso del texto de la etiqueta (`weight`); sin el, el normal. */
  pesoDeEtiqueta?: number;
}

const TAMANO_DE_TEXTO_POR_DEFECTO = 14;

/** Tamano de texto en px del Tema (`tokens.fontSize`, p. ej. `"16px"`); 14 si falta. */
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

/** Entrada de Metricas de un elemento: su pila (para la caja minima de la forma) y sus Slots y estilos de texto (`nodo` o `grupo`). */
function entradaDe(resuelto: TemaResuelto, pila: readonly CapaDeTema[], medidas: MedidasDeTexto | undefined, { slots, textos }: { slots: CajaDeSlots; textos: EstilosDeSlot } = resuelto.nodo): Metricas {
  const fontSize = tamanoDeTexto(resuelto.tokens.fontSize);
  // Solo la etiqueta de Arista cuenta en las Metricas: trazos y marcadores son pintura.
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
        const { size, leading, font, weight, prefix } = texto.props as { size?: number; leading?: number; font?: string; weight?: number; prefix?: string };
        const mono = font === 'mono';
        const peso = weight === undefined || weight === 400 ? undefined : weight;
        const medida = {
          ...(size !== undefined && { size }),
          ...(leading !== undefined && { leading }),
          ...(mono && { mono }),
          ...(peso !== undefined && { peso }),
          ...(prefix !== undefined && prefix !== '' && { prefijo: prefix }),
        };
        return Object.keys(medida).length === 0 ? [] : [[slot, medida]];
      }),
    ),
    cajaCuadrada: pila.some((capa) => (CATALOGO[capa.primitiva.tipo] as DefinicionDePrimitiva).cajaMinima === 'cuadrado'),
    // La raiz de la disposicion puede fijar su caja minima y su holgura; sin ellas, las del nucleo.
    anchoMinimo: slots.anchoMinimo ?? 120,
    paddingHorizontal: slots.holgura ?? 32,
    margenDeTexto: 10,
    cabecera: Math.ceil(fontSize * 3.4),
    fila: Math.ceil(fontSize * 1.8),
    paddingGrupo: { top: 32, left: 16, bottom: 16, right: 16 },
    iconoLado: Number(textos.icon?.props['side'] ?? fontSize),
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
  return { base, tipos, grupoAbierto: entradaDeGrupo(resuelto, false, medidas), grupoColapsado: entradaDeGrupo(resuelto, true, medidas), etiqueta: base };
}

/**
 * Entrada de un Grupo. Abierto: su cabecera es la disposicion `group`, la celda del titulo sigue el
 * tamano de su texto, el ancho minimo es el de la cabecera (mas el control de colapso) y el padding
 * superior suma el alto de la cabecera al de la zona de hijos, de modo que los hijos nunca la tocan.
 * Colapsado: una hoja con los Slots del Nodo, o los del parche `collapsed` si los cambia.
 */
function entradaDeGrupo(resuelto: TemaResuelto, colapsado: boolean, medidas?: MedidasDeTexto): Metricas {
  const { grupo } = resuelto;
  // El Grupo cerrado es un Nodo hoja: usa los Slots y estilos del Nodo salvo lo que `state collapsed` cambie.
  const textos = colapsado ? { ...resuelto.nodo.textos, ...grupo.colapsado.textos } : grupo.textos;
  const slots = colapsado ? (grupo.colapsado.slots ?? resuelto.nodo.slots) : grupo.slots;
  const entrada = entradaDe(resuelto, cascada(resuelto, { colapsado }, 'grupo'), medidas, { slots, textos });
  if (colapsado) return entrada;
  const escala = entrada.medidaDeTexto.title?.size ?? 1;
  const abierto = { ...entrada, cajaCuadrada: false, anchoMinimo: 0, paddingHorizontal: 2 * entrada.margenDeControl, cabecera: Math.ceil(entrada.fontSize * escala * 1.7) };
  const { top, left, bottom, right } = grupo.padding;
  return { ...abierto, paddingGrupo: { top: alturaDeCabecera(abierto) + top, left, bottom, right } };
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
  metricas: Pick<Metricas, 'disposicion'>,
): readonly Atributo[] {
  return nodo.children.length === 0 && muestra(metricas, 'attrs') ? nodo.attributes : [];
}

const listas = new WeakMap<CajaDeSlots, readonly NombreDeSlot[]>();

/** Si la disposicion del Tema incluye el Slot (memoizado por disposicion: se consulta por cada Nodo). */
export function muestra(metricas: Pick<Metricas, 'disposicion'>, slot: NombreDeSlot): boolean {
  let lista = listas.get(metricas.disposicion);
  if (lista === undefined) listas.set(metricas.disposicion, (lista = slotsDe(metricas.disposicion)));
  return lista.includes(slot);
}

/** Lo que un Nodo aporta a la colocacion de Slots; una sola regla para `layout`, `render` y `shell`. */
export function contenidoDeNodo(
  nodo: Pick<NodoResuelto, 'children' | 'attributes' | 'label' | 'icon' | 'type' | 'description' | 'source' | 'collapsed' | 'childCount'>,
  metricas: Pick<Metricas, 'disposicion'>,
): ContenidoDeNodo {
  const cuenta = nodo.collapsed ? nodo.childCount : undefined;
  return {
    // Sin Slot `counter`, un Grupo colapsado dice cuantos hijos esconde en el titulo.
    titulo: cuenta !== undefined && !muestra(metricas, 'counter') ? `${nodo.label} (${cuenta})` : nodo.label,
    atributos: atributosVisibles(nodo, metricas),
    icono: nodo.icon !== undefined,
    tipo: nodo.type,
    descripcion: nodo.description,
    ...(nodo.source[0] !== undefined && { fuente: nodo.source[0].ref }),
    ...(cuenta !== undefined && { cuenta }),
  };
}

/** Texto de la fila de un Atributo; `render` escribe lo mismo. */
export function textoDeAtributo(atributo: Atributo): string {
  return `${atributo.name}: ${atributo.type}`;
}

/** Caja de una etiqueta de Arista: texto a `escalaEtiqueta`, medido como el de los Nodos. */
export function tamanoDeEtiqueta(texto: string, metricas: Metricas): { width: number; height: number } {
  const tamano = metricas.fontSize * metricas.escalaEtiqueta;
  return {
    width: Math.ceil(anchoDeTexto(metricas, metricas.fuenteDeEtiqueta, tamano, texto, metricas.pesoDeEtiqueta)) + metricas.holguraDeEtiqueta,
    height: Math.ceil(tamano * metricas.altoDeEtiqueta) + metricas.holguraVerticalDeEtiqueta,
  };
}
