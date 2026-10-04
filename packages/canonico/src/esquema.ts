/**
 * Esquema Zod de la Fuente canonica.
 *
 * Alcance del ticket #21: Nodos (id cualificado, `type`, titulo, descripcion,
 * jerarquia de hijos) y catalogo de Tipos de nodo. Aristas, Atributos, `source`,
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
  children: Nodo[];
}

/** Conjunto unico de Nodos del Proyecto documentado (CONTEXT.md). */
export interface Modelo {
  nodes: Nodo[];
}

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
    children: z.array(nodoSchema).default([]),
  }),
);

const catalogoSchema = z.object({
  nodeTypes: z.array(tipoDeNodoSchema),
});

const modeloSchema = z.object({
  nodes: z.array(nodoSchema),
});

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
 * - `type` declarado en el catalogo de Tipos de nodo.
 */
function hallazgosDeModelo(fuente: {
  specification: CatalogoDeTiposDeNodo;
  model: Modelo;
}): Hallazgo[] {
  const tipos = new Set(fuente.specification.nodeTypes.map((tipo) => tipo.name));

  const ids = new Set<string>();
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

  return hallazgos;
}

/** Ids de todos los Nodos, a cualquier profundidad. */
function recogerIds(nodos: Nodo[], destino: Set<string>): void {
  for (const nodo of nodos) {
    destino.add(nodo.id);
    recogerIds(nodo.children, destino);
  }
}

/** Padre jerarquico de un id cualificado; cadena vacia si el id es raiz. */
function padreDe(id: string): string {
  const corte = id.lastIndexOf('.');
  return corte === -1 ? '' : id.slice(0, corte);
}
