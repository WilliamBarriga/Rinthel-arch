/**
 * Comprobaciones semanticas sobre la Fuente canonica ya armada (ADR 0005). Puro; nunca lanza ni muta.
 * La Fuente no guarda posiciones: un `Ubicador` traduce la ruta del valor a archivo y rango; sin el, el issue
 * sale en `(canonico):1:1` sin `fix`. Fuera de alcance: lo que la fusion del DSL hace desaparecer (sintaxis,
 * Nodos y Temas duplicados, `extend` o `extends` sin destino, `unknown-view-type`) y `overlapping-pins`.
 */
import { CODIGOS } from './codigos';
import { CARDINALIDADES_ER } from './esquema';
import { VALORES_DE_CATALOGO_ANTIGUOS, mensajeDeValorAntiguo, renombreAntiguo } from './nombres-antiguos';
import type { ElementoDePaso, FuenteCanonica, Interaccion, ItemDeInteraccion, Nodo, Tema, Vista } from './esquema';
import type { IconProvider } from './iconos';
import type { Issue, TextRange } from './issue';
import { candidatosCercanos } from './sugerencias';
import { activacionesDe, aplanarMensajes, destinoDeRef } from './secuencia';
import type { MensajeUbicado } from './secuencia';
import { matchesSelector, resolveView } from './vistas';

/** Ruta de un valor dentro de la Fuente canonica, p. ej. `['views', 0, 'links', 1, 'view']`. */
export type RutaDeFuente = readonly (string | number)[];

export interface SitioDeTexto {
  file: string;
  range: TextRange;
}

/** `null`: el valor no es fiable (su archivo tiene errores de sintaxis) y no produce issues. */
export type Ubicador = (ruta: RutaDeFuente) => SitioDeTexto | null;

export interface OpcionesDeValidate {
  /** Sin el, las claves `icon` no se comprueban. */
  iconos?: IconProvider;
  ubicar?: Ubicador;
}

const SIN_UBICAR: SitioDeTexto = {
  file: '(canonico)',
  range: { start: { line: 1, column: 1 }, end: { line: 1, column: 1 } },
};

/** Issue en `ruta` con severidad y sitio relacionado (otra ruta de la Fuente) opcionales. */
type EmitirCon = (ruta: RutaDeFuente, code: string, message: string, extra?: { severity?: 'error' | 'warning'; hint?: string; /** Reemplazo del texto situado en `ruta` (un `fix` que lo reescribe). */ reemplazo?: string; relacionado?: { ruta: RutaDeFuente; message: string } }) => void;

type Emitir = (
  ruta: RutaDeFuente,
  code: string,
  message: string,
  escrito?: string,
  existentes?: Iterable<string>,
  /** Texto del `fix` tal como se escribe en el DSL (p. ej. entre comillas); por defecto, el candidato tal cual. */
  escribir?: (candidato: string) => string,
  /** `hint` sin ningun candidato cercano. */
  sinCandidatos?: string,
) => void;

/** Issues ordenados por archivo, linea, columna y codigo. */
export function validate(fuente: FuenteCanonica, opciones: OpcionesDeValidate = {}): Issue[] {
  const issues: Issue[] = [];
  const { ubicar } = opciones;

  /** Con `existentes` anade `fix` (un candidato) o `hint` (varios). */
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
        issue.hint = `Candidates: ${candidatos.join(', ')}`;
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
    if (extra.reemplazo !== undefined && ubicar !== undefined) issue.fix = { file: sitio.file, range: sitio.range, replacement: extra.reemplazo };
    if (extra.relacionado !== undefined) {
      const otro = ubicar === undefined ? SIN_UBICAR : ubicar(extra.relacionado.ruta);
      if (otro !== null) issue.related = [{ file: otro.file, ...otro.range.start, message: extra.relacionado.message }];
    }
    issues.push(issue);
  };

  const tipos = new Set(fuente.specification.nodeTypes.map((tipo) => tipo.name));
  validarInteracciones(fuente, emitir, emitirCon);
  validarNodos(fuente.model.nodes, ['model', 'nodes'], tipos, emitir);
  validarGruposPlaneados(fuente.model.nodes, ['model', 'nodes'], emitirCon);
  validarAristas(fuente, emitir);
  validarCatalogo(fuente, opciones.iconos, emitir);
  fuente.views.forEach((vista, indice) => {
    validarVista(fuente, vista, indice, emitir, emitirCon);
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
        `Node kind '${nodo.type}' is not declared in specification`,
        nodo.type,
        tipos,
      );
    }
    validarNodos(nodo.children, [...aqui, 'children'], tipos, emitir);
  });
}

/** Tiene Source `path`: ya existe en el codigo (ADR 0010, 0011). */
const esReal = (nodo: Nodo): boolean => nodo.source.some((referencia) => referencia.kind === 'path');

/**
 * Un Grupo marcado `planned` con descendientes reales (Source `path`) los dibujaria planeados: un error por Grupo,
 * en su marca, con `fix` que la quita y el primer descendiente real como sitio relacionado.
 */
function validarGruposPlaneados(nodos: readonly Nodo[], ruta: RutaDeFuente, emitirCon: EmitirCon): void {
  nodos.forEach((nodo, indice) => {
    const aqui = [...ruta, indice];
    if (nodo.planned === true) {
      const reales = descendientesReales(nodo.children, [...aqui, 'children']);
      // Marcado `planned` y con Source `path`: ya existe en el codigo; quitar la marca es el arreglo.
      if (esReal(nodo)) {
        emitirCon([...aqui, 'planned'], CODIGOS.W_PLANNED_WITH_PATH, `Node '${nodo.id}' is marked planned but has a Source path, so it already exists in the code; remove planned or the path`, { severity: 'warning', reemplazo: '' });
      }
      const [primero] = reales;
      if (primero !== undefined) {
        const cuales = reales.length === 1 ? `the real Node '${primero.nodo.id}'` : `${reales.length} real Nodes (first '${primero.nodo.id}')`;
        emitirCon([...aqui, 'planned'], CODIGOS.E_REAL_NODE_IN_PLANNED_GROUP, `Group '${nodo.id}' is marked planned but contains ${cuales} with a Source path; remove the Group's mark or move the real Nodes out of it`, {
          reemplazo: '',
          relacionado: { ruta: [...primero.ruta, 'name'], message: `'${primero.nodo.id}' has a Source path` },
        });
      }
    }
    validarGruposPlaneados(nodo.children, [...aqui, 'children'], emitirCon);
  });
}

function descendientesReales(nodos: readonly Nodo[], ruta: RutaDeFuente): { nodo: Nodo; ruta: RutaDeFuente }[] {
  return nodos.flatMap((nodo, indice) => [...(esReal(nodo) ? [{ nodo, ruta: [...ruta, indice] }] : []), ...descendientesReales(nodo.children, [...ruta, indice, 'children'])]);
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
        emitir(['model', 'edges', indice, campo], CODIGOS.E_ER_CARDINALITY, `Cardinality '${escrita}' is not valid in an ER View (${CARDINALIDADES_ER.join(' | ')})`, escrita, CARDINALIDADES_ER, entreComillas, `Cardinalidades validas: ${CARDINALIDADES_ER.join(', ')}`);
      }
    }
    for (const lado of ['from', 'to'] as const) {
      const { node, attribute } = arista[lado];
      const delNodo = atributos.get(node);
      const ruta = ['model', 'edges', indice, lado];
      if (delNodo === undefined) {
        emitir([...ruta, 'node'], CODIGOS.E_DANGLING_EDGE, `Dangling Edge: Node '${node}' does not exist in the Model`, node, atributos.keys());
      } else if (attribute !== undefined && !delNodo.includes(attribute)) {
        emitir([...ruta, 'attribute'], CODIGOS.E_UNKNOWN_ATTRIBUTE, `Node '${node}' has no Attribute '${attribute}'`, attribute, delNodo);
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
        `Icon '${tipo.icon}' does not exist (neither a generic icon nor an SVG in the Workspace)`,
        tipo.icon,
        iconos.keys(),
      );
    }
    if (tipo.color !== undefined && !paleta.includes(tipo.color)) {
      emitir([...ruta, 'color'], CODIGOS.E_UNKNOWN_PALETTE_COLOR, `Color '${tipo.color}' is not a Palette name of the Theme`, tipo.color, new Set(paleta));
    }
  });
}

function validarVista(fuente: FuenteCanonica, vista: Vista, indice: number, emitir: Emitir, emitirCon: EmitirCon): void {
  const ruta = ['views', indice];
  const ids = fuente.views.map(({ id }) => id);

  const tema = fuente.themes.find((candidato) => candidato.name === vista.theme);
  const nuevoTema = vista.theme === undefined ? undefined : renombreAntiguo(VALORES_DE_CATALOGO_ANTIGUOS, 'theme', vista.theme);
  if (vista.theme !== undefined && tema === undefined && nuevoTema !== undefined && fuente.themes.some(({ name }) => name === nuevoTema)) {
    emitirCon([...ruta, 'theme'], CODIGOS.E_OLD_CATALOG_VALUE, mensajeDeValorAntiguo('theme', vista.theme, nuevoTema), { reemplazo: nuevoTema });
  } else if (vista.theme !== undefined && tema === undefined) {
    emitir([...ruta, 'theme'], CODIGOS.E_UNKNOWN_THEME, `Theme '${vista.theme}' is not declared`, vista.theme, fuente.themes.map(({ name }) => name));
  }
  const paleta = nombresDePaleta(tema ? [tema] : fuente.themes);
  vista.overrides.forEach((override, i) => {
    if (override.color !== undefined && !paleta.includes(override.color)) {
      emitir([...ruta, 'overrides', i, 'color'], CODIGOS.E_UNKNOWN_PALETTE_COLOR, `Color '${override.color}' is not a Palette name of the Theme`, override.color, new Set(paleta));
    }
  });

  // En secuencia la Vista no selecciona Nodos: vale cualquiera no excluido (Lifeline fundida o `box` de un Grupo).
  const deSecuencia = vista.type === 'sequence' ? nodosNoExcluidos(fuente.model.nodes, vista) : undefined;
  const visibles = deSecuencia ?? new Set(resolveView(fuente, vista.id)?.nodes.map((nodo) => nodo.id));
  vista.overrides.forEach((override, i) => {
    if (!visibles.has(override.node)) {
      emitir([...ruta, 'overrides', i, 'node'], CODIGOS.E_OVERRIDE_OUTSIDE_VIEW, `Override on '${override.node}', which View '${vista.id}' does not show`);
    }
  });

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
      emitir([...ruta, 'links', i, 'view'], CODIGOS.E_UNKNOWN_VIEW_LINK, `link to View '${enlace.view}', which does not exist`, enlace.view, ids);
    }
  });
  // En secuencia `expanded` ya da view-property-for-type; no se emite otro issue sobre el.
  for (const palabra of vista.type === 'sequence' ? (['collapsed'] as const) : (['collapsed', 'expanded'] as const)) {
    vista[palabra].forEach((destino, i) => {
      const donde = [...ruta, palabra, i];
      if (!grupos.has(destino)) {
        emitir(donde, CODIGOS.E_INVALID_EXPANSION_TARGET, `'${palabra} ${destino}': not a Group that View '${vista.id}' shows`);
      } else if (palabra === 'expanded' && enlazados.has(destino)) {
        emitir(donde, CODIGOS.E_LINK_WITH_EXPANDED, `'${destino}' has both 'link' and 'expanded': a Group with a link is not expanded`);
      }
    });
  }

  const nodos = todosLosIds(fuente.model.nodes);
  vista.steps.forEach((paso, s) => {
    if (vista.type === 'sequence') return;
    for (const accion of ['show', 'hide'] as const) {
      paso[accion].forEach((item: ElementoDePaso, k) => {
        const donde = [...ruta, 'steps', s, accion, k];
        if ('selector' in item) {
          if (nodos.some((id) => matchesSelector(item.selector, id))) return;
          emitir([...donde, 'selector'], CODIGOS.E_UNKNOWN_STEP, `Selector '${item.selector}' matches no Node in the Model`, item.selector, nodos);
        } else if (!fuente.model.edges.some((arista) => arista.from.node === item.from && arista.to.node === item.to)) {
          emitir([...donde, 'from'], CODIGOS.E_UNKNOWN_STEP, `Edge '${item.from} -> ${item.to}' does not exist in the Model`, item.from, nodos);
        }
      });
    }
  });
}

/** Interactions: unique ids, Message ends that are Nodes, unique Message ids and `reply` without an open `sync`. */
function validarInteracciones(fuente: FuenteCanonica, emitir: Emitir, emitirCon: EmitirCon): void {
  const nodos = todosLosIds(fuente.model.nodes);
  const vistas = new Map<string, number>();
  fuente.model.interactions.forEach((interaccion, i) => {
    const ruta = ['model', 'interactions', i];
    const previa = vistas.get(interaccion.id);
    if (previa !== undefined) {
      emitirCon([...ruta, 'id'], CODIGOS.E_DUPLICATE_INTERACTION, `Duplicate Interaction '${interaccion.id}'`, { relacionado: { ruta: ['model', 'interactions', previa, 'id'], message: `First declaration of '${interaccion.id}'` } });
    } else {
      vistas.set(interaccion.id, i);
    }
    const ids = new Map<string, (string | number)[]>();
    const mensajes = aplanarMensajes(interaccion.items);
    mensajes.forEach((mensaje, j) => {
      const donde = [...ruta, ...mensaje.ubicacion];
      for (const lado of ['from', 'to'] as const) {
        if (!nodos.includes(mensaje[lado])) {
          emitir([...donde, lado], CODIGOS.E_UNKNOWN_LIFELINE, `The end '${mensaje[lado]}' of the Message is not a Node of the Model`, mensaje[lado], nodos);
        }
      }
      validarCicloDeVida(mensaje, j, ruta, mensajes, emitirCon);
      if (mensaje.id === undefined) return;
      const otro = ids.get(mensaje.id);
      if (otro === undefined) ids.set(mensaje.id, mensaje.ubicacion);
      else emitirCon([...donde, 'id'], CODIGOS.E_DUPLICATE_MESSAGE_ID, `Duplicate Message '${mensaje.id}' in Interaction '${interaccion.id}'`, { relacionado: { ruta: [...ruta, ...otro, 'id'], message: `First Message '${mensaje.id}'` } });
    });
    validarOperandos(interaccion.items, [...ruta, 'items'], emitirCon);
    validarNotasYRefs(interaccion.items, [...ruta, 'items'], fuente, nodos, emitir, emitirCon);
    for (const j of activacionesDe(mensajes).respuestasSueltas) {
      const mensaje = mensajes[j]!;
      emitirCon([...ruta, ...mensaje.ubicacion, 'from'], CODIGOS.W_REPLY_WITHOUT_SYNC, `The 'reply' from '${mensaje.from}' to '${mensaje.to}' closes no open 'sync'`, { severity: 'warning' });
    }
  });
}

/** `create` solo en la primera aparicion del destino y ninguna aparicion despues de su `destroy` (el primero que ocurra), en orden de declaracion aun dentro de Fragmentos. */
function validarCicloDeVida(mensaje: MensajeUbicado, j: number, ruta: (string | number)[], mensajes: readonly MensajeUbicado[], emitirCon: EmitirCon): void {
  const previos = mensajes.slice(0, j);
  const primera = previos.findIndex((m) => m.from === mensaje.to || m.to === mensaje.to);
  if (mensaje.kind === 'create' && primera >= 0) {
    emitirCon([...ruta, ...mensaje.ubicacion, 'to'], CODIGOS.E_CREATE_NOT_FIRST, `'create' on '${mensaje.to}', which already appears earlier in the Interaction`, { relacionado: { ruta: [...ruta, ...previos[primera]!.ubicacion, previos[primera]!.from === mensaje.to ? 'from' : 'to'], message: `First appearance of '${mensaje.to}'` } });
    return;
  }
  for (const lado of ['from', 'to'] as const) {
    const destruccion = previos.find((m) => m.kind === 'destroy' && m.to === mensaje[lado]);
    if (destruccion !== undefined) {
      emitirCon([...ruta, ...mensaje.ubicacion, lado], CODIGOS.E_AFTER_DESTROY, `'${mensaje[lado]}' appears after its 'destroy'`, { relacionado: { ruta: [...ruta, ...destruccion.ubicacion, 'to'], message: `'${mensaje[lado]}' is destroyed here` } });
      return;
    }
  }
}

/** `donde`: una ruta por aparicion en la Vista. */
interface PropiedadSoloDeSecuencia {
  nombre: string;
  donde: (vista: Vista) => Array<Array<string | number>>;
  hint: string;
}

const PROPIEDADES_SOLO_DE_SECUENCIA: readonly PropiedadSoloDeSecuencia[] = [
  { nombre: 'interaction', donde: (v) => (v.interaction === undefined ? [] : [['interaction']]), hint: "change 'type' to sequence or remove 'interaction'" },
  { nombre: 'autonumber', donde: (v) => (v.autonumber === true ? [['autonumber']] : []), hint: "change 'type' to sequence or remove 'autonumber'" },
  { nombre: 'order', donde: (v) => (v.order.length > 0 ? [['order', 0]] : []), hint: "change 'type' to sequence or remove 'order'" },
  { nombre: 'steps each', donde: (v) => (v.stepsEach === true ? [['stepsEach']] : []), hint: "use 'step { show ... }' or change 'type' to sequence" },
  { nombre: 'upto', donde: (v) => v.steps.flatMap((paso, s) => (paso.upto === undefined ? [] : [['steps', s, 'upto']])), hint: "use 'show'/'hide' or change 'type' to sequence" },
];

/** Propiedades de Vista segun su Tipo de diagrama y la Interaccion que proyecta una Vista de secuencia. */
function validarVistaDeSecuencia(fuente: FuenteCanonica, vista: Vista, indice: number, emitir: Emitir, emitirCon: EmitirCon): void {
  const ruta = ['views', indice];
  const interacciones = fuente.model.interactions.map(({ id }) => id);
  if (vista.type !== 'sequence') {
    for (const propiedad of PROPIEDADES_SOLO_DE_SECUENCIA) {
      for (const donde of propiedad.donde(vista)) {
        emitirCon([...ruta, ...donde], CODIGOS.E_VIEW_PROPERTY_FOR_TYPE, `'${propiedad.nombre}' is only valid in a 'sequence' View, not in '${vista.type}'`, { hint: propiedad.hint });
      }
    }
    return;
  }
  if (vista.include.length > 0) {
    emitirCon([...ruta, 'include'], CODIGOS.E_VIEW_PROPERTY_FOR_TYPE, "'include' is not valid in a 'sequence' View: it projects an Interaction", { hint: "use 'exclude' to remove Lifelines" });
  }
  if (vista.expanded.length > 0) {
    emitirCon([...ruta, 'expanded', 0], CODIGOS.E_VIEW_PROPERTY_FOR_TYPE, "'expanded' is not valid in a 'sequence' View: Lifelines are merged with 'collapsed' or 'depth'", { hint: "remove 'expanded'; use 'collapsed' or 'depth' to merge Groups" });
  }
  vista.overrides.forEach((override, i) => {
    if (override.pin !== undefined) {
      emitirCon([...ruta, 'overrides', i, 'pin'], CODIGOS.E_VIEW_PROPERTY_FOR_TYPE, "'pin' is not valid in a 'sequence' View: columns follow the order of the Lifelines", { hint: "use 'order' to reorder Lifelines" });
    }
  });
  const interaccion = fuente.model.interactions.find(({ id }) => id === vista.interaction);
  if (vista.interaction === undefined) {
    emitirCon([...ruta, 'id'], CODIGOS.E_SEQUENCE_WITHOUT_INTERACTION, `View '${vista.id}' is 'sequence' and does not declare 'interaction'`, interacciones.length > 0 ? { hint: `Interactions: ${interacciones.join(', ')}` } : {});
  } else if (interaccion === undefined) {
    emitir([...ruta, 'interaction'], CODIGOS.E_UNKNOWN_INTERACTION, `Interaction '${vista.interaction}' does not exist in the Model`, vista.interaction, interacciones);
  }
  validarPasosDeSecuencia(fuente, vista, indice, interaccion, emitir, emitirCon);
  const nodos = todosLosIds(fuente.model.nodes);
  const participantes = new Set(aplanarMensajes(interaccion?.items ?? []).flatMap((m) => [m.from, m.to]));
  if (interaccion !== undefined) {
    // Una Lifeline es un participante, o un Grupo que contiene a uno (cuando `depth`/`collapsed` los funde en el).
    const posibles = nodosNoExcluidos(fuente.model.nodes, vista);
    const lifelines = new Set([...participantes].flatMap((id) => id.split('.').map((_, i, partes) => partes.slice(0, i + 1).join('.'))).filter((id) => posibles.has(id)));
    vista.links.forEach((enlace, i) => {
      if (!lifelines.has(enlace.node)) {
        emitirCon([...ruta, 'links', i, 'view'], CODIGOS.E_LINK_NOT_LIFELINE, `'link ${enlace.node}': in a 'sequence' View only a Lifeline can link, and '${enlace.node}' is not one`, { hint: 'link from a Lifeline (a Node that takes part in the Interaction); a Message, Note or Fragment does not navigate by link' });
      }
    });
  }
  vista.order.forEach((id, i) => {
    if (!nodos.includes(id)) {
      emitir([...ruta, 'order', i], CODIGOS.E_UNKNOWN_LIFELINE, `'order' names '${id}', which is not a Node of the Model`, id, nodos);
    } else if (interaccion !== undefined && !participantes.has(id)) {
      emitirCon([...ruta, 'order', i], CODIGOS.W_ORDER_NOT_IN_INTERACTION, `'${id}' does not take part in Interaction '${interaccion.id}'; 'order' ignores it`, { severity: 'warning' });
    }
  });
}

/** Pasos de secuencia: `show`/`hide` no valen; `upto` nombra un Mensaje proyectado y avanza; `steps each` no convive con `step`. */
function validarPasosDeSecuencia(fuente: FuenteCanonica, vista: Vista, indice: number, interaccion: Interaccion | undefined, emitir: Emitir, emitirCon: EmitirCon): void {
  const ruta = ['views', indice];
  const mensajes = aplanarMensajes(interaccion?.items ?? []);
  const resuelta = interaccion === undefined ? undefined : resolveView(fuente, vista.id);
  const proyectados = resuelta?.type === 'sequence' ? resuelta.interaction.messages : [];
  const posicion = new Map(proyectados.flatMap((m, i) => (m.id === undefined ? [] : [[m.id, i] as const])));
  const ids = mensajes.flatMap((m) => (m.id === undefined ? [] : [m.id]));
  if (vista.stepsEach === true && vista.steps.length > 0) {
    emitirCon([...ruta, 'steps', 0, 'title'], CODIGOS.E_STEPS_EACH_WITH_STEP, "explicit 'steps each' and 'step' cannot be combined in the same View", { hint: "keep only 'steps each' or only the 'step { upto ... }' blocks" });
  }
  let previo: { indice: number; paso: number } | undefined;
  vista.steps.forEach((paso, s) => {
    for (const accion of ['show', 'hide'] as const) {
      paso[accion].forEach((item: ElementoDePaso, k) => {
        emitirCon([...ruta, 'steps', s, accion, k, 'selector' in item ? 'selector' : 'from'], CODIGOS.E_VIEW_PROPERTY_FOR_TYPE, `'${accion}' is not valid in a 'sequence' View: a Step is a cut in time`, { hint: "use 'step { upto <Message id> }'" });
      });
    }
    if (paso.upto === undefined || interaccion === undefined) return;
    const donde = [...ruta, 'steps', s, 'upto'];
    if (!ids.includes(paso.upto)) {
      emitir(donde, CODIGOS.E_UNKNOWN_STEP, `Message '${paso.upto}' does not exist in Interaction '${interaccion.id}'`, paso.upto, ids, undefined, ids.length === 0 ? "give a Message an id: 'id: a -> b'" : undefined);
      return;
    }
    const actual = posicion.get(paso.upto);
    if (actual === undefined) {
      emitirCon(donde, CODIGOS.E_STEP_NOT_PROJECTED, `Message '${paso.upto}' is not in View '${vista.id}' ('depth' or 'exclude' removes it)`, { hint: "pick a Message the View projects or remove the 'exclude'" });
      return;
    }
    if (previo !== undefined && actual <= previo.indice) {
      emitirCon(donde, CODIGOS.E_STEP_NOT_ADVANCING, `Step '${paso.title}' does not advance: '${paso.upto}' is not after the previous Step`, { hint: 'sequence Steps only move forward', relacionado: { ruta: [...ruta, 'steps', previo.paso, 'upto'], message: 'Previous Step' } });
      return;
    }
    previo = { indice: actual, paso: s };
  });
}

function nodosNoExcluidos(nodos: readonly Nodo[], vista: Vista): Set<string> {
  const todos = todosLosIds(nodos);
  return new Set(todos.filter((id) => !vista.exclude.some((selector) => matchesSelector(selector, id))));
}

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
        if (!nodos.includes(id)) emitir([...donde, 'targets', t], CODIGOS.E_UNKNOWN_LIFELINE, `The target '${id}' of the Note is not a Node of the Model`, id, nodos);
      });
    } else if (item.type === 'ref') {
      if (!fuente.model.interactions.some(({ id }) => id === item.interaction)) {
        emitir([...donde, 'interaction'], CODIGOS.E_UNKNOWN_INTERACTION, `Interaction '${item.interaction}' referenced by 'ref' does not exist in the Model`, item.interaction, fuente.model.interactions.map(({ id }) => id));
      } else if (destinoDeRef(fuente.views, item.interaction) === undefined) {
        emitirCon([...donde, 'interaction'], CODIGOS.W_REF_WITHOUT_VIEW, `No sequence View projects Interaction '${item.interaction}' referenced by 'ref': the frame does not navigate`, { severity: 'warning', hint: `add a View: view ${item.interaction} { type sequence interaction ${item.interaction} }` });
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
          emitirCon([...donde, 'operands', k, 'separator'], CODIGOS.E_INVALID_FRAGMENT_OPERAND, `'${item.operator}' has a single operand; it does not accept '${operando.separator}'`, { hint: `remove the operand or use 'alt { } else { }' / 'par { } and { }'` });
        } else if (operando.separator !== esperado) {
          emitirCon([...donde, 'operands', k, 'separator'], CODIGOS.E_INVALID_FRAGMENT_OPERAND, `'${item.operator}' separates its operands with '${esperado}', not with '${operando.separator}'`, { hint: `write '${esperado}' (\`else\` belongs to \`alt\`, \`and\` to \`par\`)` });
        }
      }
      validarOperandos(operando.items, [...donde, 'operands', k, 'items'], emitirCon);
    });
  });
}
