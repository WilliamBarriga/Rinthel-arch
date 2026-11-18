# Editor de texto del DSL en la UI de dev

Ticket: #170 (mapa #168, "UI de dev"). Fecha: 2026-11-18.

Pregunta: que componente de editor usar en la UI local de `dev` (CodeMirror 6, Monaco u otro) y de donde salen resaltado, issues en linea, autocompletado y salto a definicion: Langium en el navegador (LSP en un Worker) o la Sesion del servidor por SSE.

## Conclusion

- **Editor: CodeMirror 6** (MIT), por paquetes sueltos (`@codemirror/view`, `state`, `language`, `lint`, `autocomplete`, `commands`). Pesa ~113-126 KB gzip con esbuild y las opciones de `packages/cli/src/empaquetar.ts`, frente a ~703 KB gzip + 91 KB de CSS + un Worker obligatorio de ~95 KB gzip de Monaco minimo. Monaco no aporta nada que necesitemos y casi triplica el bundle actual del visor (~240 KB gzip).
- **Semantica: la Sesion del servidor, no Langium en el navegador.** Los issues de `validate` no salen de validadores de Langium sino de `compile` (multi-archivo) mas `diagnosticar` de la Sesion (accesibilidad, codigo de Tema, fuentes, avisos de layout con ELK). La gramatica no tiene referencias cruzadas de Langium (`[Tipo:ID]`): los nombres se resuelven en `compile`. Un LSP de Langium en un Worker solo daria, sin reescribir medio `dsl` como servicios de scoping y validacion, errores de sintaxis y palabras clave; y seria una segunda verdad de issues distinta de `validate`.
- **Reparto propuesto:**
  - Resaltado: en el cliente, un `StreamLanguage` de CodeMirror con las palabras clave de la gramatica (se pueden extraer en build del `grammar.ts` generado, sin meter `langium` en el bundle). Langium no genera gramaticas Lezer/CodeMirror (solo TextMate, Monarch, Prism).
  - Issues en linea: los `Issue` de la Sesion (ya llevan `file`, `line`, `column`, rango y sugerencia) llegan por el SSE de `dev` y se pintan con `setDiagnostics` de `@codemirror/lint`; el `fix` sugerido encaja en `Diagnostic.actions`.
  - Autocompletado: un `CompletionSource` propio que mezcla palabras clave (estaticas) e ids de la ultima Fuente canonica buena (Nodos, Vistas, Tipos de nodo, Temas, Slots del catalogo de `tema`), pedidos a una ruta de consulta de `dev`.
  - Salto a definicion: `Sesion.consultar({ comando: 'nodo' | 'vista' | 'interaccion' })` ya devuelve `archivo:linea`; basta una ruta de consulta y un keymap (p. ej. Ctrl/Cmd+clic).
- **Sin LSP por ahora.** Si mas adelante se quiere LSP (por ejemplo para editores externos), el camino de menor costo es un servidor LSP sobre la Sesion en Node y `@codemirror/lsp-client` (MIT, oficial de CodeMirror, +21 KB gzip) en el navegador; no un Worker con Langium.
- Pendientes para otros tickets: como llega el buffer sin guardar a la Sesion (#174, edicion frente a escrituras externas) y la forma de las rutas de consulta y de completado (#176).

## Contexto del repo (verificado en codigo)

- `packages/dsl` compila con Langium 4.4 usando solo los servicios core (`createDefaultCoreModule`, `EmptyFileSystem`), sin `langium/lsp` (`packages/dsl/src/compilar.ts`). `compile` es puro, no lee disco y devuelve `issues`, `pins`, `ubicar` y `origenesDeTemas`.
- La gramatica (`packages/dsl/src/gramatica/diagramas.langium`, 535 lineas, derivada de LikeC4) no declara referencias cruzadas de Langium; `grep '\[[A-Za-z]+(:[A-Za-z]+)?\]'` solo encuentra un comentario. Toda resolucion de nombres (Nodos, Aristas, Vistas, Temas, `extends`) vive en `compile` y `temas.ts`.
- `langium-config.json` no pide salidas de resaltado (ni TextMate ni Monarch).
- `Sesion.diagnosticar()` suma a los issues de `compile` los avisos de accesibilidad, de codigo de Tema, de fuentes y de layout (asincronos, con ELK) (`packages/sesion/src/sesion.ts`, lineas ~303-308). Ninguno de estos existe en Langium.
- `Sesion.consultar` responde `buscar`, `nodo`, `vista`, `interaccion` con `file` y `line` (`packages/sesion/src/consultas.ts`).
- `dev` ya emite el estado (con issues y `href` `archivo:linea:columna`) por SSE en `/eventos` y empaqueta pagina y Worker de layout con esbuild en IIFE (`packages/cli/src/dev.ts`, `dev-shell.ts`, `empaquetar.ts`).

## Comparacion de editores

| | CodeMirror 6 | Monaco | Monaco + monaco-languageclient |
|---|---|---|---|
| Licencia | MIT (cada `@codemirror/*`) | MIT | MIT (TypeFox) + `@codingame/monaco-vscode-api` MIT |
| Ultima version (npm, 2026-11) | `view` 6.43.15 (2026-10-19), `lint` 6.9.8 (2026-11-13), `lsp-client` 6.3.1 (2026-11-16) | 0.57.0; canales `0.58.0-dev` casi diarios | 11.0.3 (2026-10-15) |
| JS minificado (esbuild, IIFE, es2020) | 349 KB minimo / 391 KB `basicSetup` | 2.72 MB (`monaco-editor/editor`, sin lenguajes) / 4.55 MB (todo) | no medido; arrastra `monaco-vscode-api` (58 MB desempaquetado) |
| gzip -9 | 113 KB / 126 KB | 703 KB / 1.18 MB | mayor que Monaco |
| CSS aparte | no (estilos en JS) | 91 KB / 175 KB + fuente `codicon.ttf` | idem |
| Worker obligatorio | no | si, `editor.worker` (307 KB, 95 KB gzip) | si |
| Bundler | cualquiera, ESM puro | ESM; AMD deprecado desde 0.53; README de Monaco pide bundler | el proyecto usa Vite como camino principal |
| Diagnosticos externos | `setDiagnostics(state, Diagnostic[])` con `severity` y `actions` | `editor.setModelMarkers` | via LSP |
| Completado propio | `CompletionSource` (sincrono o `Promise`) | `registerCompletionItemProvider` | via LSP |
| LSP | `@codemirror/lsp-client` (oficial): completado, hover, diagnosticos, definicion, rename, formato, referencias; sin semantic tokens | nativo desde 0.55 (`lsp` namespace) | completo |

Referencia: el bundle actual de la pagina de `dev` (`packages/cli/navegador/dev.tsx`), medido igual, pesa 913 KB / 240 KB gzip. CodeMirror lo sube ~50 %; Monaco minimo lo multiplica por ~4.

Mantenimiento: el repo de GitHub `codemirror/dev` esta archivado (ultimo push 2026-04-15) porque el desarrollo se movio a `code.haverbeke.berlin` (las URLs `repository` de npm apuntan alli); la cadencia de releases en npm sigue activa (260 versiones de `@codemirror/view`). Monaco (`microsoft/monaco-editor`, activo) sigue al nucleo de VS Code y rompe API entre minors (0.55 movio namespaces, 0.56 reorganizo los modulos ESM). Langium (`eclipse-langium/langium`, activo, 4.4.2 del 2026-11-09).

## Langium en el navegador: que daria y que no

- Langium corre en un Worker con `langium/lsp` + `vscode-languageserver/browser` (`BrowserMessageReader/Writer`); asi lo hacen los ejemplos de Langium en `monaco-languageclient` ("Langium examples communicate via `vscode-languageserver-protocol/browser`"). La guia Langium + Monaco de langium.org se movio a la documentacion de monaco-languageclient.
- Medido con nuestra gramatica generada: Worker LSP de Langium = 762 KB min / 173 KB gzip; solo parser core = 495 KB / 115 KB gzip.
- Gratis con la gramatica actual: errores de sintaxis, completado de palabras clave, outline. No gratis: issues semanticos, completado de ids, definicion; requieren `ScopeProvider`, `Linker` y validadores propios que duplican `compile`, y aun asi faltarian los avisos de layout, fuentes y codigo de Tema, que necesitan ELK, archivos y el adaptador de Componentes.
- Monaco + Langium empuja hacia `monaco-languageclient` y `@codingame/monaco-vscode-api`, una pila grande y versionada en bloque con VS Code, pensada para Vite.

## Por que la Sesion y no Langium

1. Una sola verdad de issues: los mismos `Issue` que ve `validate` y el agente, con los mismos codigos y `fix`.
2. Ya existe el canal: SSE en `/eventos`, y la Sesion ya resuelve consultas con `archivo:linea`.
3. Costo: `compile` tarda ~1 ms tras crear los servicios (comentario en `compilar.ts`); en localhost la ida y vuelta es despreciable frente a un debounce de escritura de 150-300 ms.
4. Agnostico: no ata la UI a LSP ni a VS Code.

Riesgo: la latencia de los avisos de layout (asincronos). Mitigacion: pintar primero los issues de `compile` y despues los de `diagnosticar` cuando lleguen, o separar los dos en el contrato de #176.

## Fuentes

- npm registry (`npm view <paquete> version license time repository.url dist.unpackedSize`), consultado 2026-11-18: `codemirror`, `@codemirror/{view,state,language,lint,autocomplete,lsp-client}`, `monaco-editor`, `monaco-languageclient`, `@codingame/monaco-vscode-api`, `langium`, `vscode-languageserver`.
- GitHub API (`gh api repos/<repo>`): `codemirror/dev` (archivado), `microsoft/monaco-editor`, `eclipse-langium/langium`, `TypeFox/monaco-languageclient`.
- README y CHANGELOG de `@codemirror/lsp-client` 6.3.1 y tipos de `@codemirror/lint` y `@codemirror/autocomplete` (paquetes npm).
- CHANGELOG de `monaco-editor` 0.57.0 (secciones 0.53-0.57) y su README (workers, `file://`).
- README de https://github.com/TypeFox/monaco-languageclient (versiones alineadas, ejemplos Langium, Vite).
- https://langium.org/docs/learn/minilogo/langium_and_monaco/ (aviso de que la guia se movio a monaco-languageclient).
- Esquema de `langium-cli` 4.4.0 (`langium-config-schema.json`): salidas `textMate`, `monarch`, `prism`, `railroad`.
- Mediciones propias: esbuild 0.28.1, `--bundle --minify --format=iife --platform=browser --target=es2020` (mismas opciones que `empaquetar.ts`), gzip -9; entradas minimas que crean un editor vacio, y un Worker LSP de Langium con `src/generated/module.ts` de `packages/dsl`.
