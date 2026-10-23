/**
 * Catalogo de codigos de issue (ADR 0005).
 *
 * Los codigos son contrato publico: estables, documentados y **nunca se
 * reciclan**. Un codigo que se retira pasa a `CODIGOS_DEPRECADOS` y su valor no
 * vuelve a usarse en `CODIGOS`; el test `codigos.test.ts` lo comprueba. Anadir
 * un codigo es un cambio de contrato que se revisa en su ticket.
 *
 * El prefijo (`E_` error, `W_` warning) documenta la severidad habitual; la
 * severidad efectiva vive en `Issue.severity`.
 *
 * Quien los emite: `validate` de este paquete (los semanticos sobre la Fuente
 * canonica), el compilador de `dsl` (sintaxis y fusion) y el CLI
 * (`W_OVERLAPPING_PINS`, que necesita la geometria).
 */
export const CODIGOS = Object.freeze({
  /** Texto del DSL que no cumple la gramatica (lexico o sintaxis). */
  E_SYNTAX_ERROR: 'E_SYNTAX_ERROR',
  /** `type` de Nodo no declarado en el catalogo de Tipos de nodo. */
  E_UNKNOWN_NODE_TYPE: 'E_UNKNOWN_NODE_TYPE',
  /** Dos Nodos con el mismo id sin que medie `extend`. */
  E_DUPLICATE_NODE: 'E_DUPLICATE_NODE',
  /** `extend <nodo>` sobre un Nodo que no existe en el Modelo. */
  E_UNKNOWN_EXTEND_TARGET: 'E_UNKNOWN_EXTEND_TARGET',
  /** Override de Vista sobre un Nodo que la Vista no muestra (o que no existe). */
  E_OVERRIDE_OUTSIDE_VIEW: 'E_OVERRIDE_OUTSIDE_VIEW',
  /** `icon` de un Tipo de nodo que ningun `IconProvider` conoce. */
  E_UNKNOWN_ICON: 'E_UNKNOWN_ICON',
  /** Extremo de Arista (Nodo) inexistente en el Modelo. */
  E_DANGLING_EDGE: 'E_DANGLING_EDGE',
  /** Extremo de Arista `nodo#atributo` sin ese Atributo en el Nodo. */
  E_UNKNOWN_ATTRIBUTE: 'E_UNKNOWN_ATTRIBUTE',
  /** Color que no es un nombre de Paleta del Tema (ADR 0002). */
  E_UNKNOWN_PALETTE_COLOR: 'E_UNKNOWN_PALETTE_COLOR',
  /** Ciclo de `extends` entre Temas. */
  E_EXTENDS_CYCLE: 'E_EXTENDS_CYCLE',
  /** Dos Temas con el mismo nombre. */
  E_DUPLICATE_THEME: 'E_DUPLICATE_THEME',
  /** Tema referenciado que no esta declarado. */
  E_UNKNOWN_THEME: 'E_UNKNOWN_THEME',
  /** `link <nodo> -> <vista>` hacia una Vista inexistente. */
  E_UNKNOWN_VIEW_LINK: 'E_UNKNOWN_VIEW_LINK',
  /** `collapsed`/`expanded` sobre un Nodo que no es Grupo o no esta en la Vista. */
  E_INVALID_EXPANSION_TARGET: 'E_INVALID_EXPANSION_TARGET',
  /** Mismo Nodo con `link` y `expanded` en la misma Vista. */
  E_LINK_WITH_EXPANDED: 'E_LINK_WITH_EXPANDED',
  /** Paso con id o selector inexistente (ADR 0002). */
  E_UNKNOWN_STEP: 'E_UNKNOWN_STEP',
  /** `type` de Vista ausente o desconocido. */
  E_UNKNOWN_VIEW_TYPE: 'E_UNKNOWN_VIEW_TYPE',
  /** Dos Pins de la Vista se solapan (warning, responsabilidad del autor). */
  W_OVERLAPPING_PINS: 'W_OVERLAPPING_PINS',
  /** Primitiva de Capa que no esta en el catalogo de Temas (ADR 0008). */
  E_THEME_UNKNOWN_PRIMITIVE: 'E_THEME_UNKNOWN_PRIMITIVE',
  /** Propiedad que la Primitiva de la Capa no declara. */
  E_THEME_UNKNOWN_PROPERTY: 'E_THEME_UNKNOWN_PROPERTY',
  /** Valor de propiedad de Capa fuera de rango, de otro tipo o ausente; nunca se recorta en silencio. */
  E_THEME_INVALID_VALUE: 'E_THEME_INVALID_VALUE',
  /** Slot que el catalogo no conoce, o repetido en el bloque `slots`. */
  E_THEME_UNKNOWN_SLOT: 'E_THEME_UNKNOWN_SLOT',
  /** Dos Capas con el mismo nombre en el mismo bloque del Tema. */
  E_THEME_DUPLICATE_LAYER: 'E_THEME_DUPLICATE_LAYER',
  /** `$token` que el Tema no declara en `tokens`. */
  E_THEME_UNKNOWN_TOKEN: 'E_THEME_UNKNOWN_TOKEN',
  /** `before`/`after` (o `none`) hacia una Capa que no existe en la pila. */
  E_THEME_UNKNOWN_LAYER: 'E_THEME_UNKNOWN_LAYER',
  /** Parche de una Capa que no existe y sin `before`/`after` que diga donde anadirla. */
  E_THEME_PATCH_WITHOUT_PLACEMENT: 'E_THEME_PATCH_WITHOUT_PLACEMENT',
  /** Parche de estado que toca las Metricas (Slots): hover nunca relayouta. */
  E_THEME_STATE_TOUCHES_METRICS: 'E_THEME_STATE_TOUCHES_METRICS',
  /** Estado que la cascada no conoce. */
  E_THEME_UNKNOWN_STATE: 'E_THEME_UNKNOWN_STATE',
  /** `use` de una Parte de Tema que no esta declarada. */
  E_THEME_UNKNOWN_PART: 'E_THEME_UNKNOWN_PART',
  /** Dos `part` con el mismo nombre en el Workspace. */
  E_DUPLICATE_PART: 'E_DUPLICATE_PART',
  /** Contraste de un Tipo y estado bajo 4.5:1 (texto) o 3:1 (graficos); aviso, no bloquea el render. */
  W_THEME_LOW_CONTRAST: 'W_THEME_LOW_CONTRAST',
  /** Dos Tipos de una Vista se distinguen solo por color de Paleta (`solo-color`); aviso. */
  W_THEME_COLOR_ONLY: 'W_THEME_COLOR_ONLY',
} as const);

/** Union de los codigos activos; `Issue.code` sigue siendo `string` (ADR 0005). */
export type Codigo = (typeof CODIGOS)[keyof typeof CODIGOS];

/**
 * Una frase por codigo activo, para el skill generado para agentes. El tipo
 * `Record<Codigo, string>` obliga a describir cada codigo nuevo.
 */
export const DESCRIPCION_DE_CODIGO: Readonly<Record<Codigo, string>> = Object.freeze({
  E_SYNTAX_ERROR: 'El texto no cumple la gramatica del DSL (lexico o sintaxis).',
  E_UNKNOWN_NODE_TYPE: 'El tipo de un Nodo no esta declarado en `specification`.',
  E_DUPLICATE_NODE: 'Dos Nodos con el mismo id sin `extend` de por medio.',
  E_UNKNOWN_EXTEND_TARGET: '`extend` sobre un Nodo que no existe en el Modelo.',
  E_OVERRIDE_OUTSIDE_VIEW: 'Override de Vista sobre un Nodo que la Vista no muestra.',
  E_UNKNOWN_ICON: 'El `icon` de un Tipo de nodo no existe (ni generico ni SVG del Workspace).',
  E_DANGLING_EDGE: 'Un extremo de Arista apunta a un Nodo que no existe.',
  E_UNKNOWN_ATTRIBUTE: 'Un extremo `nodo#atributo` nombra un Atributo que el Nodo no tiene.',
  E_UNKNOWN_PALETTE_COLOR: 'Un color no es un nombre de la Paleta del Tema (nunca hex en el Modelo).',
  E_EXTENDS_CYCLE: 'Los `extends` de los Temas forman un ciclo.',
  E_DUPLICATE_THEME: 'Dos Temas con el mismo nombre.',
  E_UNKNOWN_THEME: 'Un Tema referenciado (`theme` o `extends`) no esta declarado.',
  E_UNKNOWN_VIEW_LINK: 'Un `link` apunta a una Vista que no existe.',
  E_INVALID_EXPANSION_TARGET: '`collapsed`/`expanded` sobre un Nodo que no es Grupo o que la Vista no muestra.',
  E_LINK_WITH_EXPANDED: 'El mismo Nodo tiene `link` y `expanded` en la misma Vista.',
  E_UNKNOWN_STEP: 'Un Paso nombra un Nodo, selector o Arista que no existe.',
  E_UNKNOWN_VIEW_TYPE: 'El `type` de la Vista falta o no es `architecture` ni `flow`.',
  W_OVERLAPPING_PINS: 'Dos Nodos con `pin` se solapan en la Vista (aviso).',
  E_THEME_UNKNOWN_PRIMITIVE: 'Una Capa de Tema usa una Primitiva que no esta en el catalogo.',
  E_THEME_UNKNOWN_PROPERTY: 'Una Capa de Tema usa una propiedad que su Primitiva no declara.',
  E_THEME_INVALID_VALUE: 'Una propiedad de Capa tiene un valor ausente, de otro tipo o fuera de rango (no se recorta).',
  E_THEME_UNKNOWN_SLOT: 'Un bloque `slots` nombra un Slot desconocido o repetido.',
  E_THEME_DUPLICATE_LAYER: 'Dos Capas del mismo bloque de un Tema llevan el mismo nombre.',
  E_THEME_UNKNOWN_TOKEN: 'Un `$token` no esta declarado en el bloque `tokens` del Tema.',
  E_THEME_UNKNOWN_LAYER: 'Un `before`/`after` o un `none` nombra una Capa que no existe en la pila.',
  E_THEME_PATCH_WITHOUT_PLACEMENT: 'Un parche nombra una Capa inexistente y no dice donde anadirla (`before`/`after`).',
  E_THEME_STATE_TOUCHES_METRICS: 'Un parche de estado toca las Metricas (Slots); solo el estado base puede.',
  E_THEME_UNKNOWN_STATE: 'Un bloque `state` nombra un estado que no existe.',
  E_THEME_UNKNOWN_PART: 'Un `use` nombra una `part` no declarada.',
  E_DUPLICATE_PART: 'Dos `part` con el mismo nombre en el Workspace.',
  W_THEME_LOW_CONTRAST: 'Un Tipo de nodo y estado del Tema queda bajo el contraste minimo (4.5:1 texto, 3:1 graficos); aviso.',
  W_THEME_COLOR_ONLY: 'Dos Tipos de una Vista se distinguen solo por color de Paleta (solo-color); aviso.',
});

/**
 * Codigos retirados: ya no se emiten y su valor no se reutiliza nunca.
 * Aqui se mueve un codigo al deprecarlo, sin borrar su historial.
 */
export const CODIGOS_DEPRECADOS: readonly string[] = Object.freeze(['W_UNKNOWN_EDGE_STYLE_TYPE']);
