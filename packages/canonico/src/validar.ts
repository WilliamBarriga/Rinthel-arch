/**
 * `validate(canonico) -> issues`: las comprobaciones semanticas que operan sobre
 * la Fuente canonica ya armada (ADR 0005). Puro; nunca lanza ni muta.
 *
 * La Fuente canonica no guarda posiciones de texto: quien las tiene (el
 * compilador del DSL) las aporta con un `Ubicador`, que traduce la ruta del
 * valor culpable dentro de la Fuente (como la `path` de Zod) a archivo y rango.
 * Sin `Ubicador` el issue se situa en `(canonico):1:1` y no lleva `fix`.
 *
 * Frontera: quedan fuera lo que no es una propiedad de la Fuente ya compilada
 * (sintaxis, `E_DUPLICATE_NODE`, `E_UNKNOWN_EXTEND_TARGET`, `E_UNKNOWN_VIEW_TYPE`,
 * Temas duplicados, con ciclo o sin padre: el compilador los detecta al fusionar
 * porque despues ya no existen) y `W_OVERLAPPING_PINS`, que necesita la
 * geometria de `layout` (la emite el CLI).
 */
import { CODIGOS } from './codigos';
import { CARDINALIDADES_ER } from './esquema';
import type { ElementoDePaso, FuenteCanonica, Interaccion, ItemDeInteraccion, Nodo, Tema, Vista } from './esquema';
import type { IconProvider } from './iconos';
import type { Issue, TextRange } from './issue';
import { candidatosCercanos } from './sugerencias';
import { activacionesDe, aplanarMensajes, destinoDeRef } from './secuencia';
import type { MensajeUbicado } from './secuencia';
import { matchesSelector, resolveView } from './vistas';

/** Ruta de un valor dentro de la Fuente canonica, p. ej. `['views', 0, 'links', 1, 'view']`. */
export type RutaDeFuente = readonly (string | number)[];

/** Sitio del texto que origino un valor. */
export interface SitioDeTexto {
  file: string;
  range: TextRange;
}

/**
 * Dice donde se escribio el valor en `ruta`. `null` significa que ese valor no
 * es fiable (su archivo tiene errores de sintaxis) y no debe producir issues.
 */
export type Ubicador = (ruta: RutaDeFuente) => SitioDeTexto | null;

export interface OpcionesDeValidate {
  /** Resuelve las claves `icon` de los Tipos de nodo; sin el no se comprueban. */
  iconos?: IconProvider;
  ubicar?: Ubicador;
}

const SIN_UBICAR: SitioDeTexto = {
  file: '(canonico)',
  range: { start: { line: 1, column: 1 }, end: { line: 1, column: 1 } },
};

/** Issue en `ruta` con severidad y sitio relacionado (otra ruta de la Fuente) opcionales. */
type EmitirCon = (ruta: RutaDeFuente, code: string, message: string, extra?: { severity?: 'error' | 'warning'; hint?: string; relacionado?: { ruta: RutaDeFuente; message: string } }) => void;

type Emitir = (
  ruta: RutaDeFuente,
  code: string,
  message: string,
  escrito?: string,
  existentes?: Iterable<string>,
  /** Texto del `fix` tal como se escribe en el DSL (p. ej. entre comillas); por defecto, el candidato tal cual. */
  escribir?: (candidato: string) => string,
  /** `hint` cuando no hay ningun candidato cercano. */
  sinCandidatos?: string,
) => void;

/** Todos los issues semanticos de la Fuente, ordenados (archivo, linea, columna, codigo). */
export function validate(fuente: FuenteCanonica, opciones: OpcionesDeValidate = {}): Issue[] {
  const issues: Issue[] = [];
  const { ubicar } = opciones;

  /** Issue de error en `ruta`; con `existentes` anade `fix` (un candidato) o `hint` (varios). */
  const emitir: Emitir = (ruta, code, message, escrito, existentes, escribir = (candidato) => candidato, sinCandidatos) => {
    const sitio = ubicar === undefined ? SIN_UBICAR : ubicar(ruta);
    if (sitio === null) return;
    const { file, range } = sitio;
    const issue: Issue = { code, severity: 'error', file, ...range.start, message };
    if (escrito !== undefined && existentes !== undefined) {
      const candidatos = candidatosCercanos(escrito, existentes);
      const [unico] = candidatos;
      if (candidatos.length === 1 && unico !== undefined) {
        if (ubicar !== undefined) issue.fix = { file, range, replacement: escribir(unico) };
      } else if (candidatos.length > 1) {
        issue.hint = `Candidatos: ${candidatos.join(', ')}`;
      } else if (sinCandidatos !== undefined) {
        issue.hint = sinCandidatos;
      }
    }
    issues.push(issue);
  };

  const emitirCon: EmitirCon = (ruta, code, message, extra = {}) => {
    const sitio = ubicar === undefined ? SIN_UBICAR : ubicar(ruta);
    if (sitio === null) return;
    const issue: Issue = { code, severity: extra.severity ?? 'error', file: sitio.file, ...sitio.range.start, message };
    if (extra.hint !== undefined) issue.hint = extra.hint;
    if (extra.relacionado !== undefined) {
      const otro = ubicar === undefined ? SIN_UBICAR : ubicar(extra.relacionado.ruta);
      if (otro !== null) issue.related = [{ file: otro.file, ...otro.range.start, message: extra.relacionado.message }];
    }
    issues.push(issue);
  };

  const tipos = new Set(fuente.specification.nodeTypes.map((tipo) => tipo.name));
  validarInteracciones(fuente, emitir, emitirCon);
  validarNodos(fuente.model.nodes, ['model', 'nodes'], tipos, emitir);
  validarAristas(fuente, emitir);
  validarCatalogo(fuente, opciones.iconos, emitir);
  fuente.views.forEach((vista, indice) => {
    validarVista(fuente, vista, indice, emitir);
    validarVistaDeSecuencia(fuente, vista, indice, emitir, emitirCon);
  });

  return issues.sort(compararIssues);
}

function validarNodos(nodos: readonly Nodo[], ruta: RutaDeFuente, tipos: ReadonlySet<string>, emitir: Emitir): void {
  nodos.forEach((nodo, indice) => {
    const aqui = [...ruta, indice];
    if (!tipos.has(nodo.type)) {
      emitir(
        [...aqui, 'type'],
        CODIGOS.E_UNKNOWN_NODE_TYPE,
        `Tipo de nodo '${nodo.type}' no declarado en specification`,
        nodo.type,
        tipos,
      );
    }
    validarNodos(nodo.children, [...aqui, 'children'], tipos, emitir);
  });
}

function atributosPorNodo(nodos: readonly Nodo[], destino = new Map<string, string[]>()): Map<string, string[]> {
  for (const nodo of nodos) {
    destino.set(nodo.id, nodo.attributes.map((atributo) => atributo.name));
    atributosPorNodo(nodo.children, destino);
  }
  return destino;
}

/** Indices de las Aristas del Modelo cuyos dos extremos estan incluidos en alguna Vista ER (el primer Nodo no excluido por `exclude`). */
function aristasDeVistasEr(fuente: FuenteCanonica): Set<number> {
  const ids = todosLosIds(fuente.model.nodes);
  const incluidos = new Set<string>();
  for (const vista of fuente.views) {
    if (vista.type !== 'er') continue;
    for (const id of ids) {
      if (vista.include.some((selector) => matchesSelector(selector, id)) && !vista.exclude.some((selector) => matchesSelector(selector, id))) incluidos.add(`${vista.id}\0${id}`);
    }
  }
  const enVista = (vista: string, id: string): boolean => incluidos.has(`${vista}\0${id}`);
  const resultado = new Set<number>();
  fuente.model.edges.forEach((arista, indice) => {
    if (fuente.views.some((vista) => vista.type === 'er' && enVista(vista.id, arista.from.node) && enVista(vista.id, arista.to.node))) resultado.add(indice);
  });
  return resultado;
}

const entreComillas = (texto: string): string => `"${texto}"`;

function validarAristas(fuente: FuenteCanonica, emitir: Emitir): void {
  const atributos = atributosPorNodo(fuente.model.nodes);
  const enVistaEr = aristasDeVistasEr(fuente);
  fuente.model.edges.forEach((arista, indice) => {
    if (enVistaEr.has(indice)) {
      for (const campo of ['fromCardinality', 'toCardinality'] as const) {
        const escrita = arista[campo];
        if (escrita === undefined || (CARDINALIDADES_ER as readonly string[]).includes(escrita)) continue;
        emitir(['model', 'edges', indice, campo], CODIGOS.E_ER_CARDINALITY, `Cardinalidad '${escrita}' no valida en una Vista ER (${CARDINALIDADES_ER.join(' | ')})`, escrita, CARDINALIDADES_ER, entreComillas, `Cardinalidades validas: ${CARDINALIDADES_ER.join(', ')}`);
      }
    }
    for (const lado of ['from', 'to'] as const) {
      const { node, attribute } = arista[lado];
      const delNodo = atributos.get(node);
      const ruta = ['model', 'edges', indice, lado];
      if (delNodo === undefined) {
        emitir([...ruta, 'node'], CODIGOS.E_DANGLING_EDGE, `Arista colgante: el Nodo '${node}' no existe en el Modelo`, node, atributos.keys());
      } else if (attribute !== undefined && !delNodo.includes(attribute)) {
        emitir([...ruta, 'attribute'], CODIGOS.E_UNKNOWN_ATTRIBUTE, `El Nodo '${node}' no tiene el Atributo '${attribute}'`, attribute, delNodo);
      }
    }
  });
}

const nombresDePaleta = (temas: readonly Tema[]): string[] => temas.flatMap((tema) => Object.keys(tema.palette));

function validarCatalogo(fuente: FuenteCanonica, iconos: IconProvider | undefined, emitir: Emitir): void {
  const paleta = nombresDePaleta(fuente.themes);
  fuente.specification.nodeTypes.forEach((tipo, indice) => {
    const ruta = ['specification', 'nodeTypes', indice];
    if (iconos !== undefined && tipo.icon !== undefined && iconos.resolve(tipo.icon) === undefined) {
      emitir(
        [...ruta, 'icon'],
        CODIGOS.E_UNKNOWN_ICON,
        `Icono '${tipo.icon}' no existe (ni generico ni SVG del Workspace)`,
        tipo.icon,
        iconos.keys(),
      );
    }
    if (tipo.color !== undefined && !paleta.includes(tipo.color)) {
      emitir([...ruta, 'color'], CODIGOS.E_UNKNOWN_PALETTE_COLOR, `Color '${tipo.color}' no es un nombre de Paleta del Tema`, tipo.color, new Set(paleta));
    }
  });
}

function validarVista(fuente: FuenteCanonica, vista: Vista, indice: number, emitir: Emitir): void {
  const ruta = ['views', indice];
  const ids = fuente.views.map(({ id }) => id);

  // Tema de la Vista y colores de sus overrides.
  const tema = fuente.themes.find((candidato) => candidato.name === vista.theme);
  if (vista.theme !== undefined && tema === undefined) {
    emitir([...ruta, 'theme'], CODIGOS.E_UNKNOWN_THEME, `Tema '${vista.theme}' no declarado`, vista.theme, fuente.themes.map(({ name }) => name));
  }
  const paleta = nombresDePaleta(tema ? [tema] : fuente.themes);
  vista.overrides.forEach((override, i) => {
    if (override.color !== undefined && !paleta.includes(override.color)) {
      emitir([...ruta, 'overrides', i, 'color'], CODIGOS.E_UNKNOWN_PALETTE_COLOR, `Color '${override.color}' no es un nombre de Paleta del Tema`, override.color, new Set(paleta));
    }
  });

  // Overrides solo sobre Nodos que la Vista muestra.
  // En secuencia la Vista no selecciona Nodos: vale cualquiera que no excluya (puede ser una Lifeline fundida o el `box` de un Grupo).
  const deSecuencia = vista.type === 'sequence' ? nodosNoExcluidos(fuente.model.nodes, vista) : undefined;
  const visibles = deSecuencia ?? new Set(resolveView(fuente, vista.id)?.nodes.map((nodo) => nodo.id));
  vista.overrides.forEach((override, i) => {
    if (!visibles.has(override.node)) {
      emitir([...ruta, 'overrides', i, 'node'], CODIGOS.E_OVERRIDE_OUTSIDE_VIEW, `Override sobre '${override.node}', que la Vista '${vista.id}' no muestra`);
    }
  });

  // Drill-down: `link` a Vistas que existen; Grupos que la Vista muestra; `link` y `expanded` excluyentes.
  const grupos = new Set(
    deSecuencia === undefined
      ? resolveView(
          { ...fuente, views: [{ ...vista, collapsed: [], expanded: [], links: [], depth: undefined }] },
          vista.id,
        )?.nodes.filter((nodo) => nodo.childCount > 0).map((nodo) => nodo.id)
      : [...deSecuencia].filter((id) => gruposDe(fuente.model.nodes).has(id)),
  );
  const enlazados = new Set(vista.links.map(({ node }) => node));
  vista.links.forEach((enlace, i) => {
    if (!ids.includes(enlace.view)) {
      emitir([...ruta, 'links', i, 'view'], CODIGOS.E_UNKNOWN_VIEW_LINK, `link hacia la Vista '${enlace.view}', que no existe`, enlace.view, ids);
    }
  });
  for (const palabra of ['collapsed', 'expanded'] as const) {
    vista[palabra].forEach((destino, i) => {
      const donde = [...ruta, palabra, i];
      if (!grupos.has(destino)) {
        emitir(donde, CODIGOS.E_INVALID_EXPANSION_TARGET, `'${palabra} ${destino}': no es un Grupo que la Vista '${vista.id}' muestre`);
      } else if (palabra === 'expanded' && enlazados.has(destino)) {
        emitir(donde, CODIGOS.E_LINK_WITH_EXPANDED, `'${destino}' lleva 'link' y 'expanded': un Grupo con link no se expande`);
      }
    });
  }

  // Pasos (ADR 0002): selectores y Aristas que existen en el Modelo.
  const nodos = todosLosIds(fuente.model.nodes);
  vista.steps.forEach((paso, s) => {
    if (vista.type === 'sequence') return;
    for (const accion of ['show', 'hide'] as const) {
      paso[accion].forEach((item: ElementoDePaso, k) => {
        const donde = [...ruta, 'steps', s, accion, k];
        if ('selector' in item) {
          if (nodos.some((id) => matchesSelector(item.selector, id))) return;
          emitir([...donde, 'selector'], CODIGOS.E_UNKNOWN_STEP, `El selector '${item.selector}' no coincide con ningun Nodo del Modelo`, item.selector, nodos);
        } else if (!fuente.model.edges.some((arista) => arista.from.node === item.from && arista.to.node === item.to)) {
          emitir([...donde, 'from'], CODIGOS.E_UNKNOWN_STEP, `La Arista '${item.from} -> ${item.to}' no existe en el Modelo`, item.from, nodos);
        }
      });
    }
  });
}

/** Interacciones: ids unicos, extremos de Mensaje que son Nodos, ids de Mensaje unicos y `reply` sin `sync` abierto. */
function validarInteracciones(fuente: FuenteCanonica, emitir: Emitir, emitirCon: EmitirCon): void {
  const nodos = todosLosIds(fuente.model.nodes);
  const vistas = new Map<string, number>();
  fuente.model.interactions.forEach((interaccion, i) => {
    const ruta = ['model', 'interactions', i];
    const previa = vistas.get(interaccion.id);
    if (previa !== undefined) {
      emitirCon([...ruta, 'id'], CODIGOS.E_DUPLICATE_INTERACTION, `Interaccion duplicada '${interaccion.id}'`, { relacionado: { ruta: ['model', 'interactions', previa, 'id'], message: `Primera declaracion de '${interaccion.id}'` } });
    } else {
      vistas.set(interaccion.id, i);
    }
    const ids = new Map<string, (string | number)[]>();
    const mensajes = aplanarMensajes(interaccion.items);
    mensajes.forEach((mensaje, j) => {
      const donde = [...ruta, ...mensaje.ubicacion];
      for (const lado of ['from', 'to'] as const) {
        if (!nodos.includes(mensaje[lado])) {
          emitir([...donde, lado], CODIGOS.E_UNKNOWN_LIFELINE, `El extremo '${mensaje[lado]}' del Mensaje no es un Nodo del Modelo`, mensaje[lado], nodos);
        }
      }
      validarCicloDeVida(mensaje, j, ruta, mensajes, emitirCon);
      if (mensaje.id === undefined) return;
      const otro = ids.get(mensaje.id);
      if (otro === undefined) ids.set(mensaje.id, mensaje.ubicacion);
      else emitirCon([...donde, 'id'], CODIGOS.E_DUPLICATE_MESSAGE_ID, `Mensaje duplicado '${mensaje.id}' en la Interaccion '${interaccion.id}'`, { relacionado: { ruta: [...ruta, ...otro, 'id'], message: `Primer Mensaje '${mensaje.id}'` } });
    });
    validarOperandos(interaccion.items, [...ruta, 'items'], emitirCon);
    validarNotasYRefs(interaccion.items, [...ruta, 'items'], fuente, nodos, emitir, emitirCon);
    for (const j of activacionesDe(mensajes).respuestasSueltas) {
      const mensaje = mensajes[j]!;
      emitirCon([...ruta, ...mensaje.ubicacion, 'from'], CODIGOS.W_REPLY_WITHOUT_SYNC, `El 'reply' de '${mensaje.from}' a '${mensaje.to}' no cierra ningun 'sync' abierto`, { severity: 'warning' });
    }
  });
}

/** `create` solo en la primera aparicion del destino y ninguna aparicion despues de su `destroy` (el primero que ocurra), en orden de declaracion aun dentro de Fragmentos. */
function validarCicloDeVida(mensaje: MensajeUbicado, j: number, ruta: (string | number)[], mensajes: readonly MensajeUbicado[], emitirCon: EmitirCon): void {
  const previos = mensajes.slice(0, j);
  const primera = previos.findIndex((m) => m.from === mensaje.to || m.to === mensaje.to);
  if (mensaje.kind === 'create' && primera >= 0) {
    emitirCon([...ruta, ...mensaje.ubicacion, 'to'], CODIGOS.E_CREATE_NOT_FIRST, `'create' sobre '${mensaje.to}', que ya aparece antes en la Interaccion`, { relacionado: { ruta: [...ruta, ...previos[primera]!.ubicacion, previos[primera]!.from === mensaje.to ? 'from' : 'to'], message: `Primera aparicion de '${mensaje.to}'` } });
    return;
  }
  for (const lado of ['from', 'to'] as const) {
    const destruccion = previos.find((m) => m.kind === 'destroy' && m.to === mensaje[lado]);
    if (destruccion !== undefined) {
      emitirCon([...ruta, ...mensaje.ubicacion, lado], CODIGOS.E_AFTER_DESTROY, `'${mensaje[lado]}' aparece despues de su 'destroy'`, { relacionado: { ruta: [...ruta, ...destruccion.ubicacion, 'to'], message: `'${mensaje[lado]}' se destruye aqui` } });
      return;
    }
  }
}

/** Propiedades de Vista segun su Tipo de diagrama y la Interaccion que proyecta una Vista de secuencia. */
function validarVistaDeSecuencia(fuente: FuenteCanonica, vista: Vista, indice: number, emitir: Emitir, emitirCon: EmitirCon): void {
  const ruta = ['views', indice];
  const interacciones = fuente.model.interactions.map(({ id }) => id);
  if (vista.type !== 'sequence') {
    if (vista.interaction !== undefined) {
      emitirCon([...ruta, 'interaction'], CODIGOS.E_VIEW_PROPERTY_FOR_TYPE, `'interaction' solo vale en una Vista 'sequence', no en '${vista.type}'`, { hint: "cambia 'type' a sequence o quita 'interaction'" });
    }
    if (vista.autonumber === true) {
      emitirCon([...ruta, 'autonumber'], CODIGOS.E_VIEW_PROPERTY_FOR_TYPE, `'autonumber' solo vale en una Vista 'sequence', no en '${vista.type}'`, { hint: "cambia 'type' a sequence o quita 'autonumber'" });
    }
    if (vista.order.length > 0) {
      emitirCon([...ruta, 'order', 0], CODIGOS.E_VIEW_PROPERTY_FOR_TYPE, `'order' solo vale en una Vista 'sequence', no en '${vista.type}'`, { hint: "cambia 'type' a sequence o quita 'order'" });
    }
    if (vista.stepsEach === true) {
      emitirCon([...ruta, 'stepsEach'], CODIGOS.E_VIEW_PROPERTY_FOR_TYPE, `'steps each' solo vale en una Vista 'sequence', no en '${vista.type}'`, { hint: "usa 'step { show ... }' o cambia 'type' a sequence" });
    }
    vista.steps.forEach((paso, s) => {
      if (paso.upto !== undefined) {
        emitirCon([...ruta, 'steps', s, 'upto'], CODIGOS.E_VIEW_PROPERTY_FOR_TYPE, `'upto' solo vale en una Vista 'sequence', no en '${vista.type}'`, { hint: "usa 'show'/'hide' o cambia 'type' a sequence" });
      }
    });
    return;
  }
  if (vista.include.length > 0) {
    emitirCon([...ruta, 'include'], CODIGOS.E_VIEW_PROPERTY_FOR_TYPE, "'include' no vale en una Vista 'sequence': proyecta una Interaccion", { hint: "usa 'exclude' para quitar Lifelines" });
  }
  vista.overrides.forEach((override, i) => {
    if (override.pin !== undefined) {
      emitirCon([...ruta, 'overrides', i, 'pin'], CODIGOS.E_VIEW_PROPERTY_FOR_TYPE, "'pin' no vale en una Vista 'sequence': las columnas siguen el orden de las Lifelines", { hint: "usa 'order' para reordenar Lifelines" });
    }
  });
  const interaccion = fuente.model.interactions.find(({ id }) => id === vista.interaction);
  if (vista.interaction === undefined) {
    emitirCon([...ruta, 'id'], CODIGOS.E_SEQUENCE_WITHOUT_INTERACTION, `La Vista '${vista.id}' es 'sequence' y no declara 'interaction'`, interacciones.length > 0 ? { hint: `Interacciones: ${interacciones.join(', ')}` } : {});
  } else if (interaccion === undefined) {
    emitir([...ruta, 'interaction'], CODIGOS.E_UNKNOWN_INTERACTION, `La Interaccion '${vista.interaction}' no existe en el Modelo`, vista.interaction, interacciones);
  }
  validarPasosDeSecuencia(fuente, vista, indice, interaccion, emitir, emitirCon);
  const nodos = todosLosIds(fuente.model.nodes);
  const participantes = new Set(aplanarMensajes(interaccion?.items ?? []).flatMap((m) => [m.from, m.to]));
  vista.order.forEach((id, i) => {
    if (!nodos.includes(id)) {
      emitir([...ruta, 'order', i], CODIGOS.E_UNKNOWN_LIFELINE, `'order' nombra '${id}', que no es un Nodo del Modelo`, id, nodos);
    } else if (interaccion !== undefined && !participantes.has(id)) {
      emitirCon([...ruta, 'order', i], CODIGOS.W_ORDER_NOT_IN_INTERACTION, `'${id}' no participa en la Interaccion '${interaccion.id}'; 'order' lo ignora`, { severity: 'warning' });
    }
  });
}

/** Pasos de secuencia: `show`/`hide` no valen; `upto` nombra un Mensaje proyectado y avanza; `steps each` no convive con `step`. */
function validarPasosDeSecuencia(fuente: FuenteCanonica, vista: Vista, indice: number, interaccion: Interaccion | undefined, emitir: Emitir, emitirCon: EmitirCon): void {
  const ruta = ['views', indice];
  const mensajes = aplanarMensajes(interaccion?.items ?? []);
  const proyectados = interaccion === undefined ? [] : (resolveView(fuente, vista.id)?.interaction?.messages ?? []);
  const posicion = new Map(proyectados.flatMap((m, i) => (m.id === undefined ? [] : [[m.id, i] as const])));
  const ids = mensajes.flatMap((m) => (m.id === undefined ? [] : [m.id]));
  if (vista.stepsEach === true && vista.steps.length > 0) {
    emitirCon([...ruta, 'steps', 0, 'title'], CODIGOS.E_STEPS_EACH_WITH_STEP, "'steps each' y 'step' explicitos no se combinan en la misma Vista", { hint: "deja solo 'steps each' o solo los 'step { upto ... }'" });
  }
  let previo: { indice: number; paso: number } | undefined;
  vista.steps.forEach((paso, s) => {
    for (const accion of ['show', 'hide'] as const) {
      paso[accion].forEach((item: ElementoDePaso, k) => {
        emitirCon([...ruta, 'steps', s, accion, k, 'selector' in item ? 'selector' : 'from'], CODIGOS.E_VIEW_PROPERTY_FOR_TYPE, `'${accion}' no vale en una Vista 'sequence': un Paso es un corte del tiempo`, { hint: "usa 'step { upto <id del Mensaje> }'" });
      });
    }
    if (paso.upto === undefined || interaccion === undefined) return;
    const donde = [...ruta, 'steps', s, 'upto'];
    if (!ids.includes(paso.upto)) {
      emitir(donde, CODIGOS.E_UNKNOWN_STEP, `El Mensaje '${paso.upto}' no existe en la Interaccion '${interaccion.id}'`, paso.upto, ids, undefined, ids.length === 0 ? "ponle un id a un Mensaje: 'id: a -> b'" : undefined);
      return;
    }
    const actual = posicion.get(paso.upto);
    if (actual === undefined) {
      emitirCon(donde, CODIGOS.E_STEP_NOT_PROJECTED, `El Mensaje '${paso.upto}' no esta en la Vista '${vista.id}' (lo quitan 'depth' o 'exclude')`, { hint: "elige un Mensaje que la Vista proyecte o quita el 'exclude'" });
      return;
    }
    if (previo !== undefined && actual <= previo.indice) {
      emitirCon(donde, CODIGOS.E_STEP_NOT_ADVANCING, `El Paso '${paso.title}' no avanza: '${paso.upto}' no esta despues del Paso anterior`, { hint: 'los Pasos de secuencia solo avanzan', relacionado: { ruta: [...ruta, 'steps', previo.paso, 'upto'], message: 'Paso anterior' } });
      return;
    }
    previo = { indice: actual, paso: s };
  });
}

/** Ids de todos los Nodos que los `exclude` de la Vista no quitan. */
function nodosNoExcluidos(nodos: readonly Nodo[], vista: Vista): Set<string> {
  const todos = todosLosIds(nodos);
  return new Set(todos.filter((id) => !vista.exclude.some((selector) => matchesSelector(selector, id))));
}

/** Ids de los Nodos con hijos (Grupos). */
function gruposDe(nodos: readonly Nodo[], destino = new Set<string>()): Set<string> {
  for (const nodo of nodos) {
    if (nodo.children.length > 0) destino.add(nodo.id);
    gruposDe(nodo.children, destino);
  }
  return destino;
}

function todosLosIds(nodos: readonly Nodo[]): string[] {
  return nodos.flatMap((nodo) => [nodo.id, ...todosLosIds(nodo.children)]);
}

function compararIssues(a: Issue, b: Issue): number {
  return a.file.localeCompare(b.file) || a.line - b.line || a.column - b.column || a.code.localeCompare(b.code);
}

/** Notas sobre Nodos que existen y `ref` a Interacciones que existen (`fix` por typo); un `ref` que ninguna Vista de secuencia proyecta avisa. */
function validarNotasYRefs(items: readonly ItemDeInteraccion[], ruta: RutaDeFuente, fuente: FuenteCanonica, nodos: readonly string[], emitir: Emitir, emitirCon: EmitirCon): void {
  items.forEach((item, i) => {
    const donde = [...ruta, i];
    if (item.type === 'note') {
      item.targets.forEach((id, t) => {
        if (!nodos.includes(id)) emitir([...donde, 'targets', t], CODIGOS.E_UNKNOWN_LIFELINE, `El objetivo '${id}' de la Nota no es un Nodo del Modelo`, id, nodos);
      });
    } else if (item.type === 'ref') {
      if (!fuente.model.interactions.some(({ id }) => id === item.interaction)) {
        emitir([...donde, 'interaction'], CODIGOS.E_UNKNOWN_INTERACTION, `La Interaccion '${item.interaction}' referida por 'ref' no existe en el Modelo`, item.interaction, fuente.model.interactions.map(({ id }) => id));
      } else if (destinoDeRef(fuente.views, item.interaction) === undefined) {
        emitirCon([...donde, 'interaction'], CODIGOS.W_REF_WITHOUT_VIEW, `Ninguna Vista de secuencia proyecta la Interaccion '${item.interaction}' referida por 'ref': el marco no navega`, { severity: 'warning', hint: `agrega una Vista: view ${item.interaction} { type sequence interaction ${item.interaction} }` });
      }
    } else if (item.type === 'fragment') {
      item.operands.forEach((operando, k) => validarNotasYRefs(operando.items, [...donde, 'operands', k, 'items'], fuente, nodos, emitir, emitirCon));
    }
  });
}

/** Operandos de cada Fragmento (recursivo): `else` solo en `alt`, `and` solo en `par`; un operando en los demas operadores. */
function validarOperandos(items: readonly ItemDeInteraccion[], ruta: RutaDeFuente, emitirCon: EmitirCon): void {
  items.forEach((item, i) => {
    if (item.type !== 'fragment') return;
    const donde = [...ruta, i];
    const esperado = item.operator === 'alt' ? 'else' : item.operator === 'par' ? 'and' : undefined;
    item.operands.forEach((operando, k) => {
      if (k > 0) {
        if (esperado === undefined) {
          emitirCon([...donde, 'operands', k, 'separator'], CODIGOS.E_INVALID_FRAGMENT_OPERAND, `'${item.operator}' tiene un solo operando; no admite '${operando.separator}'`, { hint: `quita el operando o usa 'alt { } else { }' / 'par { } and { }'` });
        } else if (operando.separator !== esperado) {
          emitirCon([...donde, 'operands', k, 'separator'], CODIGOS.E_INVALID_FRAGMENT_OPERAND, `'${item.operator}' separa sus operandos con '${esperado}', no con '${operando.separator}'`, { hint: `escribe '${esperado}' (\`else\` es de \`alt\`, \`and\` de \`par\`)` });
        }
      }
      validarOperandos(operando.items, [...donde, 'operands', k, 'items'], emitirCon);
    });
  });
}
