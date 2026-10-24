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
import { cascada } from './parches';
import type { CapaDeTema, ElementoDeTema, Estado, OpDeCapa } from './parches';
import { resolverTema } from './tema';
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
  const colorDelTrazo = capas[0]?.props['color'];
  const marcador = (primitiva: { tipo: string; props: Record<string, number | string> } | undefined): PrimitivaPintada | undefined => {
    if (primitiva === undefined) return undefined;
    const props = resolverProps(primitiva, paleta, contexto);
    if (props['color'] === undefined && colorDelTrazo !== undefined) props['color'] = colorDelTrazo;
    return { tipo: primitiva.tipo as NombreDePrimitiva, props };
  };
  const etiqueta = arista.etiqueta ?? { tipo: 'label', props: { scale: 0.85, pad: 4, radius: 0 } };
  const origen = marcador(arista.origen);
  const fin = marcador(arista.fin);
  return {
    capas,
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

export function estiloResuelto(tema: Tema, opciones: OpcionesDeEstilo = {}): EstiloResuelto {
  const resuelto = resolverTema(tema);
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
  const reserva = resuelto.fonts['fallback'];
  return {
    metricas: tablaDeMetricas(tema, opciones.medidas).base,
    tabla: tablaDeMetricas(tema, opciones.medidas),
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
      arista: {
        ...pintarArista(resuelto, undefined),
        origenes: Object.fromEntries(Object.keys(resuelto.palette).sort().map((color) => [color, pintarArista(resuelto, color)])),
      },
    },
  };
}
