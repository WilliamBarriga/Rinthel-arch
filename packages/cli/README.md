# cli

Binario `diagrams`: valida, construye, consulta, edita y sirve Workspaces desde la terminal.

## Que hace
- Comandos `validate`, `build`, `skill`, `inspect`, `edit` y `dev`; `run(argv, dependencias?)` devuelve `{ exitCode, stdout, stderr }`.
- Los cuatro Tipos de diagrama (architecture, flow, sequence, er): `build` escribe la Geometria con su `kind`; `inspect` consulta Interacciones y `inspect tema --diagrama <tipo>` los parches por Tipo; `edit --intent` acepta `ordenar-lifelines`.
- Es el unico paquete que lee y escribe disco; `edit` es la unica escritura sobre el DSL. `--json` da un contrato por comando.
- `dev` sirve la vista previa en vivo; compila con esbuild, sin ejecutar, los Temas con codigo (`.tsx`).

## Que NO hace
- No compila DSL ni valida: eso es de `sesion`.
- No calcula geometria ni dibuja: eso es de `layout`, `render` y `shell`.
- Las opciones de cada comando viven en `docs/guia/cli.md`.

## Depende de
`canonico`, `tema`, `dsl`, `layout`, `sesion`, `render` y `shell`. Dependencias externas: `esbuild`, `react`, `react-dom`.

## Archivo de entrada
`packages/cli/src/index.ts` (la cabecera documenta interfaz, invariantes y modos de error).

## ADR relacionado
`docs/adr/0005-cli-para-agentes.md` (con `0008-sistema-de-temas-expresivo.md` para Temas con codigo).

## Probar
`pnpm --filter cli test`
