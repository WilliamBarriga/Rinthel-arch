/**
 * Compilador del DSL de texto: parsea cada archivo con la gramatica derivada de
 * LikeC4 (Langium) y traduce el AST a la Fuente canonica. Puro: no lee disco.
 */
import { CODIGOS, TIPOS_DE_VISTA, combineIconProviders, fuenteCanonicaSchema, genericIcons, matchesSelector, workspaceIcons, resolveView, vistaSchema } from 'canonico';
import type {
  Arista,
  Atributo,
  ElementoDePaso,
  Extremo,
  FuenteCanonica,
  Issue,
  Nodo,
  OverrideDeNodo,
  Paso,
  ReferenciaOpaca,
  Tema,
  TextRange,
  TipoDeNodo,
  Vista,
} from 'canonico';
import {
  EmptyFileSystem,
  GrammarUtils,
  createDefaultCoreModule,
  createDefaultSharedCoreModule,
  inject,
} from 'langium';
import type { AstNode, LangiumCoreServices, ParseResult } from 'langium';

import { DiagramasGeneratedModule, DiagramasGeneratedSharedModule } from './generated/module';
import type { Attrs, Documento, Edge, Element, Endpoint, Extend, NodeOverride, NodeTypeProperty, Source, Step, View } from './generated/ast';
import { candidatosCercanos } from './sugerencias';
import { resolverTemas } from './temas';
import type { TemaDeclarado } from './temas';

/** Mapa ruta -> texto del Workspace. El nucleo no lee disco. */
export type ArchivosDelWorkspace = Readonly<Record<string, string>>;

export interface ResultadoDeCompilacion {
  /** Presente solo si no hay issues con severidad `error`. */
  canonico?: FuenteCanonica;
  /** Todos los issues, ordenados por archivo, linea, columna y codigo. */
  issues: Issue[];
}

let memoServicios: LangiumCoreServices | undefined;

/** Servicios de Langium, construidos una vez (memo inmutable: no guarda estado entre llamadas). */
function servicios(): LangiumCoreServices {
  if (memoServicios === undefined) {
    const shared = inject(createDefaultSharedCoreModule(EmptyFileSystem), DiagramasGeneratedSharedModule);
    memoServicios = inject(createDefaultCoreModule({ shared }), DiagramasGeneratedModule);
    shared.ServiceRegistry.register(memoServicios);
  }
  return memoServicios;
}

export function compile(workspace: ArchivosDelWorkspace): ResultadoDeCompilacion {
  const issues: Issue[] = [];
  const tiposDeNodo: TipoDeNodo[] = [];
  const conSintaxisRota = new Set<string>();
  const temasDeclarados: TemaDeclarado[] = [];
  const tiposConIcono: { archivo: string; prop: NodeTypeProperty }[] = [];
  const tiposConColor: { archivo: string; prop: NodeTypeProperty }[] = [];
  const vistas: { vista: Vista; archivo: string; ast: View }[] = [];
  const raices: { archivo: string; elementos: Element[]; aristas: Edge[]; extensiones: Extend[] }[] = [];

  for (const archivo of Object.keys(workspace).sort()) {
    if (archivo.endsWith('.svg')) continue;
    const texto = workspace[archivo] as string;
    const resultado = servicios().parser.LangiumParser.parse<Documento>(texto);
    const deSintaxis = issuesDeSintaxis(archivo, texto, resultado);
    issues.push(...deSintaxis);
    if (deSintaxis.length > 0) conSintaxisRota.add(archivo);

    for (const spec of resultado.value.specifications) {
      for (const decl of spec.nodeTypes) {
        const tipo: TipoDeNodo = { name: decl.name, description: '' };
        for (const prop of decl.props) {
          const valor = prop.value;
          if (prop.key === 'color') tiposConColor.push({ archivo, prop });
          if (prop.key === 'icon') tiposConIcono.push({ archivo, prop });
          if (prop.key === 'description') tipo.description = valor;
          else tipo[prop.key] = valor;
        }
        tiposDeNodo.push(tipo);
      }
    }
    for (const tema of resultado.value.themes) {
      temasDeclarados.push({
        archivo,
        ast: tema,
        nombre: rangoDe(tema, 'name'),
        padre: rangoDe(tema, 'parent'),
      });
    }
    for (const vista of resultado.value.views) {
      const compilada = compilarVista(vista, archivo, issues);
      if (compilada !== undefined) vistas.push({ vista: compilada, archivo, ast: vista });
    }
    for (const modelo of resultado.value.models) {
      raices.push({
        archivo,
        elementos: modelo.elements,
        aristas: modelo.edges,
        extensiones: modelo.extensions,
      });
    }
  }

  const declarados = new Set(tiposDeNodo.map((tipo) => tipo.name));
  const registro = new Map<string, NodoRegistrado>();
  const contexto: Contexto = { declarados, registro, issues };
  const nodos: Nodo[] = [];
  for (const { archivo, elementos } of raices) {
    for (const elemento of elementos) {
      const nodo = compilarElemento(elemento, '', archivo, contexto);
      if (nodo !== undefined) nodos.push(nodo);
    }
  }
  aplicarExtensiones(raices.flatMap(({ archivo, extensiones }) => extensiones.map((extension) => ({ archivo, extension }))), contexto);

  const atributosPorNodo = new Map<string, string[]>();
  recogerAtributos(nodos, atributosPorNodo);
  const aristas: Arista[] = [];
  for (const { archivo, aristas: delArchivo } of raices) {
    // Con sintaxis rota el AST es parcial: sus Aristas darian falsos colgantes.
    if (conSintaxisRota.has(archivo)) continue;
    for (const arista of delArchivo) {
      aristas.push(compilarArista(arista, archivo, atributosPorNodo, issues));
    }
  }

  const iconos = combineIconProviders(workspaceIcons(workspace), genericIcons());
  for (const { archivo, prop } of tiposConIcono) {
    if (conSintaxisRota.has(archivo) || iconos.resolve(prop.value) !== undefined) continue;
    issues.push(
      issueConSugerencia(
        { code: CODIGOS.E_UNKNOWN_ICON, message: `Icono '${prop.value}' no existe (ni generico ni SVG del Workspace)` },
        archivo, prop, 'value', iconos.keys(),
      ),
    );
  }

  const { temas, issues: delTema } = resolverTemas(temasDeclarados);
  issues.push(...delTema);
  const fuente = {
    themes: temas,
    specification: { nodeTypes: tiposDeNodo },
    model: { nodes: nodos, edges: aristas },
    views: vistas.map(({ vista }) => vista),
  };
  for (const { vista, archivo, ast } of vistas) {
    // Con sintaxis rota el AST es parcial: sus overrides darian falsos positivos.
    if (conSintaxisRota.has(archivo)) continue;
    comprobarOverrides(vista, ast, archivo, fuente, issues);
    comprobarTemaYColores(vista, ast, archivo, fuente, issues);
    comprobarDrillDown(vista, ast, archivo, fuente, issues);
    comprobarPasos(ast, archivo, fuente, issues);
  }
  for (const { archivo, prop } of tiposConColor) {
    if (conSintaxisRota.has(archivo)) continue;
    comprobarColor(prop, archivo, nombresDePaleta(temas), issues);
  }

  issues.sort(compararIssues);
  if (issues.some((issue) => issue.severity === 'error')) return { issues };
  return {
    canonico: fuenteCanonicaSchema.parse(fuente),
    issues,
  };
}

/** Nodos ya compilados por id cualificado, con el sitio donde se declararon. */
interface NodoRegistrado {
  nodo: Nodo;
  origen: { file: string; line: number; column: number };
}

interface Contexto {
  declarados: ReadonlySet<string>;
  registro: Map<string, NodoRegistrado>;
  issues: Issue[];
}

/** Compila una Vista; sin `type` valido es `E_UNKNOWN_VIEW_TYPE` y no hay Vista. */
function compilarVista(vista: View, archivo: string, issues: Issue[]): Vista | undefined {
  const tipo = vista.props.find((prop) => prop.$type === 'ViewType');
  if (tipo === undefined) {
    issues.push({
      code: CODIGOS.E_UNKNOWN_VIEW_TYPE,
      severity: 'error',
      file: archivo,
      ...rangoDe(vista, 'name').start,
      message: `La Vista '${vista.name}' no declara 'type' (${TIPOS_DE_VISTA.join(' | ')})`,
    });
    return undefined;
  }
  const tipoValido = vistaSchema.shape.type.safeParse(tipo.value);
  if (!tipoValido.success) {
    issues.push(
      issueConSugerencia(
        { code: CODIGOS.E_UNKNOWN_VIEW_TYPE, message: `Tipo de Vista '${tipo.value}' desconocido (${TIPOS_DE_VISTA.join(' | ')})` },
        archivo, tipo, 'value', TIPOS_DE_VISTA,
      ),
    );
    return undefined;
  }
  const selectores = (clase: 'ViewInclude' | 'ViewExclude'): string[] =>
    vista.props.flatMap((prop) => (prop.$type === clase ? prop.selectors : []));
  const profundidad = vista.props.find((prop) => prop.$type === 'ViewDepth');
  const tema = vista.props.find((prop) => prop.$type === 'ViewTheme');
  return {
    id: vista.name,
    type: tipoValido.data,
    include: selectores('ViewInclude'),
    exclude: selectores('ViewExclude'),
    ...(profundidad !== undefined && { depth: profundidad.value }),
    ...(tema !== undefined && { theme: tema.value }),
    ...(vista.props.some((prop) => prop.$type === 'ViewDrill') && { drill: 'collapse' as const }),
    collapsed: vista.props.flatMap((prop) => (prop.$type === 'ViewCollapsed' ? prop.targets : [])),
    expanded: vista.props.flatMap((prop) => (prop.$type === 'ViewExpanded' ? prop.targets : [])),
    links: vista.props.flatMap((prop) => (prop.$type === 'ViewLink' ? [{ node: prop.node, view: prop.view }] : [])),
    overrides: vista.props.flatMap((prop) => (prop.$type === 'NodeOverride' ? [overrideDe(prop)] : [])),
    steps: vista.props.flatMap((prop) => (prop.$type === 'ViewSteps' ? prop.steps.map(pasoDe) : [])),
  };
}

/**
 * El `theme` de la Vista debe existir, y el color de cada override debe ser un
 * nombre de la Paleta de ese Tema (o, sin `theme`, de alguno de los Temas).
 */
function comprobarTemaYColores(
  vista: Vista,
  ast: View,
  archivo: string,
  fuente: FuenteCanonica,
  issues: Issue[],
): void {
  const declarado = ast.props.find((prop) => prop.$type === 'ViewTheme');
  const tema = fuente.themes.find((candidato) => candidato.name === vista.theme);
  if (declarado !== undefined && tema === undefined) {
    issues.push(
      issueConSugerencia(
        { code: CODIGOS.E_UNKNOWN_THEME, message: `Tema '${declarado.value}' no declarado` },
        archivo, declarado, 'value', fuente.themes.map(({ name }) => name),
      ),
    );
  }
  const paleta = nombresDePaleta(tema ? [tema] : fuente.themes);
  for (const prop of ast.props) {
    if (prop.$type !== 'NodeOverride') continue;
    for (const campo of prop.props) {
      if (campo.$type === 'OverrideColor') comprobarColor(campo, archivo, paleta, issues);
    }
  }
}

function nombresDePaleta(temas: readonly Tema[]): string[] {
  return temas.flatMap((tema) => Object.keys(tema.palette));
}

function pasoDe(paso: Step): Paso {
  const items = (clase: 'StepShow' | 'StepHide'): ElementoDePaso[] =>
    paso.actions.flatMap((accion) =>
      accion.$type === clase
        ? accion.items.map((item) => (item.$type === 'StepEdge' ? { from: item.from, to: item.to } : { selector: item.selector }))
        : [],
    );
  return { title: paso.title, show: items('StepShow'), hide: items('StepHide') };
}

/**
 * Pasos: cada selector debe coincidir con algun Nodo del Modelo y cada Arista
 * nombrada debe existir en el (ADR 0007).
 */
function comprobarPasos(ast: View, archivo: string, fuente: FuenteCanonica, issues: Issue[]): void {
  const ids = todosLosIds(fuente.model.nodes);
  for (const prop of ast.props) {
    if (prop.$type !== 'ViewSteps') continue;
    for (const paso of prop.steps) {
      for (const accion of paso.actions) {
        for (const item of accion.items) {
          if (item.$type === 'StepSelector') {
            if (ids.some((id) => matchesSelector(item.selector, id))) continue;
            issues.push(
              issueConSugerencia(
                { code: CODIGOS.E_UNKNOWN_STEP, message: `El selector '${item.selector}' no coincide con ningun Nodo del Modelo` },
                archivo, item, 'selector', ids,
              ),
            );
          } else if (!fuente.model.edges.some((arista) => arista.from.node === item.from && arista.to.node === item.to)) {
            issues.push(
              issueConSugerencia(
                { code: CODIGOS.E_UNKNOWN_STEP, message: `La Arista '${item.from} -> ${item.to}' no existe en el Modelo` },
                archivo, item, 'from', ids,
              ),
            );
          }
        }
      }
    }
  }
}

function todosLosIds(nodos: readonly Nodo[]): string[] {
  return nodos.flatMap((nodo) => [nodo.id, ...todosLosIds(nodo.children)]);
}

/**
 * Drill-down: `link` solo a Vistas que existen; `collapsed`/`expanded` solo sobre
 * Grupos que la Vista muestra; un Nodo no puede llevar `link` y `expanded`.
 */
function comprobarDrillDown(
  vista: Vista,
  ast: View,
  archivo: string,
  fuente: FuenteCanonica,
  issues: Issue[],
): void {
  const gruposEnLaVista = new Set(
    resolveView(
      { ...fuente, views: [{ ...vista, collapsed: [], expanded: [], links: [], depth: undefined }] },
      vista.id,
    )?.nodes.filter((nodo) => nodo.childCount > 0).map((nodo) => nodo.id),
  );
  const enlazados = new Set(vista.links.map(({ node }) => node));
  const idsDeVista = fuente.views.map(({ id }) => id);

  for (const prop of ast.props) {
    if (prop.$type === 'ViewLink' && !idsDeVista.includes(prop.view)) {
      issues.push(
        issueConSugerencia(
          { code: CODIGOS.E_UNKNOWN_VIEW_LINK, message: `link hacia la Vista '${prop.view}', que no existe` },
          archivo, prop, 'view', idsDeVista,
        ),
      );
    } else if (prop.$type === 'ViewCollapsed' || prop.$type === 'ViewExpanded') {
      const palabra = prop.$type === 'ViewCollapsed' ? 'collapsed' : 'expanded';
      prop.targets.forEach((destino, indice) => {
        const sitio = { file: archivo, ...rangoDeIndice(prop, 'targets', indice).start };
        if (!gruposEnLaVista.has(destino)) {
          issues.push({
            code: CODIGOS.E_INVALID_EXPANSION_TARGET,
            severity: 'error',
            ...sitio,
            message: `'${palabra} ${destino}': no es un Grupo que la Vista '${vista.id}' muestre`,
          });
        } else if (palabra === 'expanded' && enlazados.has(destino)) {
          issues.push({
            code: CODIGOS.E_LINK_WITH_EXPANDED,
            severity: 'error',
            ...sitio,
            message: `'${destino}' lleva 'link' y 'expanded': un Grupo con link no se expande`,
          });
        }
      });
    }
  }
}

/** Un color es siempre un nombre de Paleta; un hex o un typo es `E_UNKNOWN_PALETTE_COLOR`. */
function comprobarColor(
  prop: { value: string } & AstNode,
  archivo: string,
  paleta: readonly string[],
  issues: Issue[],
): void {
  if (paleta.includes(prop.value)) return;
  issues.push(
    issueConSugerencia(
      { code: CODIGOS.E_UNKNOWN_PALETTE_COLOR, message: `Color '${prop.value}' no es un nombre de Paleta del Tema` },
      archivo, prop, 'value', new Set(paleta),
    ),
  );
}

function overrideDe(declarado: NodeOverride): OverrideDeNodo {
  const override: OverrideDeNodo = { node: declarado.node };
  for (const prop of declarado.props) {
    if (prop.$type === 'OverrideLabel') override.label = prop.value;
    else if (prop.$type === 'OverridePin') override.pin = { x: prop.x, y: prop.y };
    else if (prop.$type === 'OverrideOrder') override.order = prop.value;
    else override.color = prop.value;
  }
  return override;
}

/** Un override solo puede apuntar a un Nodo que la Vista muestra. */
function comprobarOverrides(
  vista: Vista,
  ast: View,
  archivo: string,
  fuente: FuenteCanonica,
  issues: Issue[],
): void {
  const visibles = new Set(resolveView(fuente, vista.id)?.nodes.map((nodo) => nodo.id));
  for (const prop of ast.props) {
    if (prop.$type !== 'NodeOverride' || visibles.has(prop.node)) continue;
    issues.push({
      code: CODIGOS.E_OVERRIDE_OUTSIDE_VIEW,
      severity: 'error',
      file: archivo,
      ...rangoDe(prop, 'node').start,
      message: `Override sobre '${prop.node}', que la Vista '${vista.id}' no muestra`,
    });
  }
}

/** Compila un Elemento; un id ya declarado es `E_DUPLICATE_NODE` y el duplicado se descarta. */
function compilarElemento(
  elemento: Element,
  prefijo: string,
  archivo: string,
  contexto: Contexto,
): Nodo | undefined {
  const { declarados, registro, issues } = contexto;
  const id = prefijo === '' ? elemento.name : `${prefijo}.${elemento.name}`;
  const { start: sitio } = rangoDe(elemento, 'name');
  const original = registro.get(id);
  if (original !== undefined) {
    issues.push({
      code: CODIGOS.E_DUPLICATE_NODE,
      severity: 'error',
      file: archivo,
      ...sitio,
      message: `Nodo duplicado '${id}'; para ampliarlo desde otro archivo usa 'extend ${id} { ... }'`,
      related: [{ ...original.origen, message: `Primera declaracion de '${id}'` }],
    });
    return undefined;
  }
  if (!declarados.has(elemento.type)) {
    issues.push(
      issueConSugerencia(
        {
          code: CODIGOS.E_UNKNOWN_NODE_TYPE,
          message: `Tipo de nodo '${elemento.type}' no declarado en specification`,
        },
        archivo, elemento, 'type', declarados,
      ),
    );
  }
  const nodo: Nodo = {
    id,
    type: elemento.type,
    title: elemento.title ?? elemento.name,
    description: elemento.description ?? '',
    attributes: atributosDe(elemento.attrs),
    source: referenciasDe(elemento.sources),
    children: [],
  };
  registro.set(id, { nodo, origen: { file: archivo, ...sitio } });
  nodo.children = compilarHijos(elemento.elements, id, archivo, contexto);
  return nodo;
}

function compilarHijos(elementos: readonly Element[], prefijo: string, archivo: string, contexto: Contexto): Nodo[] {
  return elementos.flatMap((hijo) => compilarElemento(hijo, prefijo, archivo, contexto) ?? []);
}

/**
 * Aplica los `extend` en pasadas: un `extend` puede apuntar a un Nodo que crea otro
 * `extend` (de cualquier archivo), asi que se repite mientras alguna pasada avance.
 * Los que quedan sin objetivo son `E_UNKNOWN_EXTEND_TARGET`.
 */
function aplicarExtensiones(
  extensiones: readonly { archivo: string; extension: Extend }[],
  contexto: Contexto,
): void {
  let pendientes = extensiones;
  while (pendientes.length > 0) {
    const siguientes = pendientes.filter(({ archivo, extension }) => !compilarExtension(extension, archivo, contexto));
    if (siguientes.length === pendientes.length) break;
    pendientes = siguientes;
  }
  for (const { archivo, extension } of pendientes) {
    contexto.issues.push({
      code: CODIGOS.E_UNKNOWN_EXTEND_TARGET,
      severity: 'error',
      file: archivo,
      ...rangoDe(extension, 'target').start,
      message: `'extend' sobre el Nodo '${extension.target}', que no existe en el Modelo`,
    });
  }
}

/** Anade al Nodo `target` los hijos, Atributos y source del `extend`; false si el Nodo aun no existe. */
function compilarExtension(extension: Extend, archivo: string, contexto: Contexto): boolean {
  const objetivo = contexto.registro.get(extension.target);
  if (objetivo === undefined) return false;
  const { nodo } = objetivo;
  nodo.attributes.push(...atributosDe(extension.attrs));
  nodo.source.push(...referenciasDe(extension.sources));
  nodo.children.push(...compilarHijos(extension.elements, nodo.id, archivo, contexto));
  return true;
}

function atributosDe(bloques: readonly Attrs[]): Atributo[] {
  return bloques.flatMap((bloque) =>
    bloque.items.map((item) => ({ name: item.name, type: item.type, notes: item.notes ?? '' })),
  );
}

function referenciasDe(bloques: readonly Source[]): ReferenciaOpaca[] {
  return bloques.flatMap((bloque) => bloque.items.map(({ kind, ref }) => ({ kind, ref })));
}

// Las Aristas se validan aqui (con posicion y `fix`) y, como red estructural,
// en el esquema de `canonico`; no es duplicacion evitable: el esquema no ve el texto.
// `E_DANGLING_EDGE` no lleva `related`: no hay un segundo sitio que senalar.
function compilarArista(
  arista: Edge,
  archivo: string,
  atributosPorNodo: ReadonlyMap<string, readonly string[]>,
  issues: Issue[],
): Arista {
  return {
    from: compilarExtremo(arista.from, archivo, atributosPorNodo, issues),
    to: compilarExtremo(arista.to, archivo, atributosPorNodo, issues),
    ...(arista.fromCardinality !== undefined && { fromCardinality: arista.fromCardinality }),
    ...(arista.toCardinality !== undefined && { toCardinality: arista.toCardinality }),
  };
}

/** Compila un extremo; un Nodo inexistente o un Atributo inexistente es un issue. */
function compilarExtremo(
  extremo: Endpoint,
  archivo: string,
  atributosPorNodo: ReadonlyMap<string, readonly string[]>,
  issues: Issue[],
): Extremo {
  const compilado: Extremo = {
    node: extremo.node,
    ...(extremo.attribute !== undefined && { attribute: extremo.attribute }),
  };

  const atributos = atributosPorNodo.get(extremo.node);
  if (atributos === undefined) {
    issues.push(
      issueConSugerencia(
        { code: CODIGOS.E_DANGLING_EDGE, message: `Arista colgante: el Nodo '${extremo.node}' no existe en el Modelo` },
        archivo, extremo, 'node', atributosPorNodo.keys(),
      ),
    );
  } else if (extremo.attribute !== undefined && !atributos.includes(extremo.attribute)) {
    issues.push(
      issueConSugerencia(
        { code: CODIGOS.E_UNKNOWN_ATTRIBUTE, message: `El Nodo '${extremo.node}' no tiene el Atributo '${extremo.attribute}'` },
        archivo, extremo, 'attribute', atributos,
      ),
    );
  }
  return compilado;
}

/**
 * Issue de error sobre la propiedad textual `propiedad` de `nodo`, con `fix` si hay
 * un unico candidato cercano entre `existentes` y `hint` si hay varios.
 */
function issueConSugerencia<T extends AstNode>(
  base: { code: string; message: string },
  archivo: string,
  nodo: T,
  propiedad: Extract<keyof T, string>,
  existentes: Iterable<string>,
): Issue {
  const { start: inicio, end: fin } = rangoDe(nodo, propiedad);
  const issue: Issue = { ...base, severity: 'error', file: archivo, ...inicio };
  const candidatos = candidatosCercanos(nodo[propiedad] as string, existentes);
  const [unico] = candidatos;
  if (candidatos.length === 1 && unico !== undefined) {
    issue.fix = { file: archivo, range: { start: inicio, end: fin }, replacement: unico };
  } else if (candidatos.length > 1) {
    issue.hint = `Candidatos: ${candidatos.join(', ')}`;
  }
  return issue;
}

/** Rango 1-based (fin excluido) de una propiedad del AST; `1:1` si el CST no lo conoce. */
function rangoDe(nodo: AstNode, propiedad: string): TextRange {
  const rango = GrammarUtils.findNodeForProperty(nodo.$cstNode, propiedad)?.range;
  return {
    start: { line: (rango?.start.line ?? 0) + 1, column: (rango?.start.character ?? 0) + 1 },
    end: { line: (rango?.end.line ?? 0) + 1, column: (rango?.end.character ?? 0) + 1 },
  };
}

/** Como `rangoDe`, para el `indice`-esimo valor de una propiedad multiple. */
function rangoDeIndice(nodo: AstNode, propiedad: string, indice: number): TextRange {
  const rango = GrammarUtils.findNodesForProperty(nodo.$cstNode, propiedad)[indice]?.range;
  return {
    start: { line: (rango?.start.line ?? 0) + 1, column: (rango?.start.character ?? 0) + 1 },
    end: { line: (rango?.end.line ?? 0) + 1, column: (rango?.end.character ?? 0) + 1 },
  };
}

/** Nombres de Atributo (en orden) de cada Nodo, a cualquier profundidad. */
function recogerAtributos(nodos: readonly Nodo[], destino: Map<string, string[]>): void {
  for (const nodo of nodos) {
    destino.set(nodo.id, nodo.attributes.map((atributo) => atributo.name));
    recogerAtributos(nodo.children, destino);
  }
}

function issuesDeSintaxis(
  archivo: string,
  texto: string,
  resultado: ParseResult<Documento>,
): Issue[] {
  const sintaxis = (message: string, line: number, column: number): Issue => ({
    code: CODIGOS.E_SYNTAX_ERROR,
    severity: 'error',
    file: archivo,
    line,
    column,
    message,
  });
  return [
    ...resultado.lexerErrors.map((error) => sintaxis(error.message, error.line ?? 1, error.column ?? 1)),
    ...resultado.parserErrors.map((error) => {
      const { startLine, startColumn } = error.token;
      // En EOF Langium da NaN o -1 como posicion: se usa el final del texto.
      return startLine !== undefined && startColumn !== undefined && startLine >= 1 && startColumn >= 1
        ? sintaxis(error.message, startLine, startColumn)
        : sintaxis(error.message, ...finDeTexto(texto));
    }),
  ];
}

/** Posicion 1-based justo despues del ultimo caracter (errores en EOF). */
function finDeTexto(texto: string): [number, number] {
  const lineas = texto.split(/\r\n|\r|\n/);
  return [lineas.length, (lineas[lineas.length - 1] as string).length + 1];
}

function compararIssues(a: Issue, b: Issue): number {
  return (
    a.file.localeCompare(b.file) || a.line - b.line || a.column - b.column || a.code.localeCompare(b.code)
  );
}
