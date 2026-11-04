# cli

Binario `diagrams`: `validate`, `build`, `skill`, `inspect`, `edit` y `dev`.

## Que hace

- `run(argv, dependencias?)` devuelve `{ exitCode, stdout, stderr }`; `src/bin.ts` imprime el resultado.
- `validate` y `build` devuelven todos los issues en una pasada, ordenados; `build` escribe `canonico.json` y `geometria/<vista>.json` en `<workspace>/.diagrams/`.
- `dev` sirve el visor (empaquetado con esbuild desde `navegador/`) y observa el Workspace; `edit` aplica Intenciones sobre el texto.
- Es el unico paquete con I/O de disco y red.

## Que NO hace

- No compila DSL ni calcula layout: usa `sesion`, que usa `dsl` y `layout`.
- No dibuja ni maneja la interaccion: el visor del navegador usa `render` y `shell`.
- No define el esquema de la Fuente canonica: eso es de `canonico`.

## Depende de

`canonico`, `dsl`, `sesion` y `tema` en `src/`; `layout`, `render` y `shell` en `navegador/`. Dependencias externas: `esbuild`, `react` y `react-dom`.

## Archivo de entrada

`packages/cli/src/index.ts` (la cabecera documenta cada comando y sus codigos de salida).

## ADR relacionado

`docs/adr/0005-cli-para-agentes.md` (comandos) y `docs/adr/0007-interaccion-y-protocolo-de-edicion.md` (`edit`).

## Probar

`pnpm --filter cli test`
