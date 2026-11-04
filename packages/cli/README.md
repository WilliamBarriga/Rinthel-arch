# cli

Binario `diagrams`: valida, construye, consulta, edita y sirve Workspaces desde la terminal.

## Que hace

- Comandos `validate`, `build`, `skill`, `inspect`, `edit` y `dev`; `run(argv, dependencias?)` devuelve `{ exitCode, stdout, stderr }` sin escribir en el proceso.
- Es el unico paquete que lee y escribe disco: lee el Workspace y escribe `<workspace>/.diagrams/`; `edit` es la unica escritura sobre el DSL.
- `--json` emite un objeto con contrato propio por comando (`contractVersion`).
- `dev` sirve la vista previa en vivo en 127.0.0.1.
- Compila con esbuild, sin ejecutar, los Temas con codigo (`.tsx`).

## Que NO hace

- No compila DSL ni valida: eso es de `sesion` (con `dsl` y `canonico`).
- No calcula geometria: eso es de `layout`.
- No dibuja diagramas: eso es de `render` y `shell`.
- Las opciones de cada comando viven en `docs/guia/cli.md`, no aqui.

## Depende de

`canonico`, `tema`, `dsl`, `layout`, `sesion`, `render` y `shell`. Dependencias externas: `esbuild`, `react`, `react-dom`.

## Archivo de entrada

`packages/cli/src/index.ts` (la cabecera documenta interfaz, invariantes y modos de error).

## ADR relacionado

`docs/adr/0005-cli-para-agentes.md` (con `0008-sistema-de-temas-expresivo.md` para Temas con codigo).

## Probar

`pnpm --filter cli test`
