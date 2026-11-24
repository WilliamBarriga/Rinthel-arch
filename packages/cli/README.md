# cli
Binario `diagrams`: valida, construye, consulta, edita y sirve Workspaces desde la terminal.

## Que hace
- Comandos `validate`, `build`, `skill`, `inspect` (`buscar`, `nodo`, `vista`, `interaccion`, `tema`), `edit`, `dev`, `scan` y `export`; `run(argv, dependencias?)` devuelve `{ exitCode, stdout, stderr }` y no escribe en el proceso (`bin.ts` imprime). El `--help` de cada comando vive en `src/ayuda.ts`; las opciones, en `docs/guia/cli.md`.
- Es el unico paquete que lee y escribe el Workspace en disco; `edit` es la unica escritura sobre el DSL. `--json` da un contrato por comando (esquemas en `canonico`).
- Registro de actividad: `validate`, `build`, `inspect` y `edit` anexan un Evento (`src/actividad.ts`; `DIAGRAMS_ACTIVIDAD=0` lo apaga, `DIAGRAMS_AGENTE` nombra al agente). `src/registro-en-disco.ts` es su unico dueno en disco: `.diagrams/actividad.jsonl` (`CARPETA_DE_SALIDA` de `workspace.ts`), anexado con rotacion a 1 MB y observacion para `dev`.
- `dev` (`src/dev.ts`) sirve la app de `estudio` (`/` y `/_estudio/*`, leida del disco en cada peticion: un rebuild se ve al recargar) y delega `/api/*` en `atenderApiDeDev` sobre el Workspace vivo de `sesion`; aqui solo viven el puerto de disco (`puertoDeDisco`, reemplazable con la opcion `puerto`; el TCP es `puertoHttp`), el watcher, el SSE y la seguridad HTTP (Host, Origin, tamano). `src/codigo.ts` compila con esbuild, sin ejecutar, los Temas con codigo (`.tsx`).
- `export` (`src/export.ts`) opens the live Workspace once (no server, no watcher), captures its data through `atenderApiDeDev` with `capturarExportado` (fonts read with `leerArchivoDeFuente`) and writes `htmlDeExportado` from `estudio`: one read-only HTML.

## Que NO hace
- No compila DSL ni valida: eso es de `sesion`.
- No calcula geometria ni dibuja: eso es de `layout`, `render` y `shell`.
- No tiene codigo de navegador: la pagina de `dev` y la del export son de `estudio` (de el toma `activosDelEstudio`, `RUTA_DEL_ESTUDIO`, `carpetaDelEstudio`, `capturarExportado` y `htmlDeExportado`).

## Depende de
`canonico`, `dsl`, `sesion` y `estudio`. Dependencia externa: `esbuild`.

## Archivo de entrada
`packages/cli/src/index.ts` (la cabecera documenta interfaz, invariantes y modos de error).

## ADR relacionado
`docs/adr/0005-cli-para-agentes.md` (con su enmienda Registro de actividad, y `0008-sistema-de-temas-expresivo.md` para Temas con codigo).

## Probar
`pnpm --filter cli test` (incluye el contrato de `dev` contra el servidor real y las puntas a punta en Chromium de `test/e2e-estudio.test.ts` y `test/e2e-export.test.ts`, que abre un export por http y por `file://`; requiere `pnpm build`).
