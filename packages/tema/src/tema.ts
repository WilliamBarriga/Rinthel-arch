/**
 * Esquema del Tema ya resuelto (sin herencia) y el Tema neutro del nucleo.
 * `temaResueltoSchema` es estricto: una clave desconocida (p. ej. los viejos
 * `nodeStyles`/`edgeStyles`) se rechaza, y las Capas se validan contra el
 * catalogo con `construirPrimitiva`, de modo que hay una sola fuente de reglas.
 */
import { z } from 'zod';
import type { Tema } from 'canonico';

import { construirPrimitiva, SLOTS } from './catalogo';
import type { NombreDeSlot } from './catalogo';
import { ESTADOS, aplicarOps, validarOps } from './parches';
import type { CapaDeTema, OpDeCapa } from './parches';

const capaSchema = z.strictObject({
  nombre: z.string().min(1),
  primitiva: z.strictObject({
    tipo: z.string().min(1),
    props: z.record(z.string(), z.union([z.string(), z.number()])),
  }),
  /** Sobre el contenido (`over`); sin ella, bajo el contenido. */
  encima: z.literal(true).optional(),
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
});

const nodoSchema = z.strictObject({
  /** Pila de Capas, de abajo hacia arriba. */
  capas: z.array(capaSchema).default([]),
  /** Slots que se pintan, en orden visual; uno no listado no se pinta. */
  slots: z.array(z.enum(SLOTS)).default([...SLOTS]),
  /** Parches por Tipo de nodo, en orden de aplicacion sobre la pila base. */
  tipos: z.record(z.string(), z.array(opSchema)).default({}),
  /** Parches por estado, aplicados sobre la pila base ya parcheada por Tipo. */
  estados: z.partialRecord(z.enum(ESTADOS), z.array(opSchema)).default({}),
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
    nodo: nodoSchema.default({ capas: [], slots: [...SLOTS], tipos: {}, estados: {} }),
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
  nodo: { capas: [], slots: ['title', 'attrs'], tipos: {}, estados: {} },
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
