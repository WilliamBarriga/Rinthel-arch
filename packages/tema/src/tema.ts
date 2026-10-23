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

const capaSchema = z.strictObject({
  nombre: z.string().min(1),
  primitiva: z.strictObject({
    tipo: z.string().min(1),
    props: z.record(z.string(), z.union([z.string(), z.number()])),
  }),
});

const nodoSchema = z.strictObject({
  /** Pila de Capas, de abajo hacia arriba. */
  capas: z.array(capaSchema).default([]),
  /** Slots que se pintan, en orden visual; uno no listado no se pinta. */
  slots: z.array(z.enum(SLOTS)).default([...SLOTS]),
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
      }),
    nodo: nodoSchema.default({ capas: [], slots: [...SLOTS] }),
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
  });

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
  nodo: { capas: [], slots: ['title', 'attrs'] },
};

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
