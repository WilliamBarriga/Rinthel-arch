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
import type { ElementoDePaso, FuenteCanonica, Nodo, Tema, Vista } from './esquema';
import type { IconProvider } from './iconos';
import type { Issue, TextRange } from './issue';
import { candidatosCercanos } from './sugerencias';
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

type Emitir = (
  ruta: RutaDeFuente,
  code: string,
  message: string,
  escrito?: string,
  existentes?: Iterable<string>,
) => void;

/** Todos los issues semanticos de la Fuente, ordenados (archivo, linea, columna, codigo). */
export function validate(fuente: FuenteCanonica, opciones: OpcionesDeValidate = {}): Issue[] {
  const issues: Issue[] = [];
  const { ubicar } = opciones;

  /** Issue de error en `ruta`; con `existentes` anade `fix` (un candidato) o `hint` (varios). */
  const emitir: Emitir = (ruta, code, message, escrito, existentes) => {
    const sitio = ubicar === undefined ? SIN_UBICAR : ubicar(ruta);
    if (sitio === null) return;
    const { file, range } = sitio;
    const issue: Issue = { code, severity: 'error', file, ...range.start, message };
    if (escrito !== undefined && existentes !== undefined) {
      const candidatos = candidatosCercanos(escrito, existentes);
      const [unico] = candidatos;
      if (candidatos.length === 1 && unico !== undefined) {
        if (ubicar !== undefined) issue.fix = { file, range, replacement: unico };
      } else if (candidatos.length > 1) {
        issue.hint = `Candidatos: ${candidatos.join(', ')}`;
      }
    }
    issues.push(issue);
  };

  const tipos = new Set(fuente.specification.nodeTypes.map((tipo) => tipo.name));
  validarNodos(fuente.model.nodes, ['model', 'nodes'], tipos, emitir);
  validarAristas(fuente, emitir);
  validarCatalogo(fuente, opciones.iconos, emitir);
  fuente.views.forEach((vista, indice) => validarVista(fuente, vista, indice, emitir));

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

function validarAristas(fuente: FuenteCanonica, emitir: Emitir): void {
  const atributos = atributosPorNodo(fuente.model.nodes);
  fuente.model.edges.forEach((arista, indice) => {
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
  const visibles = new Set(resolveView(fuente, vista.id)?.nodes.map((nodo) => nodo.id));
  vista.overrides.forEach((override, i) => {
    if (!visibles.has(override.node)) {
      emitir([...ruta, 'overrides', i, 'node'], CODIGOS.E_OVERRIDE_OUTSIDE_VIEW, `Override sobre '${override.node}', que la Vista '${vista.id}' no muestra`);
    }
  });

  // Drill-down: `link` a Vistas que existen; Grupos que la Vista muestra; `link` y `expanded` excluyentes.
  const grupos = new Set(
    resolveView(
      { ...fuente, views: [{ ...vista, collapsed: [], expanded: [], links: [], depth: undefined }] },
      vista.id,
    )?.nodes.filter((nodo) => nodo.childCount > 0).map((nodo) => nodo.id),
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

function todosLosIds(nodos: readonly Nodo[]): string[] {
  return nodos.flatMap((nodo) => [nodo.id, ...todosLosIds(nodo.children)]);
}

function compararIssues(a: Issue, b: Issue): number {
  return a.file.localeCompare(b.file) || a.line - b.line || a.column - b.column || a.code.localeCompare(b.code);
}
