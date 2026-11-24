# Escaner de codebases: graphify, codegraph y alternativas

Research del ticket #212 (hijo del mapa #211). Pregunta: que herramientas existen para extraer la estructura de una codebase externa y que conviene adoptar o imitar para el escaner del importador hibrido (el escaner saca lo mecanico a un borrador; el agente decide partes, nombra y escribe el `.dg`, validado con `validate`). Primera version: Vistas `architecture` y `er`.

Fecha de consulta: 2026-11-24. Metadatos de repos con `gh api repos/<repo>` y de paquetes con `npm view <paquete>` ese dia. Este documento es interno; la cara publica no compara con otros repos (#211).

## Conclusion

- No adoptar graphify ni codegraph como dependencia. Los dos extraen un grafo de simbolos (funciones, clases, llamadas) demasiado fino para una Vista `architecture`, no modelan columnas ni relaciones para `er`, y uno es Python y el otro trae binarios por plataforma. Imitar tres ideas: la marca de confianza por arista (graphify), el par "JSON grande en disco + resumen compacto para el agente" (floorplan) y la asignacion de archivos a Nodos por globs con "el mas profundo gana" (floorplan).
- Escaner propio en TS, paquete aparte fuera del nucleo, en tres capas: (1) manifiestos (`package.json`/workspaces, `pyproject.toml`, `go.mod`, `Cargo.toml`) para las unidades, sin parser; (2) imports por archivo agregados a nivel de unidad, con `web-tree-sitter` (MIT, WASM, sin compilacion nativa) y las gramaticas oficiales (MIT, traen `.wasm`); (3) esquemas de BD por extractor dedicado por fuente (Prisma, SQL DDL, Drizzle, Django, SQLAlchemy), siempre estatico: nunca ejecutar codigo del proyecto escaneado.
- Formato del borrador: un JSON versionado (`rinthel/borrador@1`) con `unidades`, `dependencias` agregadas, `externos`, `endpoints` y `tablas` (columnas con pk, fk, uk y opcional; relaciones con cardinalidad), cada item con `source {file, line}` y `confianza` (`extraido` o `inferido`). Sus formas se proyectan casi 1:1 a Nodos, Atributos, Aristas y Source del Modelo. Ver [Formato recomendado](#formato-recomendado-del-borrador).
- Licencias de lo que se usaria: web-tree-sitter y gramaticas MIT; `@mrleebo/prisma-ast` MIT; `node-sql-parser` Apache-2.0 o `tree-sitter-sql` MIT. Todas compatibles. Cada adopcion se decide en su ticket.

## Candidatos revisados

### graphify (Graphify-Labs/graphify)

- Licencia Apache-2.0, Python >= 3.10, paquete PyPI `graphifyy` 0.9.80; repo activo (push 2026-11-24, ~153k estrellas). Fuente: metadatos del paquete instalado (`pip show graphifyy`, `METADATA`) y `gh api repos/Graphify-Labs/graphify`.
- Tecnica hibrida: extraccion estructural deterministica con tree-sitter (depende de ~25 gramaticas `tree-sitter-*` de PyPI) para codigo, y extraccion semantica con LLM (Gemini si hay clave, si no el propio agente via subagentes) solo para docs, papers e imagenes. Fuente: `~/.claude/skills/graphify/SKILL.md`, Step 3, y `graphify/extract.py` (9375 lineas).
- Salida: `graphify-out/graph.json` (formato node-link de networkx: `nodes`, `links`, `hyperedges`), mas HTML, GraphML, Cypher, wiki. Cada arista lleva `relation`, `confidence` (`EXTRACTED`, `INFERRED`, `AMBIGUOUS`), `confidence_score`, `source_file` y `source_location`. Ids deterministas `{ruta_sin_extension}_{simbolo}`. Fuente: `references/extraction-spec.md` de la skill.
- BD: extractor SQL con tree-sitter (`graphify/extractors/sql.py`) que saca tablas, vistas, funciones y aristas `references` por FK; recorre `column_definitions` pero emite la tabla, no columnas como Atributos. Introspeccion opcional de Postgres en vivo (`pg_introspect.py`, reconstruye DDL y lo pasa por `extract_sql`). Sin extractor de Prisma, Drizzle, Django o SQLAlchemy como modelos (solo detecta migraciones de Django/Alembic como codigo generado). `scip_ingest.py` es un esqueleto "not wired to the CLI".
- Medicion propia: `graphify update <copia de packages/ de este repo> --no-cluster` sobre 404 archivos TS: 3307 nodos y 8336 aristas en 4.7 s, 245 MB de RSS. Relaciones: `contains` 2539, `calls` 1852, `imports_from` 1607, `imports` 1271, `re_exports` 592. Es un grafo de simbolos; no agrega a nivel de paquete.
- Que imitar: la marca de confianza por arista y los ids deterministas derivados de la ruta (permiten refresh incremental). Que no: depender de un runtime Python y de un grafo de simbolos.

### Los proyectos "codegraph"

`gh search repos codegraph --sort stars` devuelve muchos homonimos. Relevantes para el importador:

- **colbymchenry/codegraph** (MIT, TS, ~78.6k estrellas, push 2026-11-23; npm `@colbymchenry/codegraph` 1.6.4). Nucleo en Rust con gramaticas tree-sitter compiladas para 20 lenguajes, mas un motor portable de respaldo; guarda simbolos y aristas (`calls`, `imports`, `extends`, `implements`) en SQLite con FTS5 (`.codegraph/codegraph.db`); MCP server con auto-sync por eventos del SO. Rutas conscientes de framework (Django, Flask, FastAPI, Express, NestJS, Rails, Spring, Gin, Axum, ASP.NET, Next.js, React Router, SvelteKit, Angular y otros) como nodos `route`. No menciona extraccion de esquemas de BD/ORM. Como libreria exige Node 22.5+ (`node:sqlite`) y paquetes por plataforma; trae telemetria anonima (`codegraph telemetry`). Fuente: README del repo (`gh api repos/colbymchenry/codegraph/readme`), secciones How It Works, Framework-aware Routes, Library Usage.
- **CodeGraphContext/CodeGraphContext** (MIT, Python, ~4.4k estrellas). Tree-sitter y SCIP opcional hacia una BD de grafos (FalkorDB Lite por defecto, KuzuDB, Neo4j). Fuente: su README.
- **optave/ops-codegraph-tool** (Apache-2.0, TS, ~100 estrellas): grafo de dependencias a nivel funcion, 34 lenguajes, MCP. Pequeno; sin revisar a fondo.
- Descartados por no ser escaneres generales: xnuinside/codegraph (solo Python), TeodorVecerdi/CodeGraph (programacion visual), Jakedismo/codegraph-rust (sin licencia declarada en GitHub).
- Que imitar: la deteccion de rutas por framework como tabla de patrones (util para `endpoints` en una version posterior). Que no: el modelo de simbolos/llamadas y SQLite, pensados para dar contexto a un agente, no para dibujar.

### floorplan (inspiracion; MIT)

- Escaner `scan.mjs` en Node >= 18 sin dependencias, por regex por lenguaje ("Deliberately approximate: good enough to draw the map, cheap enough to run on any repo", `scripts/lib/extract.mjs`, linea 1-2). Saca imports, simbolos exportados, rutas HTTP y llamadas HTTP, paquetes externos y hosts.
- Dos salidas: `scan.json` grande en disco y un resumen de texto compacto para el agente (o un JSON `floorplan/scan-result@1` con `--json`), que termina con el siguiente paso a seguir (`scan.mjs`, lineas 380-442).
- El agente escribe `architecture.json` (`references/schema.md`): Nodos con `kind`, `parent`, `paths` y `exclude` como globs; cada archivo va a exactamente un Nodo, gana el mas profundo, empate por prefijo literal mas largo, lo no asignado cae en "Unassigned" (objetivo < 10%). Nodos `external` con `packages` y `hosts` convierten imports y llamadas en aristas. Solo se escriben a mano las aristas que el analisis estatico no ve.
- Que imitar: el resumen compacto, la asignacion por globs (hace posible un refresh que respeta lo editado a mano: el agente edita globs y nombres, el escaner recalcula la pertenencia) y "solo escribir lo que el escaner no ve". Que no: regex como tecnica principal para TS/JS si se quiere precision en re-exports y alias.

### Grafo de modulos JS/TS: dependency-cruiser y madge

- **dependency-cruiser** (MIT, 18.9.0, push 2026-11-22). Reporteros `json` (representacion interna, entrada de `depcruise-fmt`), `archi`/`ddot` (colapso a carpetas), `mermaid`, `d2`, `metrics` y otros; `--collapse <profundidad|regex>` vale para todos. Soporta `.js/.ts/.tsx/.mts/.vue/.svelte/.coffee` via transpiladores que deben estar instalados en el proyecto. Fuente: `doc/cli.md` del repo. Medicion propia sobre la misma copia: 456 modulos y 1361 dependencias en 2.8 s, 454 MB de RSS; sin `node_modules` instalado los paquetes del workspace quedan `couldNotResolve`, asi que la resolucion depende del proyecto instalado y de su `tsconfig`.
- **madge** (MIT, 8.0.0): ultima publicacion en npm 2024-08-05; mantenimiento bajo.
- Que imitar: el colapso por carpeta/regex como agregacion de unidades. No adoptar: solo cubre el ecosistema JS y exige el proyecto instalado.

### Parsers: tree-sitter y ast-grep

- **web-tree-sitter** (MIT, 0.27.2, 0 dependencias, 4.7 MB desempaquetado): tree-sitter compilado a WASM, sin node-gyp. **tree-sitter** (node, MIT, 0.25.1) depende de `node-addon-api` y `node-gyp-build` (binario nativo). Fuente: `npm view`.
- Las gramaticas oficiales traen ambos: `tree-sitter-typescript` 0.23.2 publica `tree-sitter-typescript.wasm`, `tree-sitter-tsx.wasm` y `prebuilds/<plataforma>/*.node` (`npm pack --dry-run`). Riesgo a verificar en el prototipo: compatibilidad de ABI entre gramaticas publicadas hace tiempo (typescript 2024-11) y web-tree-sitter 0.27.
- **@ast-grep/napi** (MIT, 0.51.3): Rust nativo con binarios por plataforma en `optionalDependencies`; trae los lenguajes del ecosistema JS y el resto se registra con `registerDynamicLanguage` y paquetes `@ast-grep/lang-*`, una sola vez por proceso. Fuente: https://ast-grep.github.io/guide/api-usage/js-api.html. Patrones legibles, util si las consultas tree-sitter resultan incomodas.
- Lenguajes en tree-sitter: los que ya cubren graphify y codegraph (TS, JS, Python, Go, Rust, Java, C#, Ruby, PHP y mas) muestran que una sola tecnica alcanza a todos.

### Indices semanticos: SCIP

- `scip-code/scip` (Apache-2.0) es el protocolo; los indexadores son por lenguaje (`@sourcegraph/scip-typescript` 0.6.2 Apache-2.0; `scip-python` con licencia NOASSERTION en GitHub). Dan referencias precisas a nivel simbolo pero exigen compilar o instalar el proyecto con su toolchain y producen protobuf. Desproporcionado para cajas de `architecture`; descartar en v1.

### Esquemas de BD y ORMs (para `er`)

- **Prisma**: `@mrleebo/prisma-ast` (MIT, 0.16.0, deps `chevrotain` y `lilconfig`) parsea `schema.prisma` a objeto conservando comentarios y atributos, sin validar. La via oficial es el DMMF (`@prisma/get-dmmf` 7.10.1, Apache-2.0, con `@prisma/prisma-schema-wasm`), pero su README en npm esta vacio y el repo `prisma/orm` se reorganizo: tratarlo como API interna sin garantia. Recomendado: `prisma-ast`.
- **SQL DDL y migraciones**: `tree-sitter-sql` (DerekStride, MIT; es el que usa graphify) o `node-sql-parser` (Apache-2.0, 5.4.0, publicado 2026-01). `sqlglot` (MIT) es Python; descartado por runtime.
- **Drizzle**: `getTableConfig` de `drizzle-orm/pg-core` devuelve `columns`, `foreignKeys`, `primaryKeys`, `indexes` (https://orm.drizzle.team/docs/goodies), pero exige importar el esquema TS del proyecto, es decir ejecutar su codigo. Recomendado: extraccion estatica con tree-sitter de las llamadas `pgTable/mysqlTable/sqliteTable` y `.references(() => t.col)`.
- **Django y SQLAlchemy**: sus APIs de introspeccion (`apps.get_models()`/`_meta`, `inspect()` de SQLAlchemy) requieren cargar la aplicacion. Recomendado: tree-sitter Python sobre `class X(models.Model)` con `ForeignKey/OneToOneField/ManyToManyField`, y sobre `Mapped[...]`/`mapped_column`/`Column(ForeignKey(...))`.
- Regla comun: el escaner nunca ejecuta codigo del proyecto escaneado (coherente con `--trust-code` para Temas de codigo). Lo que no se deduzca estaticamente queda `inferido` o se omite, y el agente lo completa.

## Rendimiento en repos grandes

- Mediciones propias (copia de `packages/`, 404 archivos TS): graphify 4.7 s / 245 MB; dependency-cruiser 2.8 s / 454 MB. Ambas lineales en archivos; un repo de 10k archivos queda en el orden de un minuto, estimacion propia sin medir.
- El tamano del borrador importa mas que el tiempo: 8336 aristas de simbolos no caben con provecho en el contexto del agente. Por eso el borrador agrega a nivel de unidad y la lista por archivo queda en disco, con un resumen compacto aparte (patron floorplan).
- Pendiente para el ticket de implementacion: benchmark propio de web-tree-sitter (WASM) frente al binding nativo sobre un repo grande.

## Formato recomendado del borrador

Un archivo JSON (`.diagrams/importar/borrador.json`, ruta a decidir) mas un resumen de texto en stdout. El agente lee el resumen, consulta el JSON si lo necesita y escribe el `.dg`. Esbozo:

```json
{
  "schema": "rinthel/borrador@1",
  "raiz": ".",
  "commit": "abc123",
  "escaner": "0.1.0",
  "limites": { "archivosNoLeidos": 3, "truncado": false },
  "unidades": [
    { "id": "packages/api", "nombre": "@acme/api", "clase": "paquete", "lenguajes": ["ts"],
      "archivos": 120, "loc": 9400, "entradas": ["src/index.ts"],
      "source": { "file": "packages/api/package.json", "line": 1 } }
  ],
  "dependencias": [
    { "de": "packages/web", "a": "packages/api", "tipo": "import", "peso": 14,
      "ejemplos": [{ "file": "packages/web/src/cliente.ts", "line": 3 }], "confianza": "extraido" }
  ],
  "externos": [ { "id": "npm:stripe", "importadoPor": ["packages/api"], "peso": 6 } ],
  "endpoints": [
    { "metodo": "POST", "ruta": "/orders", "unidad": "packages/api",
      "source": { "file": "packages/api/src/rutas.ts", "line": 40 }, "confianza": "extraido" }
  ],
  "tablas": [
    { "id": "orders", "origen": "prisma", "unidad": "packages/api",
      "source": { "file": "prisma/schema.prisma", "line": 12 },
      "columnas": [
        { "nombre": "id", "tipo": "uuid", "pk": true },
        { "nombre": "customer_id", "tipo": "uuid", "fk": true },
        { "nombre": "note", "tipo": "text", "opcional": true }
      ],
      "relaciones": [
        { "de": "orders#customer_id", "a": "customers#id", "cardinalidad": ["0..*", "1"], "confianza": "extraido" }
      ] }
  ]
}
```

Correspondencia con el Modelo (`CONTEXT.md`, `examples/temas/er.dg`):

| Borrador | Modelo |
|---|---|
| `unidades[]` | Nodo (o Grupo) de `architecture`; `source` pasa a Source |
| `dependencias[]` | Arista entre Nodos; `peso` y `ejemplos` ayudan al agente a decidir cuales dibujar |
| `externos[]` | Nodo externo, si el agente lo considera relevante |
| `tablas[]` | Nodo de Tipo `tabla`; `columnas` son Atributos (`id: uuid pk`, `note: text?`) |
| `relaciones[]` | Arista entre Atributos con cardinalidad (`orders#customer_id "0..*" -> "1" customers#id`) |
| `confianza` | Decide si el agente lo dibuja directo (`extraido`) o lo revisa (`inferido`) |

Reglas del formato:

- Ids deterministas derivados de la ruta o del nombre en el origen, para que un refresh posterior empareje sin depender del orden.
- Todo item lleva `source` (archivo y linea); es lo que permite el refresh incremental que respeta lo editado a mano (#211, Not yet specified).
- El borrador no decide partes ni nombres: eso es del agente. Tampoco escribe `.dg`: no conoce el DSL, y `dsl`, `canonico`, `layout`, `render` y `tema` no conocen el escaner.
- Versionado por `schema`; un cambio incompatible sube el numero.

## Fuentes

- graphify: paquete `graphifyy` 0.9.80 instalado (`METADATA`, `graphify/extract.py`, `graphify/extractors/sql.py`, `graphify/pg_introspect.py`, `graphify/scip_ingest.py`); skill `~/.claude/skills/graphify/SKILL.md` y `references/extraction-spec.md`; https://github.com/Graphify-Labs/graphify.
- codegraph: https://github.com/colbymchenry/codegraph (README); https://github.com/CodeGraphContext/CodeGraphContext (README); https://github.com/optave/ops-codegraph-tool.
- floorplan: clon local, `skills/floorplan/scripts/scan.mjs`, `scripts/lib/extract.mjs`, `references/schema.md`, `LICENSE` (MIT).
- dependency-cruiser: https://github.com/sverweij/dependency-cruiser/blob/main/doc/cli.md. madge: https://github.com/pahen/madge.
- tree-sitter: https://github.com/tree-sitter/tree-sitter, https://github.com/tree-sitter/node-tree-sitter, `npm view web-tree-sitter`, `npm pack tree-sitter-typescript --dry-run`.
- ast-grep: https://ast-grep.github.io/guide/api-usage/js-api.html.
- SCIP: https://github.com/scip-code/scip, https://github.com/sourcegraph/scip-typescript.
- Prisma: `npm view @mrleebo/prisma-ast readme`, `npm view @prisma/get-dmmf`. Drizzle: https://orm.drizzle.team/docs/goodies. SQL: https://github.com/DerekStride/tree-sitter-sql, https://github.com/taozhi8833998/node-sql-parser.
- Metadatos (licencia, ultima actividad): `gh api repos/<repo>` y `npm view <paquete>`, 2026-11-24.
