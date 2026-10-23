/**
 * Compilador del DSL de texto: parsea cada archivo con la gramatica derivada de
 * LikeC4 (Langium) y traduce el AST a la Fuente canonica. Puro: no lee disco.
 */
import { CODIGOS, TIPOS_DE_VISTA, combineIconProviders, fuenteCanonicaSchema, genericIcons, validate, vistaSchema, workspaceIcons } from 'canonico';
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
  TipoDeNodo,
  Ubicador,
  Vista,
} from 'canonico';
import {
  EmptyFileSystem,
  createDefaultCoreModule,
  createDefaultSharedCoreModule,
  inject,
} from 'langium';
import type { LangiumCoreServices, ParseResult } from 'langium';

import { DiagramasGeneratedModule, DiagramasGeneratedSharedModule } from './generated/module';
import type { Attrs, Documento, Edge, Element, Extend, NodeOverride, NodeTypeDecl, Source, Step, Theme, View } from './generated/ast';
import { issueConSugerencia, rangoDe, rangoDeIndice } from './posiciones';
import { ARCHIVO_INCORPORADOS, temasIncorporados } from './incorporados';
import { resolverTemas } from './temas';
import type { DeclaracionDeParte, TemaDeclarado } from './temas';
import { crearUbicador } from './ubicador';

/** Mapa ruta -> texto del Workspace. El nucleo no lee disco. */
export type ArchivosDelWorkspace = Readonly<Record<string, string>>;

/** Sitio del texto donde una Vista fija el `pin` de un Nodo. */
export interface PosicionDePin {
  view: string;
  node: string;
  file: string;
  line: number;
  column: number;
}

export interface ResultadoDeCompilacion {
  /** Presente solo si no hay issues con severidad `error`. */
  canonico?: FuenteCanonica;
  /** Todos los issues, ordenados por archivo, linea, columna y codigo. */
  issues: Issue[];
  /** Posicion de cada override con `pin`, en orden de aparicion. */
  pins: PosicionDePin[];
  /** Donde se escribio cada valor de la Fuente canonica; presente junto a `canonico`. */
  ubicar?: Ubicador;
}

let memoServicios: LangiumCoreServices | undefined;

/**
 * Servicios de Langium, construidos la primera vez que se compila. Es el unico
 * estado de modulo del paquete y se conserva a proposito: crearlos cuesta ~100 ms
 * frente a ~1 ms de compilar un Workspace chico, y `compile` se llama muchas
 * veces por proceso. Es inmutable e inobservable: solo se usa `parser.LangiumParser`,
 * que no retiene documentos ni resultados entre llamadas (cada `parse` es
 * independiente), asi que compilar con o sin memo da el mismo resultado.
 */
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
  const temasDeclarados: TemaDeclarado[] = temasIncorporados((texto) => servicios().parser.LangiumParser.parse<Documento>(texto).value).map((tema) => ({
    archivo: ARCHIVO_INCORPORADOS,
    ast: tema,
    nombre: rangoDe(tema, 'name'),
    padre: rangoDe(tema, 'parent'),
  }));
  const partesDeclaradas: DeclaracionDeParte[] = [];
  const tiposAst: { archivo: string; ast: NodeTypeDecl }[] = [];
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
          if (prop.key === 'description') tipo.description = valor;
          else tipo[prop.key] = valor;
        }
        tiposDeNodo.push(tipo);
        tiposAst.push({ archivo, ast: decl });
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
    for (const parte of resultado.value.parts) {
      partesDeclaradas.push({ archivo, ast: parte, nombre: rangoDe(parte, 'name') });
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

  const registro = new Map<string, NodoRegistrado>();
  const contexto: Contexto = { registro, issues };
  const nodos: Nodo[] = [];
  for (const { archivo, elementos } of raices) {
    for (const elemento of elementos) {
      const nodo = compilarElemento(elemento, '', archivo, contexto);
      if (nodo !== undefined) nodos.push(nodo);
    }
  }
  aplicarExtensiones(raices.flatMap(({ archivo, extensiones }) => extensiones.map((extension) => ({ archivo, extension }))), contexto);

  const aristas: Arista[] = [];
  const aristasAst: { archivo: string; ast: Edge }[] = [];
  for (const { archivo, aristas: delArchivo } of raices) {
    // Con sintaxis rota el AST es parcial: sus Aristas darian falsos colgantes.
    if (conSintaxisRota.has(archivo)) continue;
    for (const arista of delArchivo) {
      aristas.push(compilarArista(arista));
      aristasAst.push({ archivo, ast: arista });
    }
  }

  const { temas, issues: delTema, parchesDeVista } = resolverTemas(temasDeclarados, partesDeclaradas, tiposDeNodo.map(({ name }) => name));
  issues.push(...delTema);
  for (const { vista, archivo, ast } of vistas) {
    const bloque = ast.props.find((prop) => prop.$type === 'ViewTheme');
    if (bloque === undefined || bloque.items.length === 0 || vista.theme === undefined) continue;
    const { ops, issues: delOverride } = parchesDeVista(vista.theme, bloque.items, archivo);
    issues.push(...delOverride);
    if (ops.length > 0) vista.themePatch = ops.map((op) => ({ ...op }));
  }
  const fuente: FuenteCanonica = {
    themes: temas,
    specification: { nodeTypes: tiposDeNodo },
    model: { nodes: nodos, edges: aristas },
    views: vistas.map(({ vista }) => vista),
  };
  const ubicar = crearUbicador({
    fuente,
    nodos: new Map([...registro].map(([id, { origen, ast }]) => [id, { archivo: origen.file, ast }])),
    aristas: aristasAst,
    tipos: tiposAst,
    vistas: vistas.map(({ archivo, ast }) => ({ archivo, ast })),
    temas: new Map(temasDeclarados.map(({ archivo, ast, nombre }) => [ast.name, { archivo, nombre }])),
    conSintaxisRota,
  });
  issues.push(...validate(fuente, { iconos: combineIconProviders(workspaceIcons(workspace), genericIcons()), ubicar }));

  const pins: PosicionDePin[] = [];
  for (const { vista, archivo, ast } of vistas) {
    // Con sintaxis rota el AST es parcial: sus overrides darian falsos positivos.
    if (!conSintaxisRota.has(archivo)) pins.push(...posicionesDePin(vista, ast, archivo));
  }

  issues.sort(compararIssues);
  if (issues.some((issue) => issue.severity === 'error')) return { issues, pins };
  return {
    canonico: fuenteCanonicaSchema.parse(fuente),
    issues,
    pins,
    ubicar,
  };
}

/** Nodos ya compilados por id cualificado, con el sitio donde se declararon. */
interface NodoRegistrado {
  nodo: Nodo;
  ast: Element;
  origen: { file: string; line: number; column: number };
}

interface Contexto {
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

function pasoDe(paso: Step): Paso {
  const items = (clase: 'StepShow' | 'StepHide'): ElementoDePaso[] =>
    paso.actions.flatMap((accion) =>
      accion.$type === clase
        ? accion.items.map((item) => (item.$type === 'StepEdge' ? { from: item.from, to: item.to } : { selector: item.selector }))
        : [],
    );
  return { title: paso.title, show: items('StepShow'), hide: items('StepHide') };
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

function posicionesDePin(vista: Vista, ast: View, archivo: string): PosicionDePin[] {
  return ast.props.flatMap((prop) =>
    prop.$type === 'NodeOverride' && prop.props.some((p) => p.$type === 'OverridePin')
      ? [{ view: vista.id, node: prop.node, file: archivo, ...rangoDe(prop, 'node').start }]
      : [],
  );
}

/** Compila un Elemento; un id ya declarado es `E_DUPLICATE_NODE` y el duplicado se descarta. */
function compilarElemento(
  elemento: Element,
  prefijo: string,
  archivo: string,
  contexto: Contexto,
): Nodo | undefined {
  const { registro, issues } = contexto;
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
  const nodo: Nodo = {
    id,
    type: elemento.type,
    title: elemento.title ?? elemento.name,
    description: elemento.description ?? '',
    attributes: atributosDe(elemento.attrs),
    source: referenciasDe(elemento.sources),
    children: [],
  };
  registro.set(id, { nodo, ast: elemento, origen: { file: archivo, ...sitio } });
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

/**
 * Las Aristas se compilan tal cual; que sus extremos existan lo comprueba
 * `validate` de `canonico` (con la posicion que aporta el `Ubicador`).
 */
function compilarArista(arista: Edge): Arista {
  const extremo = ({ node, attribute }: Edge['from']): Extremo => ({
    node,
    ...(attribute !== undefined && { attribute }),
  });
  return {
    from: extremo(arista.from),
    to: extremo(arista.to),
    ...(arista.fromCardinality !== undefined && { fromCardinality: arista.fromCardinality }),
    ...(arista.toCardinality !== undefined && { toCardinality: arista.toCardinality }),
    ...(arista.label !== undefined && { label: arista.label }),
  };
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
