/**
 * Estilo resuelto de un Tema: Metricas (caja y Slots, lo que mide `layout`) y
 * pintura (Capas con el color ya convertido de nombre de Paleta a valor). Son
 * dos mitades separadas a proposito: cambiar solo la pintura no relayoutea.
 * Pura y determinista: mismo Tema, mismo resultado.
 */
import type { Tema } from 'canonico';

import type { Animacion, Efecto, Transicion } from './animacion';
import { pilaDeFuente, resolverFuentes } from './fuentes';
import type { CaraDeFuente } from './fuentes';
import type { MedidasDeTexto } from './medicion';
import { tablaDeMetricas } from './metricas';
import type { Metricas, TablaDeMetricas } from './metricas';
import { CATALOGO } from './catalogo';
import type { DefinicionDePrimitiva, NombreDePrimitiva, NombreDeSlot } from './catalogo';
import { resolverColor } from './color';
import type { ContextoDeColor } from './color';
import { aplicarOps, cascada } from './parches';
import type { CapaDeTema, ElementoDeTema, Estado, OpDeCapa, TipoDeDiagrama } from './parches';
import * as derivacion from './derivacion';
import { CLAVES_DE_FILA, claveDeFila, variantesDeFila } from './fila';
import type { TextoDeFila, VarianteDeFila } from './fila';
import { ESPECIFICACION_DE_SECUENCIA } from './secuencia';
import { resolverTema, temaParaDiagrama } from './tema';
import type { TemaResuelto } from './tema';

/** Capa con los colores ya resueltos contra la Paleta del Tema. */
export interface CapaPintada {
  nombre: string;
  tipo: NombreDePrimitiva;
  props: Record<string, number | string>;
  /** Va sobre el contenido (`over`); sin la clave, bajo el. */
  encima?: true;
  animacion?: Animacion;
}

/** Primitiva de marcador o etiqueta con sus colores ya resueltos. */
export interface PrimitivaPintada {
  tipo: NombreDePrimitiva;
  props: Record<string, number | string>;
}

/**
 * Unico lugar donde el `tipo` (texto) de una Primitiva del Tema se estrecha a `NombreDePrimitiva`: el Tema ya lo valido contra
 * el catalogo al resolverse. Quien arma una Primitiva pintada (aqui y en `render`) pasa por este constructor, sin casts propios.
 */
export const primitivaPintada = (tipo: string, props: Record<string, number | string>): PrimitivaPintada => ({ tipo: tipo as NombreDePrimitiva, props });

/** Pintura de una Arista: trazos (de abajo hacia arriba), marcadores y etiqueta. El color del marcador sin `color` es el del primer trazo. */
export interface PinturaDeArista {
  capas: CapaPintada[];
  /** Trazos de las Aristas identificantes de una Vista ER (`identifying` del bloque `edge`); ausente = los de `capas`. */
  identificante?: CapaPintada[];
  origen?: PrimitivaPintada;
  fin?: PrimitivaPintada;
  etiqueta: PrimitivaPintada;
}

/** Pila de un Nodo por estado: `capas` es el reposo; cada estado declarado trae su pila completa. */
export interface PinturaDeNodo {
  capas: CapaPintada[];
  /** Estilo de texto de los Slots que lo declaran. */
  textos: Partial<Record<NombreDeSlot, PrimitivaPintada>>;
  estados: Partial<Record<Estado, CapaPintada[]>>;
  /** Animacion del elemento (no de una Capa); ausente si el Tema no declara ninguna. */
  animacion?: AnimacionDeNodo;
}

/**
 * `transition` base, por estado, `enter`/`exit` y `stagger` del Nodo. Solo
 * pintura: ninguno de estos valores entra en las Metricas.
 */
export interface AnimacionDeNodo {
  transicion?: Transicion;
  transicionesDeEstado?: Partial<Record<Estado, Transicion>>;
  entrada?: Efecto;
  salida?: Efecto;
  escalonadoMs?: number;
}

/** Fondo de pagina: rellenos de abajo hacia arriba y si quedan fijos al visor. Sin Capas, solo el color `background` del Tema. */
export interface PinturaDePagina {
  capas: CapaPintada[];
  fijo: boolean;
}

/** Pintura de un Nodo o de un Grupo (abierto o colapsado): la del elemento sin Tipo y la de cada Tipo con parches. */
export interface PinturaDeElemento extends PinturaDeNodo {
  tipos: Record<string, PinturaDeNodo>;
}

/**
 * Pintura de la fila de una tabla ER (bloque `row`): la pila base, la de cada variante que difiere de ella (ver `claveDeFila`)
 * y el estilo de los textos `name`, `type` y `key`. Existe en el Estilo de toda Vista ER (derivada si el Tema no declara `row`).
 */
export interface PinturaDeFila {
  base: CapaPintada[];
  variantes: Record<string, CapaPintada[]>;
  /** Pila de las variantes en cada estado que el Tema declara, por `claveDeFila(variante)@estado`; la que falta se pinta como en reposo. */
  estados: Record<string, CapaPintada[]>;
  textos: Partial<Record<TextoDeFila, PrimitivaPintada>>;
  /** El Tema no declara `row`: filas sin Capas y con el texto del Slot `attrs`. */
  derivado?: true;
}

/** Pila de Capas de una fila: la de su variante si el Tema la parchea, si no la base. */
export const pilaDeFila = (fila: PinturaDeFila, variante: VarianteDeFila, estado?: Estado): CapaPintada[] =>
  (estado === undefined ? undefined : fila.estados[`${claveDeFila(variante)}@${estado}`]) ?? fila.variantes[claveDeFila(variante)] ?? fila.base;

/** Trazo de un elemento de secuencia (`lifeline`, `message`): pila de trazos, marcadores, etiqueta y la pila de cada variante (`kind`) que el Tema parchea. */
export interface PinturaDeTrazoDeSecuencia {
  capas: CapaPintada[];
  origen?: PrimitivaPintada;
  /** En `lifeline`, el marcador de una Lifeline destruida: el del Tema o el derivado (`cross`). */
  fin?: PrimitivaPintada;
  /** Variantes con parche propio en el Tema (tipo de Mensaje). */
  variantes: Record<string, TrazoDeVariante>;
  /** En `message`, la pila con que se dibuja cada tipo de Mensaje: la del parche `kind` o la derivada (ADR 0009). Vacio en `lifeline`. */
  tipos: Record<string, TrazoDeVariante>;
}

/** Pila de trazos y marcadores de una variante de un trazo de secuencia. */
export interface TrazoDeVariante {
  capas: CapaPintada[];
  origen?: PrimitivaPintada;
  fin?: PrimitivaPintada;
}

/** Elemento de secuencia con Capas de Nodo (`activation`, `fragment`, `note`): su pila, el estilo de sus textos y la pila de cada variante (`op`). */
export interface PinturaDeCajaDeSecuencia {
  capas: CapaPintada[];
  textos: Record<string, PrimitivaPintada>;
  variantes: Record<string, CapaPintada[]>;
  /** Pila en cada estado que el Tema declara (`hover`, `seleccionado`): la base y la de cada variante (`op`) con el parche de estado encima. */
  estados: Partial<Record<Estado, { capas: CapaPintada[]; variantes: Record<string, CapaPintada[]> }>>;
  /** El Tema no declara el bloque: la pila sale de `node` o de `edge` por las reglas del ADR 0009. */
  derivado?: true;
}

/** Trazo de secuencia por color de Paleta del Nodo de origen (`ORIGEN`), como la Arista. */
export interface TrazosDeSecuencia {
  base: PinturaDeTrazoDeSecuencia;
  origenes: Record<string, PinturaDeTrazoDeSecuencia>;
  derivado?: true;
}

/** `activation`: derivada, la pila de cada Nodo, Grupo o Grupo colapsado (y su Tipo) reducida a su forma, relleno y borde. */
export interface PinturaDeActivacion extends PinturaDeCajaDeSecuencia {
  /** Solo si es derivada: la pila sale del Nodo de su Lifeline, como `Pintura.nodo` y `Pintura.grupo`. */
  porNodo?: Pick<Pintura, 'nodo' | 'grupo'>;
}

/** `fragment`: ademas de su pila, el color de las guardas (el de `guard` o el del trazo de la Arista) y siempre un `divider`. */
export interface PinturaDeFragmento extends PinturaDeCajaDeSecuencia {
  colorDeGuarda: string;
}

/** `note`: el papel es el color de nota de la Paleta (`amber`, si no el borde) y la opacidad del relleno (tinte suave si es derivada). */
export interface PinturaDeNota extends PinturaDeCajaDeSecuencia {
  papel: { color: string; opacidadDeRelleno: number };
}

/**
 * Pintura de los Elementos de secuencia (ADR 0009), ya resueltos: los que el Tema declara y, los que no, derivados de
 * `edge` y `node` (con `derivado`). `render` solo los lee.
 */
export interface PinturaDeSecuencia {
  lifeline: TrazosDeSecuencia;
  mensaje: TrazosDeSecuencia;
  activacion: PinturaDeActivacion;
  fragmento: PinturaDeFragmento;
  nota: PinturaDeNota;
}

export interface Pintura {
  /** `seed N` del Tema (token `seed`); sin el, la semilla de cada Capa sale solo del id y del nombre. */
  semilla?: number;
  /** Reposo y estados del Nodo sin Tipo, y los de cada Tipo de nodo con parches o pedido en `OpcionesDeEstilo.tipos`. */
  nodo: PinturaDeElemento;
  /** Grupo abierto y colapsado (una hoja): cada uno con su pila, Tipos y estados. Sin `group` en el Tema, la pila sobria derivada de sus tokens. */
  grupo: { abierto: PinturaDeElemento; colapsado: PinturaDeElemento };
  /** Reposo de la Arista y, por color de Paleta del Nodo de origen, la suya (`ORIGEN` toma ese color). */
  arista: PinturaDeArista & { origenes: Record<string, PinturaDeArista> };
  pagina: PinturaDePagina;
  /** Fila de las tablas ER; solo en una Vista ER (derivada si el Tema no declara `row`). */
  fila?: PinturaDeFila;
  /** Elementos de secuencia, declarados o derivados; solo en una Vista de secuencia. */
  secuencia?: PinturaDeSecuencia;
}

/** Fuentes del Estilo resuelto: la pila `font-family` de cuerpo y mono (con la reserva declarada) y las caras que el Workspace aporta. */
export interface FuentesResueltas {
  cuerpo: string;
  mono: string;
  caras: CaraDeFuente[];
}

export interface EstiloResuelto {
  /** Entrada base de la tabla (Nodo sin Tipo): lo que mide un Nodo que el Tema no menciona. */
  metricas: Metricas;
  /** Metricas por elemento (ADR 0008): Nodo por Tipo, Grupo abierto y colapsado, etiqueta de Arista. */
  tabla: TablaDeMetricas;
  pintura: Pintura;
  fuentes: FuentesResueltas;
}

export interface OpcionesDeEstilo {
  /** Tipo de diagrama de la Vista: aplica los parches `diagram <tipo>` del Tema (Metricas y pintura) bajo la cascada de Tipo de nodo y estado. */
  diagrama: TipoDeDiagrama;
  /** Medidas reales de texto con las que se calculo la Geometria: las Metricas del dibujo deben ser las del layout. */
  medidas?: MedidasDeTexto;
  /** Rutas de los archivos de fuente del Workspace; de ellos salen las caras de `fuentes`. Sin ellas, ninguna. */
  archivosDeFuente?: readonly string[];
  /** Tipos de nodo de la Fuente y el nombre de Paleta de su `color` (`COLOR` lo usa). */
  tipos?: Readonly<Record<string, string | undefined>>;
  /** Cuarto nivel de la cascada: parches de la Vista, aplicados al final de cada pila del Nodo. */
  vista?: readonly OpDeCapa[];
  /**
   * Variable CSS que el dibujo fija por elemento con su color (p. ej. `--trazo`): `COLOR` se resuelve a ella y
   * una misma hoja sirve a todos los colores. Sin ella, `COLOR` toma el de `tipos` (o el borde del Tema).
   */
  colorEnVariable?: string;
}

const COLOR_DE_RESPALDO = '__borde';

const contextoDeColor = (tema: TemaResuelto, colorDelTipo: string | undefined, variable?: string): { paleta: Record<string, string>; contexto: ContextoDeColor } => {
  const nombre = colorDelTipo !== undefined && Object.hasOwn(tema.palette, colorDelTipo) ? colorDelTipo : COLOR_DE_RESPALDO;
  return { paleta: { ...tema.palette, [COLOR_DE_RESPALDO]: tema.tokens.border }, contexto: { color: nombre, origen: nombre, ...(variable !== undefined && { variable }) } };
};

/** Props de una Primitiva con sus colores (nombre de Paleta y modificadores) convertidos a valor. */
function resolverProps(
  primitiva: { tipo: string; props: Readonly<Record<string, number | string>> },
  paleta: Readonly<Record<string, string>>,
  contexto: ContextoDeColor,
): Record<string, number | string> {
  const definicion: DefinicionDePrimitiva = CATALOGO[primitiva.tipo as NombreDePrimitiva];
  return Object.fromEntries(
    Object.entries(primitiva.props).map(([clave, valor]) => [
      clave,
      definicion.propiedades[clave]?.tipo === 'color' ? resolverColor(String(valor), paleta, contexto) : valor,
    ]),
  );
}

function pintar(pila: readonly CapaDeTema[], tema: TemaResuelto, colorDelTipo: string | undefined, variable?: string): CapaPintada[] {
  const { paleta, contexto } = contextoDeColor(tema, colorDelTipo, variable);
  return pila.map(({ nombre, primitiva, encima, animacion }) => ({
    nombre,
    ...primitivaPintada(primitiva.tipo, resolverProps(primitiva, paleta, contexto)),
    ...(encima === true && { encima: true as const }),
    ...(animacion !== undefined && { animacion }),
  }));
}

/** Trazo por defecto de una Arista sin pila: una linea del color del borde. */
const TRAZO_POR_DEFECTO: CapaDeTema = { nombre: 'linea', primitiva: { tipo: 'line', props: { color: COLOR_DE_RESPALDO, width: 1, style: 'solid', corner: 'sharp', cut: 6 } } };

/** Pintura de una Arista cuyo Nodo de origen tiene el color `colorDeOrigen` (nombre de Paleta). */
function pintarArista(tema: TemaResuelto, colorDeOrigen: string | undefined): PinturaDeArista {
  const { arista } = tema;
  const { paleta, contexto } = contextoDeColor(tema, colorDeOrigen);
  const capas = pintar(arista.capas.length === 0 ? [TRAZO_POR_DEFECTO] : (arista.capas as CapaDeTema[]), tema, colorDeOrigen);
  // El marcador sin color toma el del trazo principal (el de arriba de la pila), no el del halo de debajo.
  const colorDelTrazo = capas.at(-1)?.props['color'];
  const marcador = (primitiva: { tipo: string; props: Record<string, number | string> } | undefined): PrimitivaPintada | undefined => {
    if (primitiva === undefined) return undefined;
    const props = resolverProps(primitiva, paleta, contexto);
    if (props['color'] === undefined && colorDelTrazo !== undefined) props['color'] = colorDelTrazo;
    return primitivaPintada(primitiva.tipo, props);
  };
  const etiqueta = arista.etiqueta ?? { tipo: 'label', props: { scale: 0.85, pad: 4, radius: 0 } };
  const identificante = arista.identificante === undefined ? undefined : pintar(aplicarOps(arista.capas.length === 0 ? [TRAZO_POR_DEFECTO] : (arista.capas as CapaDeTema[]), arista.identificante, tema.palette, 'parchear', 'capa-arista').pila, tema, colorDeOrigen);
  const origen = marcador(arista.origen);
  const fin = marcador(arista.fin);
  return {
    capas,
    ...(identificante !== undefined && { identificante }),
    ...(origen !== undefined && { origen }),
    ...(fin !== undefined && { fin }),
    etiqueta: primitivaPintada(etiqueta.tipo, resolverProps(etiqueta, paleta, contexto)),
  };
}

/**
 * Pila sobria de un Grupo sin Capas en el Tema (derivada solo de sus tokens, nunca de las Capas del Nodo):
 * esquinas suaves, un velo del color del texto y un borde del color del Tipo (o del borde del Tema).
 * Colapsado, el velo es mas denso y el borde discontinuo.
 */
function grupoSobrio(tema: TemaResuelto, colapsado: boolean, variable: string | undefined): CapaPintada[] {
  const { foreground, border } = tema.tokens;
  const velo = `color-mix(in srgb, ${foreground} ${colapsado ? 8 : 4}%, transparent)`;
  return [
    { nombre: 'caja', tipo: 'rect', props: { radius: 8 } },
    { nombre: 'relleno', tipo: 'solid', props: { color: velo } },
    { nombre: 'borde', tipo: colapsado ? 'dashed' : 'border', props: { color: variable === undefined ? border : `var(${variable})`, width: 1 } },
  ];
}

/** Pintura del bloque `row`: la pila de cada variante de fila (impar, marcas de clave, opcional) que el Tema parchea. `COLOR` toma el color del Nodo (`variable`). */
function pinturaDeFila(tema: TemaResuelto, variable: string | undefined): PinturaDeFila | undefined {
  const { fila } = tema;
  if (fila === undefined) return undefined;
  const pila = (v: VarianteDeFila, estado?: Estado): CapaPintada[] => {
    const ops: ReadonlyArray<readonly OpDeCapa[]> = [v.impar ? fila.alterna : [], ...CLAVES_DE_FILA.filter((k) => v.keys.includes(k)).map((k) => fila.claves[k] ?? []), v.opcional ? fila.opcional : [], estado === undefined ? [] : (fila.estados[estado] ?? [])];
    const capas = ops.reduce<CapaDeTema[]>((acc, parche) => (parche.length === 0 ? acc : aplicarOps(acc, parche, tema.palette, 'parchear').pila), fila.capas as CapaDeTema[]);
    return pintar(capas, tema, undefined, variable);
  };
  const base = pila({ impar: false, keys: [], opcional: false });
  const variantes: Record<string, CapaPintada[]> = {};
  const estados: Record<string, CapaPintada[]> = {};
  const declarados = (Object.keys(fila.estados) as Estado[]).filter((e) => (fila.estados[e]?.length ?? 0) > 0);
  for (const v of variantesDeFila()) {
    const propia = pila(v);
    if (JSON.stringify(propia) !== JSON.stringify(base)) variantes[claveDeFila(v)] = propia;
    for (const estado of declarados) estados[`${claveDeFila(v)}@${estado}`] = pila(v, estado);
  }
  const { paleta, contexto } = contextoDeColor(tema, undefined, variable);
  const textos = Object.fromEntries(Object.entries(fila.textos).map(([nombre, texto]) => [nombre, primitivaPintada(texto.tipo, resolverProps(texto, paleta, contexto))]));
  return { base, variantes, estados, textos };
}

/**
 * Pintura de los Elementos de secuencia: la de los bloques que el Tema declara y, los que no, derivada (`derivacion`) de
 * la pintura de `node` y `edge`. `variable` da el color del Nodo a `COLOR` en los bloques de caja.
 */
function pinturaDeSecuencia(tema: TemaResuelto, variable: string | undefined, pintura: Pick<Pintura, 'nodo' | 'grupo' | 'arista'>): PinturaDeSecuencia {
  const secuencia = tema.secuencia ?? {};
  const marcador = (primitiva: { tipo: string; props: Record<string, number | string> } | undefined, paleta: Record<string, string>, contexto: ContextoDeColor, color: unknown): PrimitivaPintada | undefined => {
    if (primitiva === undefined) return undefined;
    const props = resolverProps(primitiva, paleta, contexto);
    if (props['color'] === undefined && color !== undefined) props['color'] = color as string;
    return primitivaPintada(primitiva.tipo, props);
  };
  const trazo = (nombre: 'lifeline' | 'message', colorDeOrigen: string | undefined): PinturaDeTrazoDeSecuencia | undefined => {
    const bloque = secuencia[nombre];
    if (bloque === undefined) return undefined;
    const { paleta, contexto } = contextoDeColor(tema, colorDeOrigen);
    const ubicacion = ESPECIFICACION_DE_SECUENCIA[nombre].capas;
    const capas = pintar(bloque.capas.length === 0 ? [TRAZO_POR_DEFECTO] : (bloque.capas as CapaDeTema[]), tema, colorDeOrigen);
    const colorDelTrazo = capas.at(-1)?.props['color'];
    const origen = marcador(bloque.origen, paleta, contexto, colorDelTrazo);
    const fin = marcador(bloque.fin, paleta, contexto, colorDelTrazo);
    const variantes = Object.fromEntries(
      Object.entries(bloque.parches).map(([variante, parche]) => {
        const propias = pintar(aplicarOps(bloque.capas as CapaDeTema[], parche.ops, tema.palette, 'parchear', ubicacion).pila, tema, colorDeOrigen);
        const colorPropio = propias.at(-1)?.props['color'];
        const o = marcador(parche.origen, paleta, contexto, colorPropio);
        const f = marcador(parche.fin, paleta, contexto, colorPropio);
        return [variante, { capas: propias, ...(o !== undefined && { origen: o }), ...(f !== undefined && { fin: f }) }];
      }),
    );
    return {
      capas,
      ...(origen !== undefined && { origen }),
      ...(fin !== undefined && { fin }),
      variantes,
      tipos: {},
    };
  };
  /** El trazo por color de origen: el declarado o, si no, derivado de la Arista de ese color con `derivar`. */
  const porColor = (nombre: 'lifeline' | 'message', derivar: (declarado: PinturaDeTrazoDeSecuencia | undefined, arista: PinturaDeArista) => PinturaDeTrazoDeSecuencia): TrazosDeSecuencia => {
    const derivado = secuencia[nombre] === undefined;
    const de = (color: string | undefined): PinturaDeTrazoDeSecuencia => derivar(trazo(nombre, color), color === undefined ? pintura.arista : (pintura.arista.origenes[color] ?? pintura.arista));
    return { base: de(undefined), origenes: Object.fromEntries(Object.keys(tema.palette).sort().map((color) => [color, de(color)])), ...(derivado && { derivado: true as const }) };
  };
  const caja = (nombre: 'activation' | 'fragment' | 'note'): PinturaDeCajaDeSecuencia | undefined => {
    const bloque = secuencia[nombre];
    if (bloque === undefined) return undefined;
    const { paleta, contexto } = contextoDeColor(tema, undefined, variable);
    const ubicacion = ESPECIFICACION_DE_SECUENCIA[nombre].capas;
    return {
      capas: pintar(bloque.capas as CapaDeTema[], tema, undefined, variable),
      textos: Object.fromEntries(Object.entries(bloque.textos).map(([clave, texto]) => [clave, primitivaPintada(texto.tipo, resolverProps(texto, paleta, contexto))])),
      variantes: Object.fromEntries(
        Object.entries(bloque.parches).map(([variante, parche]) => [variante, pintar(aplicarOps(bloque.capas as CapaDeTema[], parche.ops, tema.palette, 'parchear', ubicacion).pila, tema, undefined, variable)]),
      ),
      estados: Object.fromEntries(
        (Object.keys(bloque.estados) as Estado[]).sort().map((estado) => {
          const ops = bloque.estados[estado] ?? [];
          const con = (capas: readonly CapaDeTema[]): CapaPintada[] => pintar(aplicarOps(capas, ops, tema.palette, 'parchear', ubicacion).pila, tema, undefined, variable);
          return [estado, { capas: con(bloque.capas as CapaDeTema[]), variantes: Object.fromEntries(Object.entries(bloque.parches).map(([variante, parche]) => [variante, con(aplicarOps(bloque.capas as CapaDeTema[], parche.ops, tema.palette, 'parchear', ubicacion).pila)])) }];
        }),
      ),
    };
  };
  return {
    lifeline: porColor('lifeline', derivacion.lifeline),
    mensaje: porColor('message', derivacion.mensaje),
    activacion: caja('activation') ?? derivacion.activacionDerivada(pintura),
    fragmento: derivacion.fragmento(caja('fragment'), pintura.nodo.capas, pintura.arista, tema.tokens.border),
    nota: derivacion.nota(caja('note'), tema.palette, tema.tokens.border),
  };
}

export function estiloResuelto(tema: Tema, opciones: OpcionesDeEstilo): EstiloResuelto {
  const resuelto = temaParaDiagrama(resolverTema(tema), opciones.diagrama);
  const variable = opciones.colorEnVariable;
  /** Pintura de un elemento en el reposo y en cada estado declarado, para un Tipo (o ninguno) y, en el Grupo, abierto o colapsado. */
  const pinturaDe = (elemento: ElementoDeTema, tipo: string | undefined, color: string | undefined, colapsado = false): PinturaDeNodo => {
    const bloque = resuelto[elemento];
    const sobrio = elemento === 'grupo' && resuelto.grupo.capas.length === 0;
    const pila = (estado?: Estado): CapaPintada[] =>
      sobrio
        ? grupoSobrio(resuelto, colapsado, variable)
        : pintar(
            cascada(resuelto, { ...(tipo !== undefined && { tipo }), ...(estado !== undefined && { estado }), ...(colapsado && { colapsado }), ...(elemento === 'nodo' && opciones.vista && { vista: opciones.vista }) }, elemento),
            resuelto,
            color,
            variable,
          );
    const textos = elemento === 'grupo' && colapsado ? { ...resuelto.nodo.textos, ...resuelto.grupo.colapsado.textos } : bloque.textos;
    const { paleta, contexto } = contextoDeColor(resuelto, color, variable);
    return {
      capas: pila(),
      textos: Object.fromEntries(Object.entries(textos).map(([slot, texto]) => [slot, primitivaPintada(texto.tipo, resolverProps(texto, paleta, contexto))])),
      estados: sobrio ? {} : Object.fromEntries((Object.keys(bloque.estados) as Estado[]).sort().map((estado) => [estado, pila(estado)])),
    };
  };
  /** Pintura del elemento y de cada Tipo con parches (o pedido por quien llama, para dar color a `COLOR`). */
  const elementoDe = (elemento: ElementoDeTema, colapsado = false): PinturaDeElemento => {
    const colores = opciones.tipos ?? {};
    const tipos = [...new Set([...(elemento === 'nodo' ? Object.keys(colores) : []), ...Object.keys(resuelto[elemento].tipos)])];
    return {
      ...pinturaDe(elemento, undefined, undefined, colapsado),
      ...(resuelto[elemento].animacion !== undefined && { animacion: resuelto[elemento].animacion }),
      tipos: Object.fromEntries(tipos.map((tipo) => [tipo, pinturaDe(elemento, tipo, colores[tipo], colapsado)])),
    };
  };
  const tabla = tablaDeMetricas(tema, opciones.diagrama, opciones.medidas);
  const nodo = elementoDe('nodo');
  const grupo = { abierto: elementoDe('grupo'), colapsado: elementoDe('grupo', true) };
  const arista = { ...pintarArista(resuelto, undefined), origenes: Object.fromEntries(Object.keys(resuelto.palette).sort().map((color) => [color, pintarArista(resuelto, color)])) };
  const fila = opciones.diagrama === 'er' ? (pinturaDeFila(resuelto, variable) ?? derivacion.filaDerivada()) : undefined;
  const secuencia = opciones.diagrama === 'sequence' ? pinturaDeSecuencia(resuelto, variable, { nodo, grupo, arista }) : undefined;
  const reserva = resuelto.fonts['fallback'];
  return {
    metricas: tabla.base,
    tabla,
    fuentes: {
      cuerpo: pilaDeFuente(resuelto.fonts.body, reserva),
      mono: pilaDeFuente(resuelto.fonts.mono, reserva),
      caras: resolverFuentes(resuelto.fonts, opciones.archivosDeFuente ?? []).caras,
    },
    pintura: {
      ...(resuelto.tokens.seed !== undefined && { semilla: Number(resuelto.tokens.seed) }),
      nodo,
      grupo,
      pagina: { capas: pintar(resuelto.pagina.capas as CapaDeTema[], resuelto, undefined), fijo: resuelto.pagina.fijo },
      ...(fila !== undefined && { fila }),
      ...(secuencia !== undefined && { secuencia }),
      arista,
    },
  };
}
