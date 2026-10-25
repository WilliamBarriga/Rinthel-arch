/**
 * Ayuda del CLI: `diagrams --help`, `diagrams help [comando]` y `diagrams <comando> --help`.
 * Pura: devuelve texto; `index.ts` decide cuando mostrarlo. Sale con codigo 0 y va a stdout.
 */

const COMANDOS = ['validate', 'build', 'dev', 'inspect', 'edit', 'skill'] as const;
export type ComandoConAyuda = (typeof COMANDOS)[number];

const WORKSPACE = '--workspace <ruta>   Carpeta con los archivos .dg (obligatorio)';
const THEME_PATH = '--theme-path <dir>  Carpeta de Temas extra; se fusiona antes del Workspace (gana el Workspace)';

const AYUDA_DE_COMANDO: Record<ComandoConAyuda, string> = {
  validate: `diagrams validate --workspace <ruta> [opciones]

Compila y valida. Solo lectura: nunca reescribe archivos.

Opciones:
  ${WORKSPACE}
  --json               stdout es exactamente un objeto { contractVersion, ok, summary, issues }
  --strict             los avisos tambien fallan (exit 1)
  --max-issues <N>     tope de issues listados (100 por defecto; summary.truncated lo indica)
  --theme <nombre>     Tema con el que se miden los Pins solapados
  ${THEME_PATH}

Salida: 0 sin errores, 1 hay errores, 2 fallo de uso o interno (mensaje en stderr).
Cada issue trae code estable, file, line, column y, si hay un unico candidato, fix.
`,
  build: `diagrams build --workspace <ruta> [opciones]

Valida y escribe la Fuente canonica y la geometria en <ruta>/.diagrams/ (derivado, no se versiona).
Con errores sale 1 y borra la salida anterior.

Opciones: las de validate (--json, --strict, --max-issues, --theme, --theme-path).
`,
  dev: `diagrams dev --workspace <ruta> [opciones]

Visor en vivo en http://127.0.0.1:<puerto>/ (solo escucha en localhost). Recompila al guardar y
muestra un panel de issues. La Vista se elige con el hash de la URL (#p=<vista>).
Arrastrar un Nodo fija su Pin y reescribe el .dg.

Opciones:
  ${WORKSPACE}
  --port <N>           Puerto (4173 por defecto; 0 elige uno libre)
  --trust-code         Confia de antemano en los Temas con codigo (.tsx) del Workspace
  ${THEME_PATH}

Es un proceso largo: lanzalo en segundo plano y espera la linea con la URL.
`,
  inspect: `diagrams inspect <buscar|nodo|vista|tema> <argumento> --workspace <ruta> [opciones]

Consultas de solo lectura sobre el Modelo; cada resultado trae id cualificado, tipo y archivo:linea.

  inspect buscar <texto>      Nodos por id parcial o titulo, Vistas por id
  inspect nodo <id>           Nodo, padre e hijos, Atributos, Aristas y Vistas que lo muestran
  inspect vista <id>          Nodos y Aristas visibles de la Vista en su estado inicial
  inspect tema <nombre>       Cadena extends, Partes, pila de Capas con archivo:linea, Metricas

Opciones:
  ${WORKSPACE}
  --json               Un objeto con su propio contractVersion (independiente del de validate)
  --tipo <tipo>        (tema) resuelve la cascada para ese Tipo de nodo
  --estado <estado>    (tema) resuelve la cascada para ese estado
  --catalogo           (tema) agrega las claves del catalogo de Primitivas y Movimientos
  ${THEME_PATH}

Salida: 0 hay respuesta, 1 no existe el Nodo/Vista/Tema o el Workspace tiene errores, 2 fallo de uso.
`,
  edit: `diagrams edit --workspace <ruta> (--view <id> --node <id> --x N --y N | --edits '<json>') [opciones]

Unica escritura explicita del CLI: todo o nada, solo sobre archivos .dg del Workspace.

  --view <id> --node <id> --x N --y N   Fija el Pin del Nodo en la Vista (lo inserta o lo reemplaza)
  --edits '<json>'                      Lista de { file, range, replacement }, por ejemplo los fix de validate
  --hash <archivo>=<hash>               Rechaza la edicion si el archivo cambio desde que lo leiste

Opciones:
  ${WORKSPACE}
  --json               Resultado estructurado con su propio contractVersion
  ${THEME_PATH}

Salida: 0 aplicado, 1 edicion rechazada o invalida (sin escritura parcial), 2 fallo de uso.
`,
  skill: `diagrams skill --workspace <ruta> [--out <archivo>]

Genera una skill (SKILL.md) para que un agente escriba y corrija los .dg de ESE Workspace: sus Tipos de
nodo, Temas, sintaxis, contrato de validate/inspect/edit y codigos de issue. Va a stdout o a --out.
Regenerala cuando cambien los Tipos de nodo, los Temas o los codigos.
`,
};

const AYUDA_GENERAL = `diagrams: CLI para escribir, validar y ver diagramas .dg

Uso: diagrams <comando> --workspace <ruta> [opciones]
     diagrams <comando> --help

Comandos:
  validate   Compila y valida; lista issues con archivo, linea y fix (solo lectura)
  build      Escribe la Fuente canonica y la geometria en <ruta>/.diagrams/
  dev        Visor en vivo en http://127.0.0.1:4173/ con panel de issues
  inspect    Consulta el Modelo: buscar, nodo, vista, tema (solo lectura)
  edit       Fija un Pin o aplica ediciones estructuradas al .dg
  skill      Genera la skill de agente de un Workspace

Bucle de un agente: inspect, editar el .dg, validate --json hasta ok:true.
Codigos de salida: 0 correcto, 1 hay errores del Workspace, 2 fallo de uso o interno.
Guia completa: docs/guia/cli.md
`;

/** Texto de ayuda si `argv` la pide; `undefined` si no. */
export function ayudaPara(argv: readonly string[]): string | undefined {
  const [comando, ...resto] = argv;
  const pide = (valor: string | undefined): boolean => valor === '--help' || valor === '-h';
  const esComando = (valor: string | undefined): valor is ComandoConAyuda => COMANDOS.includes(valor as ComandoConAyuda);

  if (comando === undefined || pide(comando)) return AYUDA_GENERAL;
  if (comando === 'help') return esComando(resto[0]) ? AYUDA_DE_COMANDO[resto[0]] : AYUDA_GENERAL;
  if (esComando(comando) && resto.some(pide)) return AYUDA_DE_COMANDO[comando];
  return undefined;
}
