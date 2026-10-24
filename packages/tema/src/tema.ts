/**
 * Esquema del Tema ya resuelto (sin herencia) y el Tema neutro del nucleo.
 * `temaResueltoSchema` es estricto: una clave desconocida (p. ej. los viejos
 * `nodeStyles`/`edgeStyles`) se rechaza, y las Capas se validan contra el
 * catalogo con `construirPrimitiva`, de modo que hay una sola fuente de reglas.
 */
import { z } from 'zod';
import type { Tema } from 'canonico';

import { EASINGS, EFECTOS, MOVIMIENTOS, PROPIEDADES_ANIMABLES } from './animacion';
import { DEFINICION_DE_SLOT, SLOTS, construirPrimitiva } from './catalogo';
import type { NombreDeSlot, UbicacionDePrimitiva } from './catalogo';
import { ALINEACIONES, CABECERA_POR_DEFECTO, DIRECCIONES, DISPOSICION_POR_DEFECTO, SLOTS_SOLO_DE_NODO, esCaja } from './disposicion';
import type { CajaDeSlots, ElementoDeSlots } from './disposicion';
import { ESTADOS, aplicarOps, opTocaMetricas, validarOps } from './parches';
import type { CapaDeTema, OpDeCapa } from './parches';

const easingSchema = z.enum(EASINGS);
const tiempoSchema = { duracionMs: z.number().min(1).max(60000), easing: easingSchema, retardoMs: z.number().min(0).max(10000) };

/** Movimiento de catalogo o `keyframes` minimos de una Capa (ver `Animacion`). */
const animacionSchema = z.discriminatedUnion('clase', [
  z.strictObject({
    clase: z.literal('movimiento'),
    movimiento: z.enum(Object.keys(MOVIMIENTOS) as [keyof typeof MOVIMIENTOS, ...Array<keyof typeof MOVIMIENTOS>]),
    intensidad: z.number().min(0).max(1).optional(),
    reducido: z.literal('still'),
    ...tiempoSchema,
  }),
  z.strictObject({
    clase: z.literal('keyframes'),
    propiedad: z.enum(Object.keys(PROPIEDADES_ANIMABLES) as [keyof typeof PROPIEDADES_ANIMABLES, ...Array<keyof typeof PROPIEDADES_ANIMABLES>]),
    pasos: z.array(z.strictObject({ en: z.number().min(0).max(100), valor: z.number() })).min(2),
    reducido: z.literal('still'),
    ...tiempoSchema,
  }),
]);

const transicionSchema = z.strictObject({ duracionMs: tiempoSchema.duracionMs, easing: easingSchema, reducido: z.enum(['fade', 'instant']) });
const efectoSchema = z.strictObject({ efecto: z.enum(EFECTOS), reducido: z.enum(['fade', 'instant']), ...tiempoSchema });

const animacionDeNodoSchema = z.strictObject({
  transicion: transicionSchema.optional(),
  transicionesDeEstado: z.partialRecord(z.enum(ESTADOS), transicionSchema).optional(),
  entrada: efectoSchema.optional(),
  salida: efectoSchema.optional(),
  escalonadoMs: z.number().min(0).max(2000).optional(),
});

const capaSchema = z.strictObject({
  nombre: z.string().min(1),
  primitiva: z.strictObject({
    tipo: z.string().min(1),
    props: z.record(z.string(), z.union([z.string(), z.number()])),
  }),
  /** Sobre el contenido (`over`); sin ella, bajo el contenido. */
  encima: z.literal(true).optional(),
  animacion: animacionSchema.optional(),
});

/** Parche de Capa por nombre (ADR 0008): ver `OpDeCapa`. */
export const opSchema = z.strictObject({
  nombre: z.string().min(1),
  quitar: z.literal(true).optional(),
  primitiva: z.string().min(1).optional(),
  props: z.record(z.string(), z.union([z.string(), z.number()])).default({}),
  antes: z.string().min(1).optional(),
  despues: z.string().min(1).optional(),
  encima: z.literal(true).optional(),
  animacion: animacionSchema.nullable().optional(),
});

const primitivaSchema = z.strictObject({
  tipo: z.string().min(1),
  props: z.record(z.string(), z.union([z.string(), z.number()])),
});

/** Arista (ADR 0008): pila de trazos, marcadores de origen y fin, y etiqueta con modelo de caja. */
const aristaSchema = z.strictObject({
  /** Pila de trazos (Primitivas `line`), de abajo hacia arriba. Vacia: un trazo del color del borde. */
  capas: z.array(capaSchema).default([]),
  origen: primitivaSchema.optional(),
  fin: primitivaSchema.optional(),
  etiqueta: primitivaSchema.optional(),
});

/** Fondo de pagina (ADR 0008): pila de rellenos bajo Grupos, Aristas y Nodos. */
const paginaSchema = z.strictObject({
  /** Pila de rellenos (`solid`, gradientes, patrones, ruido), de abajo hacia arriba. Vacia: solo el color `background`. */
  capas: z.array(capaSchema).default([]),
  /** El patron queda fijo al visor; sin la marca, se mueve y escala con el pan/zoom. */
  fijo: z.boolean().default(false),
});

const NOMBRES_DE_SLOT = SLOTS as [NombreDeSlot, ...NombreDeSlot[]];

/** Mini-layout de Slots: cajas `row`/`column` anidables con Slots en las hojas (ver `disposicion.ts`). */
const elementoSchema: z.ZodType<ElementoDeSlots> = z.lazy(() => z.union([hojaSchema, cajaSchema]));
const hojaSchema = z.strictObject({ slot: z.enum(NOMBRES_DE_SLOT), align: z.enum(ALINEACIONES).optional() });
const cajaSchema: z.ZodType<CajaDeSlots> = z.strictObject({
  direccion: z.enum(DIRECCIONES),
  gap: z.number().min(0).max(64),
  pad: z.number().min(0).max(64),
  align: z.enum(ALINEACIONES).optional(),
  hijos: z.array(elementoSchema),
}) as z.ZodType<CajaDeSlots>;

const nodoSchema = z.strictObject({
  /** Pila de Capas, de abajo hacia arriba. */
  capas: z.array(capaSchema).default([]),
  /** Mini-layout de los Slots: el orden del arbol es el orden visual; un Slot que no esta no se pinta. */
  slots: cajaSchema.default(DISPOSICION_POR_DEFECTO),
  /** Estilo de los Slots que lo declaran: `text` para los de texto, `icon` para el icono. */
  textos: z.partialRecord(z.enum(NOMBRES_DE_SLOT), primitivaSchema).default({}),
  /** Parches por Tipo de nodo, en orden de aplicacion sobre la pila base. */
  tipos: z.record(z.string(), z.array(opSchema)).default({}),
  /** Parches por estado, aplicados sobre la pila base ya parcheada por Tipo. */
  estados: z.partialRecord(z.enum(ESTADOS), z.array(opSchema)).default({}),
  /** `transition`, `enter`, `exit` y `stagger` del Nodo; solo pintura. */
  animacion: animacionDeNodoSchema.optional(),
});

const relleno = z.number().min(0).max(128);

/**
 * Grupo (ADR 0008): misma pila de Capas, parches por Tipo y por estado que el Nodo, mas la cabecera (un
 * mini-layout de Slots), el padding de la zona de hijos y `colapsado`, el parche de estado con el que el Grupo
 * cerrado se comporta como un Nodo hoja. Sin Capas, el Estilo resuelto da un Grupo sobrio de la Paleta.
 */
const grupoSchema = z.strictObject({
  capas: z.array(capaSchema).default([]),
  /** Cabecera del Grupo abierto; el orden del arbol es el orden visual. */
  slots: cajaSchema.default(CABECERA_POR_DEFECTO),
  textos: z.partialRecord(z.enum(NOMBRES_DE_SLOT), primitivaSchema).default({}),
  /** Margen interior de la zona de hijos, bajo la cabecera. */
  padding: z.strictObject({ top: relleno, left: relleno, bottom: relleno, right: relleno }).default({ top: 8, left: 16, bottom: 16, right: 16 }),
  tipos: z.record(z.string(), z.array(opSchema)).default({}),
  estados: z.partialRecord(z.enum(ESTADOS), z.array(opSchema)).default({}),
  /** Grupo cerrado: parches de Capa y, si el Tema lo pide, otros Slots y estilos (puede cambiar la caja). */
  colapsado: z
    .strictObject({
      ops: z.array(opSchema).default([]),
      slots: cajaSchema.optional(),
      textos: z.partialRecord(z.enum(NOMBRES_DE_SLOT), primitivaSchema).optional(),
    })
    .default({ ops: [] }),
  animacion: animacionDeNodoSchema.optional(),
});

/** Grupo por defecto: sin Capas (el Estilo resuelto pone las suyas), cabecera de icono y titulo. */
export const GRUPO_POR_DEFECTO: z.output<typeof grupoSchema> = {
  capas: [],
  slots: CABECERA_POR_DEFECTO,
  textos: {},
  padding: { top: 8, left: 16, bottom: 16, right: 16 },
  tipos: {},
  estados: {},
  colapsado: { ops: [] },
};

export const temaResueltoSchema = z
  .strictObject({
    name: z.string().min(1),
    palette: z.record(z.string(), z.string()).default({}),
    fonts: z.object({ body: z.string().min(1), mono: z.string().min(1) }).catchall(z.string()),
    tokens: z
      .object({
        background: z.string().min(1),
        foreground: z.string().min(1),
        border: z.string().min(1),
      })
      .catchall(z.string())
      .superRefine((tokens, ctx) => {
        if (tokens.fontSize !== undefined && !/^\d+(\.\d+)?px$/.test(tokens.fontSize)) {
          ctx.addIssue({ code: 'custom', path: ['fontSize'], message: 'debe ser un tamano en px, p. ej. "14px"' });
        }
        if (tokens.seed !== undefined && !/^\d+$/.test(tokens.seed)) {
          ctx.addIssue({ code: 'custom', path: ['seed'], message: '`seed` debe ser un entero no negativo, p. ej. 7' });
        }
      }),
    nodo: nodoSchema.default({ capas: [], slots: DISPOSICION_POR_DEFECTO, textos: {}, tipos: {}, estados: {} }),
    grupo: grupoSchema.default(GRUPO_POR_DEFECTO),
    arista: aristaSchema.default({ capas: [] }),
    pagina: paginaSchema.default({ capas: [], fijo: false }),
  })
  .superRefine((tema, ctx) => {
    const validar = (primitiva: { tipo: string; props: Record<string, string | number> }, ubicacion: UbicacionDePrimitiva, path: Array<string | number>): void => {
      const props = Object.entries(primitiva.props).map(([clave, valor]) => ({ clave, valor }));
      for (const error of construirPrimitiva(primitiva.tipo, props, tema.palette, ubicacion).errores) {
        ctx.addIssue({ code: 'custom', path: [...path, ...(error.clave === undefined ? [] : ['props', error.clave])], message: error.mensaje });
      }
    };
    const rellenos = new Set<string>();
    tema.pagina.capas.forEach((capa, i) => {
      if (rellenos.has(capa.nombre)) ctx.addIssue({ code: 'custom', path: ['pagina', 'capas', i, 'nombre'], message: `Capa '${capa.nombre}' repetida` });
      rellenos.add(capa.nombre);
      validar(capa.primitiva, 'capa-pagina', ['pagina', 'capas', i, 'primitiva']);
    });
    const trazos = new Set<string>();
    tema.arista.capas.forEach((capa, i) => {
      if (trazos.has(capa.nombre)) ctx.addIssue({ code: 'custom', path: ['arista', 'capas', i, 'nombre'], message: `Capa '${capa.nombre}' repetida` });
      trazos.add(capa.nombre);
      validar(capa.primitiva, 'capa-arista', ['arista', 'capas', i, 'primitiva']);
    });
    if (tema.arista.origen !== undefined) validar(tema.arista.origen, 'marcador', ['arista', 'origen']);
    if (tema.arista.fin !== undefined) validar(tema.arista.fin, 'marcador', ['arista', 'fin']);
    if (tema.arista.etiqueta !== undefined) validar(tema.arista.etiqueta, 'etiqueta', ['arista', 'etiqueta']);
    validarElemento(ctx, tema, 'nodo');
    validarElemento(ctx, tema, 'grupo');
  });

type Elemento = 'nodo' | 'grupo';

/**
 * Valida la pila, los Slots, los estilos de texto y los parches por Tipo y por estado de un elemento
 * (Nodo o Grupo) contra el catalogo: una sola ruta de reglas para los dos. Un parche de estado no puede
 * tocar las Metricas; en el Grupo tampoco uno de Tipo (su tabla no tiene entrada por Tipo). Solo el
 * `colapsado` del Grupo, que es una caja hoja, puede cambiarlas.
 */
function validarElemento(ctx: z.RefinementCtx, tema: TemaResuelto, elemento: Elemento): void {
  const bloque = tema[elemento];
  const falla = (path: Array<string | number>, message: string): void => ctx.addIssue({ code: 'custom', path: [elemento, ...path], message });
  const vistas = new Set<string>();
  bloque.capas.forEach((capa, i) => {
    if (vistas.has(capa.nombre)) falla(['capas', i, 'nombre'], `Capa '${capa.nombre}' repetida`);
    vistas.add(capa.nombre);
    const { errores } = construirPrimitiva(
      capa.primitiva.tipo,
      Object.entries(capa.primitiva.props).map(([clave, valor]) => ({ clave, valor })),
      tema.palette,
    );
    for (const error of errores) falla(['capas', i, 'primitiva', ...(error.clave === undefined ? [] : ['props', error.clave])], error.mensaje);
  });
  /** Cada arbol de Slots (la cabecera, el del colapsado) repite un Slot por separado. */
  const recorrer = (caja: CajaDeSlots, ruta: string, enArbol = new Set<string>()): void => {
    for (const hijo of caja.hijos) {
      if (esCaja(hijo)) recorrer(hijo, ruta, enArbol);
      else if (enArbol.has(hijo.slot)) falla([ruta], `Slot '${hijo.slot}' repetido`);
      else if (elemento === 'grupo' && SLOTS_SOLO_DE_NODO.includes(hijo.slot)) falla([ruta], `el Slot '${hijo.slot}' no vale en un Grupo: solo en un Nodo hoja`);
      else enArbol.add(hijo.slot);
    }
  };
  recorrer(bloque.slots, 'slots');
  const estiloDeSlot = (textos: Partial<Record<NombreDeSlot, { tipo: string; props: Record<string, string | number> }>>, ruta: Array<string | number>): void => {
    for (const [slot, texto] of Object.entries(textos)) {
      const props = Object.entries(texto.props).map(([clave, valor]) => ({ clave, valor }));
      for (const error of construirPrimitiva(texto.tipo, props, tema.palette, 'texto-slot').errores) falla([...ruta, slot, ...(error.clave === undefined ? [] : ['props', error.clave])], error.mensaje);
      const esperado = DEFINICION_DE_SLOT[slot as NombreDeSlot].estilo;
      if (texto.tipo !== esperado) falla([...ruta, slot], `el Slot '${slot}' se estiliza con la Primitiva '${esperado}', no '${texto.tipo}'`);
    }
  };
  estiloDeSlot(bloque.textos, ['textos']);

  const base = bloque.capas as CapaDeTema[];
  const pilas = [base];
  const sinMetricas = (ops: readonly OpDeCapa[], candidatas: ReadonlyArray<readonly CapaDeTema[]>, ruta: Array<string | number>, que: string): void => {
    ops.forEach((op, indice) => {
      const razon = opTocaMetricas(op, candidatas);
      if (razon !== undefined) falla([...ruta, indice], `un parche ${que} no puede tocar las Metricas: ${razon}${que === 'de estado' ? '; hover nunca relayouta' : ''}`);
    });
  };
  for (const [tipo, ops] of Object.entries(bloque.tipos)) {
    for (const e of validarOps([base], ops, tema.palette, 'parchear')) falla(['tipos', tipo, e.indice], e.mensaje);
    if (elemento === 'grupo') sinMetricas(ops, [base], ['tipos', tipo], 'de Tipo');
    pilas.push(aplicarSinErrores(base, ops, tema.palette));
  }
  if (elemento === 'grupo') {
    const colapsado = (bloque as z.output<typeof grupoSchema>).colapsado;
    for (const e of validarOps(pilas, colapsado.ops, tema.palette, 'parchear')) falla(['colapsado', 'ops', e.indice], e.mensaje);
    if (colapsado.textos !== undefined) estiloDeSlot(colapsado.textos, ['colapsado', 'textos']);
    if (colapsado.slots !== undefined) recorrer(colapsado.slots, 'colapsado');
    pilas.push(...pilas.map((pila) => aplicarSinErrores(pila, colapsado.ops, tema.palette)));
  }
  for (const [estado, ops] of Object.entries(bloque.estados)) {
    for (const e of validarOps(pilas, ops, tema.palette, 'parchear')) falla(['estados', estado, e.indice], e.mensaje);
    sinMetricas(ops, pilas, ['estados', estado], 'de estado');
  }
}

const aplicarSinErrores = (base: CapaDeTema[], ops: Parameters<typeof aplicarOps>[1], paleta: Record<string, string>): CapaDeTema[] =>
  aplicarOps(base, ops, paleta, 'parchear').pila;

export type TemaResuelto = z.output<typeof temaResueltoSchema>;

/** Tema por defecto del nucleo: siempre disponible, otros Temas pueden extenderlo. */
export const TEMA_NEUTRO: TemaResuelto = {
  name: 'neutral',
  palette: {
    gray: '#6b7280',
    blue: '#2563eb',
    green: '#16a34a',
    amber: '#d97706',
    red: '#dc2626',
    purple: '#7c3aed',
  },
  fonts: { body: 'sans-serif', mono: 'monospace' },
  tokens: { background: '#ffffff', foreground: '#1f2937', border: '#9ca3af' },
  nodo: { capas: [], slots: DISPOSICION_POR_DEFECTO, textos: {}, tipos: {}, estados: {} },
  grupo: GRUPO_POR_DEFECTO,
  arista: { capas: [], fin: { tipo: 'arrow', props: { size: 8 } } },
  pagina: { capas: [], fijo: false },
};

/** Parches de Capa guardados en la Fuente (p. ej. el override de una Vista), validados contra su esquema. */
export const leerOps = (datos: unknown): OpDeCapa[] => z.array(opSchema).parse(datos);

const memo = new WeakMap<object, TemaResuelto>();

/**
 * Tema ya resuelto de la Fuente (`Tema` de `canonico` es solo el sobre) validado
 * contra el esquema estricto. Lanza con la ruta de cada fallo si no lo cumple:
 * `dsl` entrega Temas validos, esto defiende al dibujo de uno ajeno.
 */
export function resolverTema(tema: Tema): TemaResuelto {
  const hecho = memo.get(tema);
  if (hecho !== undefined) return hecho;
  const leido = temaResueltoSchema.safeParse(tema);
  if (!leido.success) {
    const detalle = leido.error.issues.map((i) => `${i.path.join('.')}: ${i.message}`).join('; ');
    throw new Error(`El Tema '${tema.name}' no cumple el contrato: ${detalle}`);
  }
  memo.set(tema, leido.data);
  return leido.data;
}

export type { NombreDeSlot };
