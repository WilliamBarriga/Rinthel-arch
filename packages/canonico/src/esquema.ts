/**
 * Esquema Zod de la Fuente canonica. Los ids cualificados (`a.b.c`) definen la jerarquia del Modelo; un
 * documento anidado (`children`) y uno plano son validos si dicen lo mismo (ver `hallazgosDeModelo`).
 */
import { z } from 'zod';

/** Segmentos `a.b.c` de `[A-Za-z0-9_-]`; rechaza ids vacios, espacios y segmentos vacios (`a..b`, `api.`, `.api`). */
export const idDeNodoSchema = z.string().regex(/^[A-Za-z0-9_-]+(?:\.[A-Za-z0-9_-]+)*$/, {
  message: 'id qualified by hierarchy: segments a.b.c',
});

const nombreDeTipoSchema = z.string().min(1);

/** `color` es un nombre de Paleta, nunca un valor literal; `icon` es una clave opaca del `IconProvider`. */
export const tipoDeNodoSchema = z.object({
  name: nombreDeTipoSchema,
  description: z.string().default(''),
  icon: z.string().min(1).optional(),
  style: z.string().min(1).optional(),
  color: z.string().min(1).optional(),
});

export type TipoDeNodo = z.infer<typeof tipoDeNodoSchema>;

export interface CatalogoDeTiposDeNodo {
  nodeTypes: TipoDeNodo[];
}

export interface Nodo {
  id: string;
  type: string;
  title: string;
  description: string;
  attributes: Atributo[];
  source: ReferenciaOpaca[];
  children: Nodo[];
  /** Marca Planeado (ADR 0011): propuesto, aun no construido; marca a sus descendientes. Ausente es `false`. */
  planned?: boolean;
}

/** Referencia a algo externo al Modelo; el nucleo no interpreta `kind` ni `ref`. */
export interface ReferenciaOpaca {
  kind: string;
  ref: string;
}

/** Marcas de clave ER, combinables. */
export const CLAVES_DE_ATRIBUTO = ['pk', 'fk', 'uk'] as const;
/** Las que exige una Vista ER; el Modelo guarda texto libre. */
export const CARDINALIDADES_ER = ['0..1', '1', '0..*', '1..*'] as const;
export type ClaveDeAtributo = (typeof CLAVES_DE_ATRIBUTO)[number];

/** Columna, campo o metodo de un Nodo; no es un Nodo hijo. `keys` y `optional` solo se dibujan en Vistas ER. */
export interface Atributo {
  name: string;
  type: string;
  notes: string;
  /** Sin repetir; ausente si no tiene. */
  keys?: ClaveDeAtributo[];
  /** El tipo admite nulo (`tipo?` en el DSL); ausente es `false`. */
  optional?: boolean;
  /** Marca Planeado (ADR 0011), dibujada como chip junto a las de clave; ausente es `false`. */
  planned?: boolean;
}

/** `node` es el id cualificado completo; `attribute` se escribe `nodo#atributo` (el punto es solo jerarquia). */
export interface Extremo {
  node: string;
  attribute?: string;
}

export interface Arista {
  from: Extremo;
  to: Extremo;
  fromCardinality?: string;
  toCardinality?: string;
  label?: string;
  /** ER: linea continua en vez de discontinua; ausente es `false`. */
  identifying?: boolean;
  /** Marca Planeado (ADR 0011); una Arista tambien se dibuja planeada si un extremo lo esta. Ausente es `false`. */
  planned?: boolean;
}

export interface Modelo {
  nodes: Nodo[];
  edges: Arista[];
  interactions?: Interaccion[];
}

export const TIPOS_DE_MENSAJE = ['sync', 'async', 'reply', 'create', 'destroy'] as const;
export type TipoDeMensaje = (typeof TIPOS_DE_MENSAJE)[number];

/** `from == to` es un Mensaje propio. Su identidad es la posicion; `id` es un alias opcional, unico en su Interaccion. */
export interface Mensaje {
  type: 'message';
  id?: string;
  kind: TipoDeMensaje;
  from: string;
  to: string;
  label?: string;
  description?: string;
}

/** `opt loop break critical` tienen un operando; `alt par`, uno o mas. */
export const OPERADORES_DE_FRAGMENTO = ['opt', 'loop', 'break', 'critical', 'alt', 'par'] as const;
export type OperadorDeFragmento = (typeof OPERADORES_DE_FRAGMENTO)[number];

/**
 * `separador` es la palabra que introdujo el operando (`else` en `alt`, `and` en `par`); el primero no lo lleva.
 * Solo lo usa `validate` para detectar operandos cruzados.
 */
export interface Operando {
  guard?: string;
  separator?: 'else' | 'and';
  items: ItemDeInteraccion[];
}

/** Fragmento: operador con operandos; anidable. No es Nodo ni Grupo: sus Lifelines se derivan de su contenido. */
export interface Fragmento {
  type: 'fragment';
  operator: OperadorDeFragmento;
  operands: Operando[];
}

/** Anclaje de una Nota: a la izquierda o derecha de una Lifeline, o sobre una o dos. */
export const ANCLAJES_DE_NOTA = ['left', 'right', 'over'] as const;
export type AnclajeDeNota = (typeof ANCLAJES_DE_NOTA)[number];

/** `left of X`, `right of X` (un objetivo) u `over X[, Y]` (uno o dos). No es participante. */
export interface Nota {
  type: 'note';
  anchor: AnclajeDeNota;
  targets: string[];
  text: string;
}

/** `ref <interaccion>`: referencia a otra Interaccion (los ciclos son validos; no se expande). */
export interface Referencia {
  type: 'ref';
  interaction: string;
}

/** Item de una Interaccion; el orden de declaracion es el orden temporal. */
export type ItemDeInteraccion = Mensaje | Fragmento | Nota | Referencia;

/** Escenario ordenado entre Nodos (Lifelines); id en un espacio de nombres propio (puede coincidir con el de un Nodo). */
export interface Interaccion {
  id: string;
  title: string;
  description: string;
  items: ItemDeInteraccion[];
  /** Marca Planeado (ADR 0011): todos sus Mensajes se dibujan planeados. Ausente es `false`. */
  planned?: boolean;
}

const referenciaOpacaSchema = z.object({ kind: z.string().min(1), ref: z.string() });

export const atributoSchema = z.object({
  name: z.string().min(1),
  type: z.string().min(1),
  notes: z.string().default(''),
  keys: z.array(z.enum(CLAVES_DE_ATRIBUTO)).min(1).optional(),
  optional: z.boolean().optional(),
  planned: z.boolean().optional(),
});

/** Que `type` este en el catalogo se comprueba en `fuenteCanonicaSchema`, donde vive el catalogo. */
export const nodoSchema: z.ZodType<Nodo> = z.lazy(() =>
  z.object({
    id: idDeNodoSchema,
    type: z.string().min(1),
    title: z.string().min(1),
    description: z.string().default(''),
    attributes: z.array(atributoSchema).default([]),
    source: z.array(referenciaOpacaSchema).default([]),
    children: z.array(nodoSchema).default([]),
    planned: z.boolean().optional(),
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
  label: z.string().min(1).optional(),
  identifying: z.boolean().optional(),
  planned: z.boolean().optional(),
});

export const mensajeSchema = z.object({
  type: z.literal('message'),
  id: z.string().min(1).optional(),
  kind: z.enum(TIPOS_DE_MENSAJE).default('sync'),
  from: idDeNodoSchema,
  to: idDeNodoSchema,
  label: z.string().optional(),
  description: z.string().optional(),
});

export const fragmentoSchema: z.ZodType<Fragmento> = z.lazy(() =>
  z.object({
    type: z.literal('fragment'),
    operator: z.enum(OPERADORES_DE_FRAGMENTO),
    operands: z.array(
      z.object({
        guard: z.string().optional(),
        separator: z.enum(['else', 'and']).optional(),
        items: z.array(itemSchema).default([]),
      }),
    ),
  }),
) as z.ZodType<Fragmento>;

export const notaSchema = z.object({
  type: z.literal('note'),
  anchor: z.enum(ANCLAJES_DE_NOTA),
  targets: z.array(idDeNodoSchema).min(1),
  text: z.string(),
});

export const referenciaSchema = z.object({ type: z.literal('ref'), interaction: z.string().min(1) });

const itemSchema: z.ZodType<ItemDeInteraccion> = z.lazy(() => z.union([mensajeSchema, fragmentoSchema, notaSchema, referenciaSchema]));

export const interaccionSchema = z.object({
  id: z.string().min(1),
  title: z.string().min(1),
  description: z.string().default(''),
  items: z.array(itemSchema).default([]),
  planned: z.boolean().optional(),
});

const modeloSchema = z.object({
  nodes: z.array(nodoSchema),
  edges: z.array(aristaSchema).default([]),
  interactions: z.array(interaccionSchema).default([]),
});

/** Sobre del Tema ya resuelto; el resto del contenido pasa tal cual y lo valida el paquete `tema`. */
export const temaSchema = z.looseObject({
  name: z.string().min(1),
  palette: z.record(z.string(), z.string()).default({}),
});

export type Tema = z.infer<typeof temaSchema>;

export const TIPOS_DE_VISTA = ['architecture', 'flow', 'sequence', 'er'] as const;

/**
 * Solo apariencia, nunca toca el Modelo. `pin`: centro del Nodo relativo a su Grupo padre (al lienzo si es raiz),
 * aplicado tras el layout. `order` se guarda pero no tiene efecto: ELK corre sin `considerModelOrder`.
 * `color` es un nombre de Paleta.
 */
export const overrideSchema = z.object({
  node: idDeNodoSchema,
  label: z.string().optional(),
  pin: z.object({ x: z.number(), y: z.number() }).optional(),
  order: z.number().int().optional(),
  color: z.string().min(1).optional(),
});

export type OverrideDeNodo = z.infer<typeof overrideSchema>;

/** Selector de Nodos (`a.*` y `a.**` incluyen al Grupo `a`) o Arista (`a -> b`). */
const elementoDePasoSchema = z.union([
  z.object({ selector: z.string().min(1) }),
  z.object({ from: idDeNodoSchema, to: idDeNodoSchema }),
]);

/** Acumulativo: `show` revela y `hide` oculta lo anterior. */
export const pasoSchema = z.object({
  title: z.string(),
  show: z.array(elementoDePasoSchema).default([]),
  hide: z.array(elementoDePasoSchema).default([]),
  /** Solo `sequence`: id del Mensaje hasta el que (incluido) se muestra la Interaccion. */
  upto: z.string().min(1).optional(),
});

export type Paso = z.infer<typeof pasoSchema>;
export type ElementoDePaso = z.infer<typeof elementoDePasoSchema>;
export type AristaDePaso = Extract<ElementoDePaso, { from: string }>;

/** Selecciona Nodos del Modelo (ver `resolveView`); nunca define entidades. */
export const vistaSchema = z.object({
  id: z.string().min(1),
  type: z.enum(TIPOS_DE_VISTA),
  include: z.array(z.string().min(1)).default([]),
  exclude: z.array(z.string().min(1)).default([]),
  depth: z.number().int().min(0).optional(),
  /** Solo `sequence`: id en `model.interactions`. */
  interaction: z.string().min(1).optional(),
  /** Solo `sequence`: orden parcial de las Lifelines; el resto sigue por primera aparicion. */
  order: z.array(idDeNodoSchema).default([]),
  /** Solo `sequence`: el numero entra en la etiqueta del Mensaje. Ausente = false. */
  autonumber: z.literal(true).optional(),
  overrides: z.array(overrideSchema).default([]),
  theme: z.string().min(1).optional(),
  /** Parches de Capa por nombre (`theme t { layer ... }`), ultimo nivel de la cascada; los valida `tema`. */
  themePatch: z.array(z.looseObject({ nombre: z.string().min(1) })).optional(),
  drill: z.literal('collapse').optional(),
  /** Ganan a la regla de `depth`. */
  collapsed: z.array(idDeNodoSchema).default([]),
  expanded: z.array(idDeNodoSchema).default([]),
  /** El Grupo enlazado no se expande. */
  links: z.array(z.object({ node: idDeNodoSchema, view: z.string().min(1) })).default([]),
  /** Sin pasos todo esta revelado. */
  steps: z.array(pasoSchema).default([]),
  /** Solo `sequence`: un Paso por Mensaje proyectado. Ausente = false. */
  stepsEach: z.literal(true).optional(),
});

export type Vista = z.infer<typeof vistaSchema>;

/** Solo forma y reglas estructurales (`hallazgosDeModelo`); la validacion semantica es `validate`. */
export const fuenteCanonicaSchema = z
  .object({
    specification: catalogoSchema,
    model: modeloSchema,
    views: z.array(vistaSchema).default([]),
    themes: z.array(temaSchema).default([]),
  })
  .superRefine((fuente, ctx) => {
    for (const hallazgo of hallazgosDeModelo(fuente)) {
      ctx.addIssue({ code: 'custom', path: hallazgo.path, message: hallazgo.message });
    }
  });

export type FuenteCanonica = z.infer<typeof fuenteCanonicaSchema>;

interface Hallazgo {
  path: (string | number)[];
  message: string;
}

/**
 * Jerarquia coherente con los ids (sin hijos huerfanos), `type` en el catalogo y extremos de Arista existentes
 * (Nodo y, si lo lleva, Atributo).
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
          message: `Node kind '${nodo.type}' is not declared in the catalog`,
        });
      }

      if (padre !== '' && !ids.has(padre)) {
        hallazgos.push({
          path: aqui,
          message: `Orphan child: parent '${padre}' of Node '${nodo.id}' does not exist in the Model`,
        });
      } else if (contenedor !== undefined && contenedor !== padre) {
        hallazgos.push({
          path: aqui,
          message: `Inconsistent hierarchy: '${nodo.id}' is nested under '${contenedor}' but its parent is '${padre || 'none'}'`,
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
          message: `Dangling Edge: Node '${node}' does not exist in the Model`,
        });
      } else if (attribute !== undefined && !atributos.has(attribute)) {
        hallazgos.push({
          path: ['model', 'edges', indice, lado, 'attribute'],
          message: `Node '${node}' has no Attribute '${attribute}'`,
        });
      }
    }
  });

  return hallazgos;
}

function recogerIds(nodos: Nodo[], destino: Map<string, Set<string>>): void {
  for (const nodo of nodos) {
    destino.set(nodo.id, new Set(nodo.attributes.map((atributo) => atributo.name)));
    recogerIds(nodo.children, destino);
  }
}

/** Cadena vacia si el id es raiz. */
export function padreDe(id: string): string {
  const corte = id.lastIndexOf('.');
  return corte === -1 ? '' : id.slice(0, corte);
}
