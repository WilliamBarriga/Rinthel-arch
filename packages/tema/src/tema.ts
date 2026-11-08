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
import type { NombreDePrimitiva, NombreDeSlot, Primitiva, UbicacionDePrimitiva } from './catalogo';
import { ALINEACIONES, CABECERA_POR_DEFECTO, DIRECCIONES, DISPOSICION_POR_DEFECTO, SLOTS_SOLO_DE_NODO, esCaja } from './disposicion';
import type { CajaDeSlots, ElementoDeSlots } from './disposicion';
import { BLOQUES_DE_SECUENCIA, ESPECIFICACION_DE_SECUENCIA } from './secuencia';
import { ALTO_DE_FILA, CLAVES_DE_FILA, NOMBRES_DE_TEXTO_DE_FILA, TEXTOS_DE_FILA } from './fila';
import { ESTADOS, TIPOS_DE_DIAGRAMA, aplicarOps, opTocaMetricas, validarOps } from './parches';
import type { CapaDeTema, OpDeCapa, TipoDeDiagrama } from './parches';

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

/** Una Primitiva suelta; el nombre se comprueba contra el catalogo en `resolverTema`, aqui solo que sea texto no vacio. */
const primitivaSchema = z.strictObject({
  tipo: z.custom<NombreDePrimitiva>((valor) => typeof valor === 'string' && valor.length > 0),
  props: z.record(z.string(), z.union([z.string(), z.number()])),
});

/** Arista (ADR 0008): pila de trazos, marcadores de origen y fin, y etiqueta con modelo de caja. */
const aristaSchema = z.strictObject({
  /** Pila de trazos (Primitivas `line`), de abajo hacia arriba. Vacia: un trazo del color del borde. */
  capas: z.array(capaSchema).default([]),
  origen: primitivaSchema.optional(),
  fin: primitivaSchema.optional(),
  etiqueta: primitivaSchema.optional(),
  /** Parche de trazo de las Aristas identificantes de una Vista ER (ADR 0009); ausente = el mismo trazo que las demas. */
  identificante: z.array(opSchema).optional(),
  /** Parches por Tipo de diagrama (ADR 0009): parches de trazo y marcadores o etiqueta que sustituyen a los del Tema. */
  diagramas: z
    .partialRecord(
      z.enum(TIPOS_DE_DIAGRAMA),
      z.strictObject({ ops: z.array(opSchema).default([]), origen: primitivaSchema.optional(), fin: primitivaSchema.optional(), etiqueta: primitivaSchema.optional() }),
    )
    .optional(),
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
  padY: z.number().min(0).max(64).optional(),
  anchoMinimo: z.number().min(0).max(1200).optional(),
  altoMinimo: z.number().min(0).max(600).optional(),
  holgura: z.number().min(0).max(400).optional(),
  align: z.enum(ALINEACIONES).optional(),
  hijos: z.array(elementoSchema),
}) as z.ZodType<CajaDeSlots>;

/** Parche de un Tipo de diagrama (ADR 0009): parches de Capa y, si el Tema lo pide, otra disposicion de Slots. A diferencia de un estado, puede cambiar las Metricas. */
const parcheDeDiagramaSchema = z.strictObject({ ops: z.array(opSchema).default([]), slots: cajaSchema.optional() });

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
  /** Parches por Tipo de diagrama, aplicados sobre la pila base antes que los de Tipo de nodo (ADR 0009). */
  diagramas: z.partialRecord(z.enum(TIPOS_DE_DIAGRAMA), parcheDeDiagramaSchema).optional(),
  /** `transition`, `enter`, `exit` y `stagger` del Nodo; solo pintura. */
  animacion: animacionDeNodoSchema.optional(),
});

/**
 * Fila de una tabla ER (ADR 0009): pila de Capas por fila, alto (Metrica), parche de las filas impares, estilo de los
 * textos `name`, `type` y `key` (chip) y parches por marca de clave y por Atributo opcional. Solo vale en Vistas ER;
 * ausente, la fila usa la pintura del Slot `attrs`.
 */
const filaSchema = z.strictObject({
  capas: z.array(capaSchema).default([]),
  alto: z.number().min(ALTO_DE_FILA.min).max(ALTO_DE_FILA.max).optional(),
  alterna: z.array(opSchema).default([]),
  textos: z.partialRecord(z.enum(NOMBRES_DE_TEXTO_DE_FILA as [keyof typeof TEXTOS_DE_FILA, ...Array<keyof typeof TEXTOS_DE_FILA>]), primitivaSchema).default({}),
  claves: z.partialRecord(z.enum(CLAVES_DE_FILA as [(typeof CLAVES_DE_FILA)[number], ...Array<(typeof CLAVES_DE_FILA)[number]>]), z.array(opSchema)).default({}),
  opcional: z.array(opSchema).default([]),
  /** Parches de estado (`hover`, `seleccionado`...): solo pintan, se aplican sobre la pila de la variante de la fila. */
  estados: z.partialRecord(z.enum(ESTADOS), z.array(opSchema)).default({}),
});

/** Parche de una variante de Mensaje (`kind`) o de Fragmento (`op`): parches de Capa y, en Mensajes, marcadores propios. */
const parcheDeVarianteSchema = z.strictObject({ ops: z.array(opSchema).default([]), origen: primitivaSchema.optional(), fin: primitivaSchema.optional() });

/**
 * Elemento de secuencia (ADR 0009: `lifeline`, `activation`, `message`, `fragment`, `note`): pila de Capas, marcadores,
 * estilo de texto o trazo suelto, parches por variante (`kind`/`op`), parches de estado y Metricas propias. Ausente =
 * el nucleo lo deriva de `edge` y `node`. Que admite cada uno lo dice `ESPECIFICACION_DE_SECUENCIA`.
 */
const bloqueDeSecuenciaSchema = z.strictObject({
  capas: z.array(capaSchema).default([]),
  origen: primitivaSchema.optional(),
  fin: primitivaSchema.optional(),
  textos: z.record(z.string(), primitivaSchema).default({}),
  parches: z.record(z.string(), parcheDeVarianteSchema).default({}),
  estados: z.partialRecord(z.enum(ESTADOS), z.array(opSchema)).default({}),
  metricas: z.record(z.string(), z.number()).default({}),
});
const secuenciaSchema = z.strictObject({
  lifeline: bloqueDeSecuenciaSchema.optional(),
  activation: bloqueDeSecuenciaSchema.optional(),
  message: bloqueDeSecuenciaSchema.optional(),
  fragment: bloqueDeSecuenciaSchema.optional(),
  note: bloqueDeSecuenciaSchema.optional(),
});

const relleno = z.number().min(0).max(128);
const paddingSchema = z.strictObject({ top: relleno, left: relleno, bottom: relleno, right: relleno });

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
  padding: paddingSchema.default({ top: 8, left: 16, bottom: 16, right: 16 }),
  tipos: z.record(z.string(), z.array(opSchema)).default({}),
  estados: z.partialRecord(z.enum(ESTADOS), z.array(opSchema)).default({}),
  /** Parches por Tipo de diagrama (ADR 0009): como los del Nodo, mas el `padding` de la zona de hijos. */
  diagramas: z
    .partialRecord(z.enum(TIPOS_DE_DIAGRAMA), z.strictObject({ ops: z.array(opSchema).default([]), slots: cajaSchema.optional(), padding: paddingSchema.optional() }))
    .optional(),
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
    /** Fila de las tablas ER; ausente = sin estilo propio (no entra en los snapshots de los Temas que no la usan). */
    fila: filaSchema.optional(),
    /** Elementos de secuencia; ausente = derivados de `edge` y `node` (no entra en los snapshots de los Temas que no los usan). */
    secuencia: secuenciaSchema.optional(),
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
    for (const [diagrama, parche] of Object.entries(tema.arista.diagramas ?? {})) {
      for (const e of validarOps([tema.arista.capas as CapaDeTema[]], parche.ops, tema.palette, 'parchear', 'capa-arista')) {
        ctx.addIssue({ code: 'custom', path: ['arista', 'diagramas', diagrama, 'ops', e.indice], message: e.mensaje });
      }
      if (parche.origen !== undefined) validar(parche.origen, 'marcador', ['arista', 'diagramas', diagrama, 'origen']);
      if (parche.fin !== undefined) validar(parche.fin, 'marcador', ['arista', 'diagramas', diagrama, 'fin']);
      if (parche.etiqueta !== undefined) validar(parche.etiqueta, 'etiqueta', ['arista', 'diagramas', diagrama, 'etiqueta']);
    }
    if (tema.arista.identificante !== undefined) {
      for (const e of validarOps([tema.arista.capas as CapaDeTema[]], tema.arista.identificante, tema.palette, 'parchear', 'capa-arista')) {
        ctx.addIssue({ code: 'custom', path: ['arista', 'identificante', e.indice], message: e.mensaje });
      }
    }
    validarElemento(ctx, tema, 'nodo');
    validarElemento(ctx, tema, 'grupo');
    if (tema.fila !== undefined) validarFila(ctx, tema, tema.fila);
    if (tema.secuencia !== undefined) validarSecuencia(ctx, tema, tema.secuencia);
  });

/** Valida los bloques de secuencia: Capas contra el catalogo, parches contra su pila, texto y Metricas contra `ESPECIFICACION_DE_SECUENCIA`. */
function validarSecuencia(ctx: z.RefinementCtx, tema: TemaResuelto, secuencia: NonNullable<TemaResuelto['secuencia']>): void {
  for (const nombre of BLOQUES_DE_SECUENCIA) {
    const bloque = secuencia[nombre];
    if (bloque === undefined) continue;
    const espec = ESPECIFICACION_DE_SECUENCIA[nombre];
    const falla = (path: Array<string | number>, message: string): void => ctx.addIssue({ code: 'custom', path: ['secuencia', nombre, ...path], message });
    const primitiva = (p: { tipo: string; props: Record<string, string | number> }, ubicacion: UbicacionDePrimitiva, path: Array<string | number>): void => {
      const props = Object.entries(p.props).map(([clave, valor]) => ({ clave, valor }));
      for (const error of construirPrimitiva(p.tipo, props, tema.palette, ubicacion).errores) falla([...path, ...(error.clave === undefined ? [] : ['props', error.clave])], error.mensaje);
    };
    const vistas = new Set<string>();
    bloque.capas.forEach((capa, i) => {
      if (vistas.has(capa.nombre)) falla(['capas', i, 'nombre'], `Capa '${capa.nombre}' repetida`);
      vistas.add(capa.nombre);
      primitiva(capa.primitiva, espec.capas, ['capas', i, 'primitiva']);
    });
    for (const [lado, p] of [['origen', bloque.origen], ['fin', bloque.fin]] as const) {
      if (p === undefined) continue;
      if (!espec.marcadores.includes(lado === 'origen' ? 'start' : 'end')) falla([lado], `'${nombre}' no admite el marcador '${lado === 'origen' ? 'start' : 'end'}'`);
      else primitiva(p, 'marcador', [lado]);
    }
    for (const [clave, texto] of Object.entries(bloque.textos)) {
      const permitido = espec.textos[clave];
      if (permitido === undefined) falla(['textos', clave], `'${nombre}' no tiene el estilo '${clave}'`);
      else if (texto.tipo !== permitido.primitiva) falla(['textos', clave], `el estilo '${clave}' de '${nombre}' usa la Primitiva '${permitido.primitiva}', no '${texto.tipo}'`);
      else primitiva(texto, permitido.ubicacion, ['textos', clave]);
    }
    for (const [clave, valor] of Object.entries(bloque.metricas)) {
      const rango = espec.metricas[clave];
      if (rango === undefined) falla(['metricas', clave], `'${nombre}' no tiene la Metrica '${clave}'`);
      else if (valor < rango.min || valor > rango.max) falla(['metricas', clave], `'${clave}' de '${nombre}' va de ${rango.min} a ${rango.max}`);
    }
    const base = bloque.capas as CapaDeTema[];
    for (const [variante, parche] of Object.entries(bloque.parches)) {
      if (espec.parches === undefined || !espec.parches.nombres.includes(variante)) falla(['parches', variante], `'${variante}' no es una variante de '${nombre}'`);
      for (const e of validarOps([base], parche.ops, tema.palette, 'parchear', espec.capas)) falla(['parches', variante, 'ops', e.indice], e.mensaje);
      if (parche.origen !== undefined) primitiva(parche.origen, 'marcador', ['parches', variante, 'origen']);
      if (parche.fin !== undefined) primitiva(parche.fin, 'marcador', ['parches', variante, 'fin']);
    }
    for (const [estado, ops] of Object.entries(bloque.estados)) {
      for (const e of validarOps([base], ops, tema.palette, 'parchear', espec.capas)) falla(['estados', estado, e.indice], e.mensaje);
    }
  }
}

/** Valida el bloque `row`: sus Capas contra el catalogo, sus parches contra la pila base (sin tocar las Metricas) y el estilo de sus textos. */
function validarFila(ctx: z.RefinementCtx, tema: TemaResuelto, fila: NonNullable<TemaResuelto['fila']>): void {
  const falla = (path: Array<string | number>, message: string): void => ctx.addIssue({ code: 'custom', path: ['fila', ...path], message });
  const vistas = new Set<string>();
  fila.capas.forEach((capa, i) => {
    if (vistas.has(capa.nombre)) falla(['capas', i, 'nombre'], `Capa '${capa.nombre}' repetida`);
    vistas.add(capa.nombre);
    const props = Object.entries(capa.primitiva.props).map(([clave, valor]) => ({ clave, valor }));
    for (const error of construirPrimitiva(capa.primitiva.tipo, props, tema.palette).errores) falla(['capas', i, 'primitiva', ...(error.clave === undefined ? [] : ['props', error.clave])], error.mensaje);
  });
  const base = fila.capas as CapaDeTema[];
  const parches: Array<[Array<string | number>, readonly OpDeCapa[]]> = [
    [['alterna'], fila.alterna],
    [['opcional'], fila.opcional],
    ...Object.entries(fila.estados).map(([estado, ops]): [Array<string | number>, readonly OpDeCapa[]] => [['estados', estado], ops ?? []]),
    ...Object.entries(fila.claves).map(([clave, ops]): [Array<string | number>, readonly OpDeCapa[]] => [['claves', clave], ops]),
  ];
  for (const [ruta, ops] of parches) {
    for (const e of validarOps([base], ops, tema.palette, 'parchear')) falla([...ruta, e.indice], e.mensaje);
    ops.forEach((op, indice) => {
      const razon = opTocaMetricas(op, [base]);
      if (razon !== undefined) falla([...ruta, indice], `un parche de fila no puede tocar las Metricas: ${razon}`);
    });
  }
  for (const [nombre, texto] of Object.entries(fila.textos)) {
    const props = Object.entries(texto.props).map(([clave, valor]) => ({ clave, valor }));
    for (const error of construirPrimitiva(texto.tipo, props, tema.palette, 'texto-slot').errores) falla(['textos', nombre, ...(error.clave === undefined ? [] : ['props', error.clave])], error.mensaje);
    const esperado = TEXTOS_DE_FILA[nombre as keyof typeof TEXTOS_DE_FILA];
    if (texto.tipo !== esperado) falla(['textos', nombre], `el texto '${nombre}' de la fila se estiliza con la Primitiva '${esperado}', no '${texto.tipo}'`);
  }
}

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
  const estiloDeSlot = (textos: Partial<Record<NombreDeSlot, Primitiva>>, ruta: Array<string | number>): void => {
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
  // Tipo de diagrama: nivel justo sobre la base; puede cambiar las Metricas. Los Tipos de nodo y estados lo ven debajo.
  for (const [diagrama, parche] of Object.entries(bloque.diagramas ?? {})) {
    for (const e of validarOps([base], parche.ops, tema.palette, 'parchear')) falla(['diagramas', diagrama, 'ops', e.indice], e.mensaje);
    if (parche.slots !== undefined) recorrer(parche.slots, 'diagramas');
    pilas.push(aplicarSinErrores(base, parche.ops, tema.palette));
  }
  const bases = [...pilas];
  for (const [tipo, ops] of Object.entries(bloque.tipos)) {
    for (const e of validarOps(bases, ops, tema.palette, 'parchear')) falla(['tipos', tipo, e.indice], e.mensaje);
    if (elemento === 'grupo') sinMetricas(ops, bases, ['tipos', tipo], 'de Tipo');
    pilas.push(...bases.map((pila) => aplicarSinErrores(pila, ops, tema.palette)));
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

type Completar = <P extends { tipo: string; props: Record<string, string | number> }>(primitiva: P, ubicacion: UbicacionDePrimitiva) => P | Primitiva;

/** Los bloques de secuencia con los defectos del catalogo en cada Primitiva suya. */
function conDefectosDeSecuencia(secuencia: NonNullable<TemaResuelto['secuencia']>, completar: Completar): NonNullable<TemaResuelto['secuencia']> {
  const salida: NonNullable<TemaResuelto['secuencia']> = {};
  for (const nombre of BLOQUES_DE_SECUENCIA) {
    const bloque = secuencia[nombre];
    if (bloque === undefined) continue;
    const espec = ESPECIFICACION_DE_SECUENCIA[nombre];
    const marcadores = (p: { origen?: Primitiva | undefined; fin?: Primitiva | undefined }): { origen?: Primitiva; fin?: Primitiva } => ({
      ...(p.origen !== undefined && { origen: completar(p.origen, 'marcador') }),
      ...(p.fin !== undefined && { fin: completar(p.fin, 'marcador') }),
    });
    salida[nombre] = {
      ...bloque,
      capas: bloque.capas.map((c) => ({ ...c, primitiva: completar(c.primitiva, espec.capas) })),
      ...marcadores(bloque),
      textos: Object.fromEntries(Object.entries(bloque.textos).map(([clave, texto]) => [clave, completar(texto, espec.textos[clave]?.ubicacion ?? 'texto-slot')])),
      parches: Object.fromEntries(Object.entries(bloque.parches).map(([variante, parche]) => [variante, { ...parche, ...marcadores(parche) }])),
    };
  }
  return salida;
}

const aplicarSinErrores = (base: CapaDeTema[], ops: Parameters<typeof aplicarOps>[1], paleta: Record<string, string>): CapaDeTema[] =>
  aplicarOps(base, ops, paleta, 'parchear').pila;

export type TemaResuelto = z.output<typeof temaResueltoSchema>;

/** Formas que no dibujan una tabla ER (recortan las filas): en `er` se derivan como `rect` con radio acotado (ADR 0009). */
const FORMAS_DE_PASTILLA: readonly string[] = ['pill', 'circle'];
const RADIO_DE_TABLA = 8;
const comoTabla = (capa: TemaResuelto['nodo']['capas'][number]): TemaResuelto['nodo']['capas'][number] =>
  FORMAS_DE_PASTILLA.includes(capa.primitiva.tipo) ? { ...capa, primitiva: { tipo: 'rect', props: { radius: RADIO_DE_TABLA } } } : capa;

const porDiagrama = new WeakMap<object, Map<TipoDeDiagrama, TemaResuelto>>();

/**
 * El Tema tal como se ve en un Tipo de diagrama (ADR 0009): las Capas, Slots y `padding` del base ya parcheados con
 * `diagram <tipo>`, de modo que la cascada de Tipo de nodo y estado sigue encima sin saber de diagramas. Sin
 * Tipo, o sin parche para el, es el mismo Tema. Pura y memoizada por Tema.
 */
export function temaParaDiagrama(tema: TemaResuelto, diagrama: TipoDeDiagrama | undefined): TemaResuelto {
  if (diagrama === undefined) return tema;
  const delNodo = tema.nodo.diagramas?.[diagrama];
  const delGrupo = tema.grupo.diagramas?.[diagrama];
  const delaArista = tema.arista.diagramas?.[diagrama];
  // El estilo `label` del bloque `message` es la etiqueta de la Arista en secuencia: asi sus Metricas son las del layout.
  const etiquetaDeMensaje = diagrama === 'sequence' ? tema.secuencia?.message?.textos['label'] : undefined;
  const haceTabla = diagrama === 'er' && tema.nodo.capas.some((capa) => FORMAS_DE_PASTILLA.includes(capa.primitiva.tipo));
  if (delNodo === undefined && delGrupo === undefined && delaArista === undefined && etiquetaDeMensaje === undefined && !haceTabla) return tema;
  const hecho = porDiagrama.get(tema)?.get(diagrama);
  if (hecho !== undefined) return hecho;
  const parchear = (capas: TemaResuelto['nodo']['capas'], ops: readonly OpDeCapa[] | undefined, ubicacion?: UbicacionDePrimitiva): TemaResuelto['nodo']['capas'] =>
    ops === undefined || ops.length === 0 ? capas : aplicarOps(capas as CapaDeTema[], ops, tema.palette, 'parchear', ubicacion).pila;
  const resultado: TemaResuelto = {
    ...tema,
    nodo: { ...tema.nodo, capas: parchear(diagrama === 'er' ? tema.nodo.capas.map(comoTabla) : tema.nodo.capas, delNodo?.ops), ...(delNodo?.slots !== undefined && { slots: delNodo.slots }) },
    grupo: { ...tema.grupo, capas: parchear(tema.grupo.capas, delGrupo?.ops), ...(delGrupo?.slots !== undefined && { slots: delGrupo.slots }), ...(delGrupo?.padding !== undefined && { padding: delGrupo.padding }) },
    arista: {
      ...tema.arista,
      capas: parchear(tema.arista.capas, delaArista?.ops, 'capa-arista'),
      ...(delaArista?.origen !== undefined && { origen: delaArista.origen }),
      ...(delaArista?.fin !== undefined && { fin: delaArista.fin }),
      ...(delaArista?.etiqueta !== undefined && { etiqueta: delaArista.etiqueta }),
      ...(etiquetaDeMensaje !== undefined && { etiqueta: etiquetaDeMensaje }),
    },
  };
  const memo = porDiagrama.get(tema) ?? new Map<TipoDeDiagrama, TemaResuelto>();
  memo.set(diagrama, resultado);
  porDiagrama.set(tema, memo);
  return resultado;
}

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
  const completo = conDefectos(leido.data);
  memo.set(tema, completo);
  return completo;
}

/**
 * El Tema con los defectos del catalogo en cada Primitiva (Capas, marcadores, etiqueta y estilo de Slots): un Tema
 * de `dsl` ya los trae, uno escrito a mano puede omitirlos y el dibujo no debe leer propiedades que faltan.
 * Los parches (`tipos`, `estados`) y las Capas `code` quedan como estan.
 */
function conDefectos(tema: TemaResuelto): TemaResuelto {
  const completar = <P extends { tipo: string; props: Record<string, string | number> }>(primitiva: P, ubicacion: UbicacionDePrimitiva): P | Primitiva => {
    if (primitiva.tipo === 'code') return primitiva;
    const props = Object.entries(primitiva.props).map(([clave, valor]) => ({ clave, valor }));
    return construirPrimitiva(primitiva.tipo, props, tema.palette, ubicacion).primitiva ?? primitiva;
  };
  const capas = <C extends { primitiva: { tipo: string; props: Record<string, string | number> } }>(lista: C[], ubicacion: UbicacionDePrimitiva): C[] => lista.map((c) => ({ ...c, primitiva: completar(c.primitiva, ubicacion) }));
  const textos = (lista: Partial<Record<NombreDeSlot, Primitiva>>): Partial<Record<NombreDeSlot, Primitiva>> =>
    Object.fromEntries(Object.entries(lista).map(([slot, primitiva]) => [slot, completar(primitiva, 'texto-slot')]));
  const { origen, fin, etiqueta } = tema.arista;
  return {
    ...tema,
    nodo: { ...tema.nodo, capas: capas(tema.nodo.capas, 'capa-nodo'), textos: textos(tema.nodo.textos) },
    grupo: {
      ...tema.grupo,
      capas: capas(tema.grupo.capas, 'capa-nodo'),
      textos: textos(tema.grupo.textos),
      colapsado: { ...tema.grupo.colapsado, ...(tema.grupo.colapsado.textos !== undefined && { textos: textos(tema.grupo.colapsado.textos) }) },
    },
    arista: {
      ...tema.arista,
      capas: capas(tema.arista.capas, 'capa-arista'),
      ...(origen !== undefined && { origen: completar(origen, 'marcador') }),
      ...(fin !== undefined && { fin: completar(fin, 'marcador') }),
      ...(etiqueta !== undefined && { etiqueta: completar(etiqueta, 'etiqueta') }),
    },
    pagina: { ...tema.pagina, capas: capas(tema.pagina.capas, 'capa-pagina') },
    ...(tema.secuencia !== undefined && { secuencia: conDefectosDeSecuencia(tema.secuencia, completar) }),
    ...(tema.fila !== undefined && { fila: { ...tema.fila, capas: capas(tema.fila.capas, 'capa-nodo'), textos: Object.fromEntries(Object.entries(tema.fila.textos).map(([nombre, primitiva]) => [nombre, completar(primitiva, 'texto-slot')])) } }),
  };
}

export type { NombreDeSlot };
