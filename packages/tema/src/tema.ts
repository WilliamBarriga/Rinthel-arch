/**
 * Esquema del Tema ya resuelto (sin herencia) y el Tema neutro del nucleo.
 * `temaResueltoSchema` es estricto: una clave desconocida (p. ej. los viejos
 * `nodeStyles`/`edgeStyles`) se rechaza, y las Capas se validan contra el
 * catalogo con `construirPrimitiva`, de modo que hay una sola fuente de reglas.
 */
import { z } from 'zod';
import type { Tema } from 'canonico';

import { EASINGS, EFECTOS, MOVIMIENTOS, PROPIEDADES_ANIMABLES } from './animacion';
import { construirPrimitiva, SLOTS } from './catalogo';
import type { NombreDeSlot, UbicacionDePrimitiva } from './catalogo';
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

const nodoSchema = z.strictObject({
  /** Pila de Capas, de abajo hacia arriba. */
  capas: z.array(capaSchema).default([]),
  /** Slots que se pintan, en orden visual; uno no listado no se pinta. */
  slots: z.array(z.enum(SLOTS)).default([...SLOTS]),
  /** Estilo de texto (Primitiva `text`) de los Slots que lo declaran. */
  textos: z.partialRecord(z.enum(SLOTS), primitivaSchema).default({}),
  /** Parches por Tipo de nodo, en orden de aplicacion sobre la pila base. */
  tipos: z.record(z.string(), z.array(opSchema)).default({}),
  /** Parches por estado, aplicados sobre la pila base ya parcheada por Tipo. */
  estados: z.partialRecord(z.enum(ESTADOS), z.array(opSchema)).default({}),
  /** `transition`, `enter`, `exit` y `stagger` del Nodo; solo pintura. */
  animacion: animacionDeNodoSchema.optional(),
});

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
    nodo: nodoSchema.default({ capas: [], slots: [...SLOTS], textos: {}, tipos: {}, estados: {} }),
    arista: aristaSchema.default({ capas: [] }),
    pagina: paginaSchema.default({ capas: [], fijo: false }),
  })
  .superRefine((tema, ctx) => {
    const vistas = new Set<string>();
    tema.nodo.capas.forEach((capa, i) => {
      if (vistas.has(capa.nombre)) ctx.addIssue({ code: 'custom', path: ['nodo', 'capas', i, 'nombre'], message: `Capa '${capa.nombre}' repetida` });
      vistas.add(capa.nombre);
      const { errores } = construirPrimitiva(
        capa.primitiva.tipo,
        Object.entries(capa.primitiva.props).map(([clave, valor]) => ({ clave, valor })),
        tema.palette,
      );
      for (const error of errores) {
        ctx.addIssue({ code: 'custom', path: ['nodo', 'capas', i, 'primitiva', ...(error.clave === undefined ? [] : ['props', error.clave])], message: error.mensaje });
      }
    });
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
    for (const [slot, texto] of Object.entries(tema.nodo.textos)) validar(texto, 'texto-slot', ['nodo', 'textos', slot]);
    const base = tema.nodo.capas as CapaDeTema[];
    const porTipo = Object.entries(tema.nodo.tipos);
    const pilas = [base];
    for (const [tipo, ops] of porTipo) {
      const errores = validarOps([base], ops, tema.palette, 'parchear');
      for (const e of errores) ctx.addIssue({ code: 'custom', path: ['nodo', 'tipos', tipo, e.indice], message: e.mensaje });
      pilas.push(aplicarSinErrores(base, ops, tema.palette));
    }
    for (const [estado, ops] of Object.entries(tema.nodo.estados)) {
      for (const e of validarOps(pilas, ops, tema.palette, 'parchear')) ctx.addIssue({ code: 'custom', path: ['nodo', 'estados', estado, e.indice], message: e.mensaje });
      ops.forEach((op, indice) => {
        const razon = opTocaMetricas(op, pilas);
        if (razon !== undefined) {
          ctx.addIssue({ code: 'custom', path: ['nodo', 'estados', estado, indice], message: `un parche de estado no puede tocar las Metricas: ${razon}; hover nunca relayouta` });
        }
      });
    }
  });

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
  nodo: { capas: [], slots: ['title', 'attrs'], textos: {}, tipos: {}, estados: {} },
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
