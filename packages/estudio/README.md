# estudio
App de navegador de `dev`: la pagina que `diagrams dev` sirve en `/` y `/_estudio/*` (guia de usuario: `docs/guia/ui-de-dev.md`).

## Que hace
- Marco (`navegador/estudio.tsx`): lienzo `VistaInteractiva` (`chrome={false}`), barra de pildoras e islas con limites puros (`marco/use-isla.ts`, `marco/limites.ts`), tokens `--ui-*` bajo `.ui-chrome` (`tokens.css`), Vista en `#vista=<id>` (`hash-de-estudio.ts`). Seams: registro de pestanas `marco/pestanas.tsx` y `useEstudio()` de `marco/contexto.ts` (`irAVista`, `abrirPestana`, `avisar`, `recargar`, `abrirCodigo`, `vaciarGuardado`, `previsualizarTema`, `portales`...).
- Comandos: registro unico `COMANDOS` (`comandos/registro.ts`) del que salen atajos (un solo listener, `use-atajos.ts`; ambitos en `teclas.ts:resolverTecla`), Buscador (Mod+K) y ayuda (`?`). Un comando nuevo es una entrada `{ id, nombre, teclas, ambito, ejecutar(estudio) }`; un boton lo anuncia con `<BotonConAtajo comando="id">`.
- Codigo (`editor/`): CodeMirror 6; `guardado.ts:crearGuardador` (debounce 400 ms, cambios minimos, `aunqueNoCompile`), issues en linea con su `fix`, completado y F12; escrituras externas con `reconciliacion.ts` (`diferenciaMinima`, `fusionarTresVias`) y marcas `desdeElDisco`. Issues (`issues/`): un solo camino `aplicarFixes` (409 recarga y reintenta una vez).
- Agente y Diferencia: almacenes por cliente (WeakMap, no en `useEstudio`) `agente/actividad.ts:useActividadDelAgente` (`alEnVivo`, `siguiendo`) y `diferencia/diferencias.ts`; proyeccion pura `diferencia/proyeccion.ts` y halo en `resaltado.tsx`. Historial: `historial/acciones.ts:moverElHistorial` (unico camino; vacia el guardado antes de deshacer, rehacer o saltar). Galeria: `temas/`.
- `navegador/cliente.ts`: unica pieza con rutas y una conexion SSE con eventos con nombre (`escuchar`). `estudio/protocolo`: esquemas de estado, eventos, rutas y peticiones. `estudio/contrato` (solo pruebas): `probarContratoDeDev(crear)`, `devEnMemoria` (el Workspace vivo de `sesion` sobre `puertoEnMemoria`; solo el transporte es falso) y `eventosSobreFetch`; toda ruta nueva de `dev` va al contrato y a `devEnMemoria`.
- Build (`tsup` + `scripts/construir.ts`): `dist/estudio/` con `index.html`, `pagina.js`, `worker.js` (sin zod) y `estilo.css`; `activosDelEstudio()` da sus rutas.

## Que NO hace
No sirve nada ni toca el Workspace (servidor, disco y `.tsx` de Temas son de `cli`); no dibuja (`render`, `shell`). No va en `NUCLEO`: usa DOM, `fetch` y `EventSource`. Sin Tailwind ni shadcn: Base UI (version fijada) y CSS propio.

## Depende de
`canonico`, `layout`, `render`, `sesion` (solo `devEnMemoria`) y `shell`. Externas: `react`, `react-dom`, `zod`, `@base-ui/react`, CodeMirror 6 (`@codemirror/*`, `@lezer/highlight`; versiones fijadas); `esbuild` en el build; `vitest` peer opcional de `estudio/contrato`.

## Archivo de entrada
`packages/estudio/src/index.ts` (Node), `packages/estudio/src/protocolo.ts` y `packages/estudio/src/contrato.ts`; la pagina arranca en `packages/estudio/navegador/dev.tsx`. Iterar: rebuild y recargar.

## ADR relacionado
`docs/adr/0004-monorepo-pnpm-y-paquetes.md` (enmienda `estudio`) y `docs/adr/0007-interaccion-y-protocolo-de-edicion.md`.

## Probar
`pnpm --filter estudio test`: funciones puras, contrato contra `devEnMemoria` y la app en jsdom (`test/ayudas-de-ui.tsx:montarEstudio`, consultas por rol; `maxWorkers: 2`, timers falsos para debounce y resaltado). `cli` corre el mismo contrato contra el `dev` real y la unica punta a punta en Chromium (`packages/cli/test/e2e-estudio.test.ts`); posicion de marcadores, scroll y arrastres solo se prueban ahi.
