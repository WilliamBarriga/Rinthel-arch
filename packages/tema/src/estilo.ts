/** Estilo resuelto: Metricas (lo que mide `layout`) y pintura (colores ya como valor), separadas para que cambiar solo la pintura no relayoutee. */
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

export interface CapaPintada {
  nombre: string;
  tipo: NombreDePrimitiva;
  props: Record<string, number | string>;
  /** `over`; sin la clave, bajo el contenido. */
  encima?: true;
  animacion?: Animacion;
}

export interface PrimitivaPintada {
  tipo: NombreDePrimitiva;
  props: Record<string, number | string>;
}

/** Unico estrechamiento de `tipo` a `NombreDePrimitiva` (el Tema ya lo valido); usarlo en vez de casts propios. */
export const primitivaPintada = (tipo: string, props: Record<string, number | string>): PrimitivaPintada => ({ tipo: tipo as NombreDePrimitiva, props });

/** Trazos de abajo hacia arriba. */
export interface PinturaDeArista {
  capas: CapaPintada[];
  /** Aristas identificantes de una Vista ER; ausente, los de `capas`. */
  identificante?: CapaPintada[];
  origen?: PrimitivaPintada;
  fin?: PrimitivaPintada;
  etiqueta: PrimitivaPintada;
  /** Only the states the Theme declares: the stroke stack (and the identifying one) with the state patch. Paint-only. */
  estadosDeArista?: Partial<Record<Estado, { capas: CapaPintada[]; identificante?: CapaPintada[] }>>;
}

/** `capas` es el reposo; cada estado declarado trae su pila completa. */
export interface PinturaDeNodo {
  capas: CapaPintada[];
  textos: Partial<Record<NombreDeSlot, PrimitivaPintada>>;
  estados: Partial<Record<Estado, CapaPintada[]>>;
  /** Del elemento, no de una Capa; ausente si el Tema no declara ninguna. */
  animacion?: AnimacionDeNodo;
}

export interface AnimacionDeNodo {
  transicion?: Transicion;
  transicionesDeEstado?: Partial<Record<Estado, Transicion>>;
  entrada?: Efecto;
  salida?: Efecto;
  escalonadoMs?: number;
}

/** Rellenos de abajo hacia arriba; sin Capas, solo el color `background` del Tema. */
export interface PinturaDePagina {
  capas: CapaPintada[];
  fijo: boolean;
}

export interface PinturaDeElemento extends PinturaDeNodo {
  tipos: Record<string, PinturaDeNodo>;
}

/** Variantes por `claveDeFila`, solo las que difieren de la base. Existe en toda Vista ER. */
export interface PinturaDeFila {
  base: CapaPintada[];
  variantes: Record<string, CapaPintada[]>;
  /** Por `claveDeFila(variante)@estado`; la que falta se pinta como en reposo. */
  estados: Record<string, CapaPintada[]>;
  textos: Partial<Record<TextoDeFila, PrimitivaPintada>>;
  /** El Tema no declara `row`. */
  derivado?: true;
}

/** La de su variante si el Tema la parchea; si no, la base. */
export const pilaDeFila = (fila: PinturaDeFila, variante: VarianteDeFila, estado?: Estado): CapaPintada[] =>
  (estado === undefined ? undefined : fila.estados[`${claveDeFila(variante)}@${estado}`]) ?? fila.variantes[claveDeFila(variante)] ?? fila.base;

export interface PinturaDeTrazoDeSecuencia {
  capas: CapaPintada[];
  origen?: PrimitivaPintada;
  /** En `lifeline`, el marcador de una Lifeline destruida. */
  fin?: PrimitivaPintada;
  variantes: Record<string, TrazoDeVariante>;
  /** En `message`, la pila de cada tipo de Mensaje (parche `kind` o derivada); vacio en `lifeline`. */
  tipos: Record<string, TrazoDeVariante>;
  /** Declared states: the base stack and each `kind` patch with the state patch over it. */
  estadosDeTrazo?: Partial<Record<Estado, { capas: CapaPintada[]; variantes: Record<string, CapaPintada[]> }>>;
}

export interface TrazoDeVariante {
  capas: CapaPintada[];
  origen?: PrimitivaPintada;
  fin?: PrimitivaPintada;
  /** Only the states the Theme declares: this stroke stack with the state patch. Paint-only. */
  estados?: Partial<Record<Estado, CapaPintada[]>>;
}

export interface PinturaDeCajaDeSecuencia {
  capas: CapaPintada[];
  textos: Record<string, PrimitivaPintada>;
  variantes: Record<string, CapaPintada[]>;
  /** Solo los estados que el Tema declara, con el parche de estado sobre la base y sobre cada variante. */
  estados: Partial<Record<Estado, { capas: CapaPintada[]; variantes: Record<string, CapaPintada[]> }>>;
  /** El Tema no declara el bloque. */
  derivado?: true;
}

/** Por color de Paleta del Nodo de origen (`ORIGIN`), como la Arista. */
export interface TrazosDeSecuencia {
  base: PinturaDeTrazoDeSecuencia;
  origenes: Record<string, PinturaDeTrazoDeSecuencia>;
  derivado?: true;
}

export interface PinturaDeActivacion extends PinturaDeCajaDeSecuencia {
  /** Solo si es derivada. */
  porNodo?: Pick<Pintura, 'nodo' | 'grupo'>;
}

export interface PinturaDeFragmento extends PinturaDeCajaDeSecuencia {
  colorDeGuarda: string;
}

export interface PinturaDeNota extends PinturaDeCajaDeSecuencia {
  papel: { color: string; opacidadDeRelleno: number };
}

/** Declarados o derivados de `edge` y `node` (con `derivado`). */
export interface PinturaDeSecuencia {
  lifeline: TrazosDeSecuencia;
  mensaje: TrazosDeSecuencia;
  activacion: PinturaDeActivacion;
  fragmento: PinturaDeFragmento;
  nota: PinturaDeNota;
}

export interface Pintura {
  /** Token `seed`; sin el, la semilla de cada Capa sale solo del id y del nombre. */
  semilla?: number;
  /** Incluye cada Tipo de nodo con parches o pedido en `OpcionesDeEstilo.tipos`. */
  nodo: PinturaDeElemento;
  /** Sin `group` en el Tema, la pila sobria derivada de sus tokens. */
  grupo: { abierto: PinturaDeElemento; colapsado: PinturaDeElemento };
  /** `origenes`: por color de Paleta del Nodo de origen (`ORIGIN`). */
  arista: PinturaDeArista & { origenes: Record<string, PinturaDeArista> };
  pagina: PinturaDePagina;
  /** Solo en una Vista ER. */
  fila?: PinturaDeFila;
  /** Solo en una Vista de secuencia. */
  secuencia?: PinturaDeSecuencia;
}

export interface FuentesResueltas {
  cuerpo: string;
  mono: string;
  caras: CaraDeFuente[];
}

export interface EstiloResuelto {
  /** Entrada base de la tabla (Nodo sin Tipo). */
  metricas: Metricas;
  tabla: TablaDeMetricas;
  pintura: Pintura;
  fuentes: FuentesResueltas;
}

export interface OpcionesDeEstilo {
  /** Aplica los parches `diagram <tipo>`; `undefined` (explicito) sin Vista: el Tema sin esos parches. */
  diagrama: TipoDeDiagrama | undefined;
  /** Las mismas con que se calculo la Geometria, para que las Metricas del dibujo sean las del layout. */
  medidas?: MedidasDeTexto;
  /** Sin ellas, `fuentes.caras` queda vacio. */
  archivosDeFuente?: readonly string[];
  /** Nombre de Paleta del `color` de cada Tipo de nodo. */
  tipos?: Readonly<Record<string, string | undefined>>;
  /** Override de la Vista, aplicado al final de cada pila del Nodo. */
  vista?: readonly OpDeCapa[];
  /** Variable CSS (p. ej. `--trazo`) a la que se resuelve `COLOR`; sin ella, el color de `tipos` o el borde del Tema. */
  colorEnVariable?: string;
}

const COLOR_DE_RESPALDO = '__borde';

const contextoDeColor = (tema: TemaResuelto, colorDelTipo: string | undefined, variable?: string): { paleta: Record<string, string>; contexto: ContextoDeColor } => {
  const nombre = colorDelTipo !== undefined && Object.hasOwn(tema.palette, colorDelTipo) ? colorDelTipo : COLOR_DE_RESPALDO;
  return { paleta: { ...tema.palette, [COLOR_DE_RESPALDO]: tema.tokens.border }, contexto: { color: nombre, origen: nombre, ...(variable !== undefined && { variable }) } };
};

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

const TRAZO_POR_DEFECTO: CapaDeTema = { nombre: 'line', primitiva: { tipo: 'line', props: { color: COLOR_DE_RESPALDO, width: 1, style: 'solid', corner: 'sharp', cut: 6 } } };

/** `colorDeOrigen` es nombre de Paleta. */
function pintarArista(tema: TemaResuelto, colorDeOrigen: string | undefined): PinturaDeArista {
  const { arista } = tema;
  const { paleta, contexto } = contextoDeColor(tema, colorDeOrigen);
  const capas = pintar(arista.capas.length === 0 ? [TRAZO_POR_DEFECTO] : (arista.capas as CapaDeTema[]), tema, colorDeOrigen);
  // El marcador sin color toma el del trazo de arriba de la pila, no el del halo de debajo.
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
  const base = arista.capas.length === 0 ? [TRAZO_POR_DEFECTO] : (arista.capas as CapaDeTema[]);
  const conEstado = (ops: readonly OpDeCapa[]) => {
    const pila = aplicarOps(base, ops, tema.palette, 'parchear', 'capa-arista').pila;
    const propia = arista.identificante === undefined ? undefined : pintar(aplicarOps(aplicarOps(base, arista.identificante, tema.palette, 'parchear', 'capa-arista').pila, ops, tema.palette, 'parchear', 'capa-arista').pila, tema, colorDeOrigen);
    return { capas: pintar(pila, tema, colorDeOrigen), ...(propia !== undefined && { identificante: propia }) };
  };
  const declarados = Object.keys(arista.estados ?? {}).sort() as Estado[];
  const estados = declarados.length === 0 ? undefined : Object.fromEntries(declarados.map((estado) => [estado, conEstado(arista.estados?.[estado] ?? [])]));
  return {
    capas,
    ...(estados !== undefined && { estadosDeArista: estados }),
    ...(identificante !== undefined && { identificante }),
    ...(origen !== undefined && { origen }),
    ...(fin !== undefined && { fin }),
    etiqueta: primitivaPintada(etiqueta.tipo, resolverProps(etiqueta, paleta, contexto)),
  };
}

/** Grupo sin Capas en el Tema: derivado solo de los tokens, nunca de las Capas del Nodo. */
function grupoSobrio(tema: TemaResuelto, colapsado: boolean, variable: string | undefined): CapaPintada[] {
  const { foreground, border } = tema.tokens;
  const velo = `color-mix(in srgb, ${foreground} ${colapsado ? 8 : 4}%, transparent)`;
  return [
    { nombre: 'box', tipo: 'rect', props: { radius: 8 } },
    { nombre: 'fill', tipo: 'solid', props: { color: velo } },
    { nombre: 'border', tipo: colapsado ? 'dashed' : 'border', props: { color: variable === undefined ? border : `var(${variable})`, width: 1 } },
  ];
}

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
    const declarados = (Object.keys(bloque.estados) as Estado[]).filter((e) => (bloque.estados[e]?.length ?? 0) > 0).sort();
    const conEstado = (capasBase: readonly CapaDeTema[], ops: readonly OpDeCapa[]): CapaPintada[] => pintar(aplicarOps(capasBase, ops, tema.palette, 'parchear', ubicacion).pila, tema, colorDeOrigen);
    const baseDeEstado = bloque.capas.length === 0 ? [TRAZO_POR_DEFECTO] : (bloque.capas as CapaDeTema[]);
    const estadosDeTrazo = Object.fromEntries(
      declarados.map((estado) => {
        const ops = bloque.estados[estado] ?? [];
        const deVariante = (parche: { ops: readonly OpDeCapa[] }): CapaPintada[] => conEstado(aplicarOps(baseDeEstado, parche.ops, tema.palette, 'parchear', ubicacion).pila, ops);
        return [estado, { capas: conEstado(baseDeEstado, ops), variantes: Object.fromEntries(Object.entries(bloque.parches).map(([variante, parche]) => [variante, deVariante(parche)])) }];
      }),
    );
    return {
      capas,
      ...(origen !== undefined && { origen }),
      ...(fin !== undefined && { fin }),
      variantes,
      tipos: {},
      ...(declarados.length > 0 && { estadosDeTrazo }),
    };
  };
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
