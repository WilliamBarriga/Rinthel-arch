/**
 * Esquema Zod de la Fuente canonica.
 *
 * Alcance: Nodos (id cualificado, `type`, titulo, descripcion, Atributos,
 * `source`, jerarquia de hijos), catalogo de Tipos de nodo, Aristas con extremo
 * Nodo o Nodo#Atributo y cardinalidad opcional, Temas ya resueltos y Vistas.
 * La geometria cacheada tiene su esquema en `geometria.ts`.
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
 * valor literal (ADR 0002); `icon` es una clave opaca del `IconProvider`.
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

/** Marcas de clave de un Atributo (ER): clave primaria, foranea y unica; combinables. */
export const CLAVES_DE_ATRIBUTO = ['pk', 'fk', 'uk'] as const;
/** Cardinalidades canonicas que exige una Vista ER (el Modelo guarda el texto libre). */
export const CARDINALIDADES_ER = ['0..1', '1', '0..*', '1..*'] as const;
export type ClaveDeAtributo = (typeof CLAVES_DE_ATRIBUTO)[number];

/**
 * Elemento estructurado y ordenado de un Nodo (columna, campo, metodo). No es un Nodo hijo.
 * `keys` y `optional` son Modelo (ER) y se escriben siempre; solo las Vistas ER los dibujan.
 */
export interface Atributo {
  name: string;
  type: string;
  notes: string;
  /** Marcas de clave sin repetir; ausente si no tiene. */
  keys?: ClaveDeAtributo[];
  /** El tipo admite nulo (`tipo?` en el DSL); ausente es `false`. */
  optional?: boolean;
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
  /** Texto corto sobre la Arista (ej. protocolo o accion). */
  label?: string;
  /** Relacion identificante (ER: linea continua en vez de discontinua); ausente es `false`. */
  identifying?: boolean;
}

/** Conjunto unico de Nodos, Aristas e Interacciones del Proyecto documentado (CONTEXT.md). */
export interface Modelo {
  nodes: Nodo[];
  edges: Arista[];
  interactions?: Interaccion[];
}

/** Tipos de Mensaje de una Interaccion (`create` y `destroy` llegan con su ticket). */
export const TIPOS_DE_MENSAJE = ['sync', 'async', 'reply', 'create', 'destroy'] as const;
export type TipoDeMensaje = (typeof TIPOS_DE_MENSAJE)[number];

/**
 * Mensaje de una Interaccion: de un Nodo a otro (`from == to` es un Mensaje propio). Su identidad es la
 * posicion en la Interaccion; `id` es solo un alias opcional, unico en su Interaccion, para citarlo.
 */
export interface Mensaje {
  type: 'message';
  id?: string;
  kind: TipoDeMensaje;
  from: string;
  to: string;
  label?: string;
  description?: string;
}

/** Operadores de Fragmento (ADR 0009): `opt loop break critical` tienen un operando; `alt par`, uno o mas. */
export const OPERADORES_DE_FRAGMENTO = ['opt', 'loop', 'break', 'critical', 'alt', 'par'] as const;
export type OperadorDeFragmento = (typeof OPERADORES_DE_FRAGMENTO)[number];

/**
 * Operando de un Fragmento: guarda de texto libre opcional y su lista de items. `separador` es la palabra que lo
 * introdujo (`else` en `alt`, `and` en `par`); el primer operando no lo lleva. Solo lo usa `validate` para detectar
 * operandos cruzados.
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

/** Item de una Interaccion; el orden de declaracion es el orden temporal. */
export type ItemDeInteraccion = Mensaje | Fragmento;

/** Escenario ordenado entre Nodos (Lifelines); id en un espacio de nombres propio (puede coincidir con el de un Nodo). */
export interface Interaccion {
  id: string;
  title: string;
  description: string;
  items: ItemDeInteraccion[];
}

const referenciaOpacaSchema = z.object({ kind: z.string().min(1), ref: z.string() });

export const atributoSchema = z.object({
  name: z.string().min(1),
  type: z.string().min(1),
  notes: z.string().default(''),
  keys: z.array(z.enum(CLAVES_DE_ATRIBUTO)).min(1).optional(),
  optional: z.boolean().optional(),
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
  label: z.string().min(1).optional(),
  identifying: z.boolean().optional(),
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

const itemSchema: z.ZodType<ItemDeInteraccion> = z.lazy(() => z.union([mensajeSchema, fragmentoSchema]));

export const interaccionSchema = z.object({
  id: z.string().min(1),
  title: z.string().min(1),
  description: z.string().default(''),
  items: z.array(itemSchema).default([]),
});

const modeloSchema = z.object({
  nodes: z.array(nodoSchema),
  edges: z.array(aristaSchema).default([]),
  interactions: z.array(interaccionSchema).default([]),
});

/**
 * Sobre del Tema ya resuelto: lo unico que la Fuente canonica necesita saber de
 * el para validarse (su nombre y los nombres de Paleta que `validate` comprueba).
 * El resto del contenido (fuentes, tokens, Capas, Slots) es del paquete `tema`,
 * que lo valida con su propio esquema estricto (ADR 0008); aqui pasa tal cual.
 */
export const temaSchema = z.looseObject({
  name: z.string().min(1),
  palette: z.record(z.string(), z.string()).default({}),
});

export type Tema = z.infer<typeof temaSchema>;

/** Tipos de diagrama. */
export const TIPOS_DE_VISTA = ['architecture', 'flow', 'sequence', 'er'] as const;

/**
 * Override de presentacion de un Nodo en una Vista: solo apariencia, nunca toca
 * el Modelo. `pin` es la posicion del centro del Nodo relativa a su Grupo padre (al lienzo
 * si es raiz), aplicada despues del layout (ADR 0003). `order` se guarda pero
 * ningun paso lo usa en v1: ELK corre sin `considerModelOrder` (ADR 0003
 * enmendado), asi que no hay ordenamiento por el que consumirlo. `color` es un
 * nombre de Paleta (`validate` lo comprueba contra la Paleta del Tema).
 */
export const overrideSchema = z.object({
  node: idDeNodoSchema,
  label: z.string().optional(),
  pin: z.object({ x: z.number(), y: z.number() }).optional(),
  order: z.number().int().optional(),
  color: z.string().min(1).optional(),
});

export type OverrideDeNodo = z.infer<typeof overrideSchema>;

/** Lo que un Paso nombra: un selector de Nodos (`a`; `a.*` y `a.**` incluyen ademas al Grupo `a`) o una Arista (`a -> b`). */
const elementoDePasoSchema = z.union([
  z.object({ selector: z.string().min(1) }),
  z.object({ from: idDeNodoSchema, to: idDeNodoSchema }),
]);

/** Paso de revelado (ADR 0002): acumulativo; `show` revela y `hide` oculta lo anterior. */
export const pasoSchema = z.object({
  title: z.string(),
  show: z.array(elementoDePasoSchema).default([]),
  hide: z.array(elementoDePasoSchema).default([]),
});

export type Paso = z.infer<typeof pasoSchema>;
export type ElementoDePaso = z.infer<typeof elementoDePasoSchema>;
/** Elemento de Paso que nombra una Arista (`a -> b`). */
export type AristaDePaso = Extract<ElementoDePaso, { from: string }>;

/**
 * Vista: selecciona Nodos del Modelo con `include`/`exclude`/`depth` (ver
 * `resolveView`). Nunca define entidades nuevas.
 */
export const vistaSchema = z.object({
  id: z.string().min(1),
  type: z.enum(TIPOS_DE_VISTA),
  include: z.array(z.string().min(1)).default([]),
  exclude: z.array(z.string().min(1)).default([]),
  depth: z.number().int().min(0).optional(),
  /** Solo en Vistas `sequence`: la Interaccion que proyecta (id de `model.interactions`). */
  interaction: z.string().min(1).optional(),
  /** Solo en Vistas `sequence`: orden de las Lifelines, parcial; el resto sigue por primera aparicion. */
  order: z.array(idDeNodoSchema).default([]),
  /** Solo en Vistas `sequence`: numera los Mensajes proyectados; el numero es parte de la etiqueta. Ausente = false. */
  autonumber: z.literal(true).optional(),
  overrides: z.array(overrideSchema).default([]),
  theme: z.string().min(1).optional(),
  /**
   * Override de la Vista sobre el Tema (`theme t { layer ... }`): parches de Capa por nombre,
   * ultimo nivel de la cascada. El contenido (forma de cada parche) lo valida el paquete `tema`.
   */
  themePatch: z.array(z.looseObject({ nombre: z.string().min(1) })).optional(),
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
 * Fuente canonica. Aqui solo se validan la forma del documento y las reglas
 * estructurales de jerarquia documentadas en `index.ts`; la validacion semantica
 * por codigos (ADR 0005) es `validate`, en `validar.ts`.
 */
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
