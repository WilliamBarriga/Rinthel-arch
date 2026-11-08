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
 * y el estilo de los textos `name`, `type` y `key`. Solo existe en el Estilo de una Vista ER cuyo Tema declara `row`.
 */
export interface PinturaDeFila {
  base: CapaPintada[];
  variantes: Record<string, CapaPintada[]>;
  textos: Partial<Record<TextoDeFila, PrimitivaPintada>>;
}

/** Pila de Capas de una fila: la de su variante si el Tema la parchea, si no la base. */
export const pilaDeFila = (fila: PinturaDeFila, variante: VarianteDeFila): CapaPintada[] => fila.variantes[claveDeFila(variante)] ?? fila.base;

/** Trazo de un elemento de secuencia (`lifeline`, `message`): pila de trazos, marcadores, etiqueta y la pila de cada variante (`kind`) que el Tema parchea. */
export interface PinturaDeTrazoDeSecuencia {
  capas: CapaPintada[];
  origen?: PrimitivaPintada;
  fin?: PrimitivaPintada;
  /** Variantes con parche propio (tipo de Mensaje); la que falta se deriva del base. */
  variantes: Record<string, { capas: CapaPintada[]; origen?: PrimitivaPintada; fin?: PrimitivaPintada }>;
}

/** Elemento de secuencia con Capas de Nodo (`activation`, `fragment`, `note`): su pila, el estilo de sus textos y la pila de cada variante (`op`). */
export interface PinturaDeCajaDeSecuencia {
  capas: CapaPintada[];
  textos: Record<string, PrimitivaPintada>;
  variantes: Record<string, CapaPintada[]>;
}

/**
 * Pintura de los elementos de secuencia que el Tema declara (ADR 0009); lo que no declara se deriva en `render` de
 * `edge` y `node`. Lifeline y Mensaje van por color de Paleta del Nodo de origen (`ORIGEN`), como la Arista.
 */
export interface PinturaDeSecuencia {
  lifeline?: { base: PinturaDeTrazoDeSecuencia; origenes: Record<string, PinturaDeTrazoDeSecuencia> };
  mensaje?: { base: PinturaDeTrazoDeSecuencia; origenes: Record<string, PinturaDeTrazoDeSecuencia> };
  activacion?: PinturaDeCajaDeSecuencia;
  fragmento?: PinturaDeCajaDeSecuencia;
  nota?: PinturaDeCajaDeSecuencia;
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
  /** Fila de las tablas ER; solo en una Vista ER cuyo Tema declara `row`. */
  fila?: PinturaDeFila;
  /** Elementos de secuencia declarados por el Tema; solo en una Vista de secuencia. */
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
  diagrama?: TipoDeDiagrama;
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
    tipo: primitiva.tipo as NombreDePrimitiva,
    props: resolverProps(primitiva, paleta, contexto),
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
    return { tipo: primitiva.tipo as NombreDePrimitiva, props };
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
    etiqueta: { tipo: etiqueta.tipo as NombreDePrimitiva, props: resolverProps(etiqueta, paleta, contexto) },
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
  const pila = (v: VarianteDeFila): CapaPintada[] => {
    const ops: ReadonlyArray<readonly OpDeCapa[]> = [v.impar ? fila.alterna : [], ...CLAVES_DE_FILA.filter((k) => v.keys.includes(k)).map((k) => fila.claves[k] ?? []), v.opcional ? fila.opcional : []];
    const capas = ops.reduce<CapaDeTema[]>((acc, parche) => (parche.length === 0 ? acc : aplicarOps(acc, parche, tema.palette, 'parchear').pila), fila.capas as CapaDeTema[]);
    return pintar(capas, tema, undefined, variable);
  };
  const base = pila({ impar: false, keys: [], opcional: false });
  const variantes: Record<string, CapaPintada[]> = {};
  for (const v of variantesDeFila()) {
    const propia = pila(v);
    if (JSON.stringify(propia) !== JSON.stringify(base)) variantes[claveDeFila(v)] = propia;
  }
  const { paleta, contexto } = contextoDeColor(tema, undefined, variable);
  const textos = Object.fromEntries(Object.entries(fila.textos).map(([nombre, texto]) => [nombre, { tipo: texto.tipo as NombreDePrimitiva, props: resolverProps(texto, paleta, contexto) }]));
  return { base, variantes, textos };
}

/** Pintura de los bloques de secuencia que el Tema declara. `variable` da el color del Nodo a `COLOR` en los bloques de caja. */
function pinturaDeSecuencia(tema: TemaResuelto, variable: string | undefined): PinturaDeSecuencia | undefined {
  const { secuencia } = tema;
  if (secuencia === undefined) return undefined;
  const marcador = (primitiva: { tipo: string; props: Record<string, number | string> } | undefined, paleta: Record<string, string>, contexto: ContextoDeColor, color: unknown): PrimitivaPintada | undefined => {
    if (primitiva === undefined) return undefined;
    const props = resolverProps(primitiva, paleta, contexto);
    if (props['color'] === undefined && color !== undefined) props['color'] = color as string;
    return { tipo: primitiva.tipo as NombreDePrimitiva, props };
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
    };
  };
  const porColor = (nombre: 'lifeline' | 'message'): { base: PinturaDeTrazoDeSecuencia; origenes: Record<string, PinturaDeTrazoDeSecuencia> } | undefined => {
    const base = trazo(nombre, undefined);
    if (base === undefined) return undefined;
    return { base, origenes: Object.fromEntries(Object.keys(tema.palette).sort().map((color) => [color, trazo(nombre, color)!])) };
  };
  const caja = (nombre: 'activation' | 'fragment' | 'note'): PinturaDeCajaDeSecuencia | undefined => {
    const bloque = secuencia[nombre];
    if (bloque === undefined) return undefined;
    const { paleta, contexto } = contextoDeColor(tema, undefined, variable);
    const ubicacion = ESPECIFICACION_DE_SECUENCIA[nombre].capas;
    return {
      capas: pintar(bloque.capas as CapaDeTema[], tema, undefined, variable),
      textos: Object.fromEntries(Object.entries(bloque.textos).map(([clave, texto]) => [clave, { tipo: texto.tipo as NombreDePrimitiva, props: resolverProps(texto, paleta, contexto) }])),
      variantes: Object.fromEntries(
        Object.entries(bloque.parches).map(([variante, parche]) => [variante, pintar(aplicarOps(bloque.capas as CapaDeTema[], parche.ops, tema.palette, 'parchear', ubicacion).pila, tema, undefined, variable)]),
      ),
    };
  };
  const lifeline = porColor('lifeline');
  const mensaje = porColor('message');
  const activacion = caja('activation');
  const fragmento = caja('fragment');
  const nota = caja('note');
  return {
    ...(lifeline !== undefined && { lifeline }),
    ...(mensaje !== undefined && { mensaje }),
    ...(activacion !== undefined && { activacion }),
    ...(fragmento !== undefined && { fragmento }),
    ...(nota !== undefined && { nota }),
  };
}

export function estiloResuelto(tema: Tema, opciones: OpcionesDeEstilo = {}): EstiloResuelto {
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
      textos: Object.fromEntries(Object.entries(textos).map(([slot, texto]) => [slot, { tipo: texto.tipo as NombreDePrimitiva, props: resolverProps(texto, paleta, contexto) }])),
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
  const tabla = tablaDeMetricas(tema, opciones.medidas, opciones.diagrama);
  const fila = opciones.diagrama === 'er' ? pinturaDeFila(resuelto, variable) : undefined;
  const secuencia = opciones.diagrama === 'sequence' ? pinturaDeSecuencia(resuelto, variable) : undefined;
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
      nodo: elementoDe('nodo'),
      grupo: { abierto: elementoDe('grupo'), colapsado: elementoDe('grupo', true) },
      pagina: { capas: pintar(resuelto.pagina.capas as CapaDeTema[], resuelto, undefined), fijo: resuelto.pagina.fijo },
      ...(fila !== undefined && { fila }),
      ...(secuencia !== undefined && { secuencia }),
      arista: {
        ...pintarArista(resuelto, undefined),
        origenes: Object.fromEntries(Object.keys(resuelto.palette).sort().map((color) => [color, pintarArista(resuelto, color)])),
      },
    },
  };
}
