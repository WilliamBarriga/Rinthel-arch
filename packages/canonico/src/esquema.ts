/**
 * Esquema Zod de la Fuente canonica.
 *
 * Alcance: Nodos (id cualificado, `type`, titulo, descripcion,
 * Atributos, jerarquia de hijos), catalogo de Tipos de nodo y Aristas con
 * extremo Nodo o Nodo#Atributo y cardinalidad opcional (tickets #24 y #25). `source`,
 * Vistas, Temas y geometria llegan en tickets posteriores del spec #19.
 *
 * Jerarquia: los ids cualificados (`a.b.c`) definen la jerarquia del Modelo.
 * `children` la refleja cuando el documento anida; un documento plano (todos los
 * Nodos en `model.nodes` con `children` vacio) tambien es valido, siempre que
 * las dos formas digan lo mismo (ver reglas en `index.ts`).
 */
import { z } from 'zod';

/**
 * Id de Nodo cualificado por su jerarquia: segmentos `a.b.c` con caracteres de
 * identificador (`[A-Za-z0-9_-]`). Rechaza ids vacios, espacios, segmentos
 * vacios (`a..b`, `api.`, `.api`) y cualquier prefijo jerarquico implicito.
 */
export const idDeNodoSchema = z.string().regex(/^[A-Za-z0-9_-]+(?:\.[A-Za-z0-9_-]+)*$/, {
  message: 'id cualificado por jerarquia: segmentos a.b.c',
});

const nombreDeTipoSchema = z.string().min(1);

/**
 * Tipo de nodo del catalogo (`specification`): su clave y los campos minimos
 * que define el spec #19. `color` es siempre un nombre de Paleta, nunca un
 * valor literal (ADR 0006); `icon` es una clave opaca del `IconProvider`.
 */
export const tipoDeNodoSchema = z.object({
  name: nombreDeTipoSchema,
  description: z.string().default(''),
  icon: z.string().min(1).optional(),
  style: z.string().min(1).optional(),
  color: z.string().min(1).optional(),
});

export type TipoDeNodo = z.infer<typeof tipoDeNodoSchema>;

/** Catalogo de Tipos de nodo declarado por el Proyecto documentado. */
export interface CatalogoDeTiposDeNodo {
  nodeTypes: TipoDeNodo[];
}

/** Nodo del Modelo: identidad estable, Tipo de nodo, texto semantico e hijos. */
export interface Nodo {
  id: string;
  type: string;
  title: string;
  description: string;
  attributes: Atributo[];
  source: ReferenciaOpaca[];
  children: Nodo[];
}

/** Referencia a algo externo al Modelo; el nucleo no interpreta `kind` ni `ref`. */
export interface ReferenciaOpaca {
  kind: string;
  ref: string;
}

/** Elemento estructurado y ordenado de un Nodo (columna, campo, metodo). No es un Nodo hijo. */
export interface Atributo {
  name: string;
  type: string;
  notes: string;
}

/**
 * Extremo de una Arista: un Nodo por su id cualificado completo y, opcional,
 * uno de sus Atributos (`nodo#atributo`; el punto queda solo para jerarquia).
 */
export interface Extremo {
  node: string;
  attribute?: string;
}

/** Relacion dirigida entre dos extremos, con cardinalidad opcional en cada uno. */
export interface Arista {
  from: Extremo;
  to: Extremo;
  fromCardinality?: string;
  toCardinality?: string;
}

/** Conjunto unico de Nodos y Aristas del Proyecto documentado (CONTEXT.md). */
export interface Modelo {
  nodes: Nodo[];
  edges: Arista[];
}

const referenciaOpacaSchema = z.object({ kind: z.string().min(1), ref: z.string() });

export const atributoSchema = z.object({
  name: z.string().min(1),
  type: z.string().min(1),
  notes: z.string().default(''),
});

/**
 * Nodo del Modelo: id cualificado, Tipo de nodo, titulo, descripcion e hijos.
 * Que su `type` este declarado en el catalogo se comprueba en
 * `fuenteCanonicaSchema`, porque el catalogo vive en la misma Fuente.
 */
export const nodoSchema: z.ZodType<Nodo> = z.lazy(() =>
  z.object({
    id: idDeNodoSchema,
    type: z.string().min(1),
    title: z.string().min(1),
    description: z.string().default(''),
    attributes: z.array(atributoSchema).default([]),
    source: z.array(referenciaOpacaSchema).default([]),
    children: z.array(nodoSchema).default([]),
  }),
);

const catalogoSchema = z.object({
  nodeTypes: z.array(tipoDeNodoSchema),
});

const extremoSchema = z.object({ node: idDeNodoSchema, attribute: z.string().min(1).optional() });

export const aristaSchema = z.object({
  from: extremoSchema,
  to: extremoSchema,
  fromCardinality: z.string().min(1).optional(),
  toCardinality: z.string().min(1).optional(),
});

const modeloSchema = z.object({
  nodes: z.array(nodoSchema),
  edges: z.array(aristaSchema).default([]),
});

const tablaDeCadenasSchema = z.record(z.string(), z.string());

/**
 * Tema ya resuelto: objeto plano sin herencia (ADR 0006). `palette` mapea nombre
 * de Paleta a valor literal; el hex solo existe aqui. Un Tema es un solo modo.
 */
export const temaSchema = z.object({
  name: z.string().min(1),
  palette: tablaDeCadenasSchema.default({}),
  fonts: tablaDeCadenasSchema.default({}),
  tokens: tablaDeCadenasSchema.default({}),
});

export type Tema = z.infer<typeof temaSchema>;

/** Tema por defecto del nucleo: siempre disponible, otros Temas pueden extenderlo. */
export const TEMA_NEUTRO: Tema = {
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
};

/** Tipos de diagrama de la primera entrega. */
export const TIPOS_DE_VISTA = ['architecture', 'flow'] as const;

/**
 * Override de presentacion de un Nodo en una Vista: solo apariencia, nunca toca
 * el Modelo. `pin` en coordenadas del lienzo post-layout; `color` es un nombre
 * de Paleta (`compile` lo valida contra la Paleta del Tema).
 */
export const overrideSchema = z.object({
  node: idDeNodoSchema,
  label: z.string().optional(),
  pin: z.object({ x: z.number(), y: z.number() }).optional(),
  order: z.number().int().optional(),
  color: z.string().min(1).optional(),
});

export type OverrideDeNodo = z.infer<typeof overrideSchema>;

/**
 * Vista: selecciona Nodos del Modelo con `include`/`exclude`/`depth` (ver
 * `resolveView`). Nunca define entidades nuevas.
 */
/** Lo que un Paso nombra: un selector de Nodos (`a`, `a.*`, `a.**`) o una Arista (`a -> b`). */
const elementoDePasoSchema = z.union([
  z.object({ selector: z.string().min(1) }),
  z.object({ from: idDeNodoSchema, to: idDeNodoSchema }),
]);

/** Paso de revelado (ADR 0007): acumulativo; `show` revela y `hide` oculta lo anterior. */
export const pasoSchema = z.object({
  title: z.string(),
  show: z.array(elementoDePasoSchema).default([]),
  hide: z.array(elementoDePasoSchema).default([]),
});

export type Paso = z.infer<typeof pasoSchema>;
export type ElementoDePaso = z.infer<typeof elementoDePasoSchema>;

export const vistaSchema = z.object({
  id: z.string().min(1),
  type: z.enum(TIPOS_DE_VISTA),
  include: z.array(z.string().min(1)).default([]),
  exclude: z.array(z.string().min(1)).default([]),
  depth: z.number().int().min(0).optional(),
  overrides: z.array(overrideSchema).default([]),
  theme: z.string().min(1).optional(),
  /** Mecanismo de drill-down por defecto de la Vista (ver CONTEXT.md, Drill-down). */
  drill: z.literal('collapse').optional(),
  /** Grupos que la Vista abre colapsados / expandidos, por encima de la regla de `depth`. */
  collapsed: z.array(idDeNodoSchema).default([]),
  expanded: z.array(idDeNodoSchema).default([]),
  /** Drill-down por Nodo hacia otra Vista; el Grupo enlazado no se expande. */
  links: z.array(z.object({ node: idDeNodoSchema, view: z.string().min(1) })).default([]),
  /** Pasos de revelado en orden; sin pasos todo esta revelado. */
  steps: z.array(pasoSchema).default([]),
});

export type Vista = z.infer<typeof vistaSchema>;

/**
 * Fuente canonica, seccion de Nodos. Todavia no hay validador: la validacion
 * semantica por codigos (ADR 0008) llega con `validate` en tickets posteriores;
 * aqui solo se validan la forma del documento y las reglas estructurales de
 * jerarquia documentadas en `index.ts`.
 */
export const fuenteCanonicaSchema = z
  .object({
    specification: catalogoSchema,
    model: modeloSchema,
    views: z.array(vistaSchema).default([]),
    themes: z.array(temaSchema).default([TEMA_NEUTRO]),
  })
  .superRefine((fuente, ctx) => {
    for (const hallazgo of hallazgosDeModelo(fuente)) {
      ctx.addIssue({ code: 'custom', path: hallazgo.path, message: hallazgo.message });
    }
  });

export type FuenteCanonica = z.infer<typeof fuenteCanonicaSchema>;

/** Rechazo estructural: posicion en el documento y texto explicativo. */
interface Hallazgo {
  path: (string | number)[];
  message: string;
}

/**
 * Reglas estructurales del Modelo, sin dependencia de Zod:
 * - jerarquia por id cualificado (sin hijos huerfanos y sin anidacion
 *   incoherente entre `children` y los ids);
 * - `type` declarado en el catalogo de Tipos de nodo;
 * - extremos de Arista que existen en el Modelo (Nodo y, si lo llevan, Atributo).
 */
function hallazgosDeModelo(fuente: {
  specification: CatalogoDeTiposDeNodo;
  model: Modelo;
}): Hallazgo[] {
  const tipos = new Set(fuente.specification.nodeTypes.map((tipo) => tipo.name));

  const ids = new Map<string, Set<string>>();
  recogerIds(fuente.model.nodes, ids);

  const hallazgos: Hallazgo[] = [];
  const recorrer = (
    nodos: Nodo[],
    contenedor: string | undefined,
    ruta: (string | number)[],
  ): void => {
    nodos.forEach((nodo, indice) => {
      const aqui = [...ruta, indice];
      const padre = padreDe(nodo.id);

      if (!tipos.has(nodo.type)) {
        hallazgos.push({
          path: [...aqui, 'type'],
          message: `Tipo de nodo '${nodo.type}' no declarado en el catalogo`,
        });
      }

      if (padre !== '' && !ids.has(padre)) {
        hallazgos.push({
          path: aqui,
          message: `Hijo huerfano: el padre '${padre}' del Nodo '${nodo.id}' no existe en el Modelo`,
        });
      } else if (contenedor !== undefined && contenedor !== padre) {
        hallazgos.push({
          path: aqui,
          message: `Jerarquia incoherente: '${nodo.id}' esta anidado bajo '${contenedor}' pero su padre es '${padre || 'ninguno'}'`,
        });
      }

      recorrer(nodo.children, nodo.id, [...aqui, 'children']);
    });
  };
  recorrer(fuente.model.nodes, undefined, ['model', 'nodes']);

  fuente.model.edges.forEach((arista, indice) => {
    for (const lado of ['from', 'to'] as const) {
      const { node, attribute } = arista[lado];
      const atributos = ids.get(node);
      if (atributos === undefined) {
        hallazgos.push({
          path: ['model', 'edges', indice, lado, 'node'],
          message: `Arista colgante: el Nodo '${node}' no existe en el Modelo`,
        });
      } else if (attribute !== undefined && !atributos.has(attribute)) {
        hallazgos.push({
          path: ['model', 'edges', indice, lado, 'attribute'],
          message: `El Nodo '${node}' no tiene el Atributo '${attribute}'`,
        });
      }
    }
  });

  return hallazgos;
}

/** Id de cada Nodo, a cualquier profundidad, con los nombres de sus Atributos. */
function recogerIds(nodos: Nodo[], destino: Map<string, Set<string>>): void {
  for (const nodo of nodos) {
    destino.set(nodo.id, new Set(nodo.attributes.map((atributo) => atributo.name)));
    recogerIds(nodo.children, destino);
  }
}

/** Padre jerarquico de un id cualificado; cadena vacia si el id es raiz. */
function padreDe(id: string): string {
  const corte = id.lastIndexOf('.');
  return corte === -1 ? '' : id.slice(0, corte);
}
