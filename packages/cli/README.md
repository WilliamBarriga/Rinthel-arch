# cli

Binario `diagrams`: valida, construye, consulta, edita y sirve Workspaces desde la terminal.

## Que hace
- Comandos `validate`, `build`, `skill`, `inspect`, `edit` y `dev`; `run(argv, dependencias?)` devuelve `{ exitCode, stdout, stderr }`.
- Los cuatro Tipos de diagrama (architecture, flow, sequence, er): `build` escribe la Geometria con su `kind`; `inspect` consulta Interacciones y `inspect tema --diagrama <tipo>` los parches por Tipo; `edit --intent` acepta `ordenar-lifelines`.
- Es el unico paquete que lee y escribe disco; `edit` es la unica escritura sobre el DSL. `--json` da un contrato por comando.
- `dev` sirve la vista previa en vivo: la app de `estudio` (`/` y `/_estudio/*`, leida del disco en cada peticion) y compila con esbuild, sin ejecutar, los Temas con codigo (`.tsx`, en `/componentes.js`). Su estado es el Workspace vivo de `sesion` (`abrirWorkspaceVivo`, `atenderApiDeDev`); `src/dev.ts` pone el puerto de disco (`puertoDeDisco`, reemplazable con la opcion `puerto`; el TCP es `puertoHttp`), el watcher y el servidor HTTP/SSE. `src/registro-en-disco.ts` es dueno del Registro de actividad, en la carpeta de salida `.diagrams/` (`CARPETA_DE_SALIDA` de `workspace.ts`) (anexado con rotacion y observacion).

## Que NO hace
- No compila DSL ni valida: eso es de `sesion`.
- No calcula geometria ni dibuja: eso es de `layout`, `render` y `shell`.
- No tiene codigo de navegador: la pagina de `dev` es de `estudio`; de `estudio/protocolo` solo importa tipos.
- Las opciones de cada comando viven en `docs/guia/cli.md`.

## Depende de
`canonico`, `tema`, `dsl`, `layout`, `sesion` y `estudio`. Dependencia externa: `esbuild`.

## Archivo de entrada
`packages/cli/src/index.ts` (la cabecera documenta interfaz, invariantes y modos de error).

## ADR relacionado
`docs/adr/0005-cli-para-agentes.md` (con `0008-sistema-de-temas-expresivo.md` para Temas con codigo).

## Probar
`pnpm --filter cli test`
