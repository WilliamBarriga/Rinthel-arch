# estudio

App de navegador de `dev`: la pagina que `diagrams dev` sirve en `/` y `/_estudio/*`.

## Que hace
- `navegador/`: pagina, cliente SSE (unica pieza que conoce las rutas), Geometria bajo demanda, Historial (deshacer/rehacer), mover y ordenar, worker de layout y cargador de Componentes de Tema con su confirmacion.
- Build (`tsup` + `scripts/construir.ts`): deja en `dist/estudio/` `index.html`, `pagina.js`, `worker.js` (sin zod) y `estilo.css`; el paso de CSS es conectable (`construirEstudio({ salida, css })`).
- `activosDelEstudio()` (entrada de Node) da las rutas de esos archivos; `estudio/protocolo` declara el estado SSE (`EstadoDeDev`, `IssueDeDev`, `TipoDeCambio`).

## Que NO hace
- No sirve nada ni toca el Workspace: el servidor, el disco y la compilacion de los `.tsx` de Temas son de `cli`.
- No dibuja ni hace pan/zoom: eso es de `render` y `shell`.
- No va en `NUCLEO`: usa DOM, `fetch` y `EventSource`.

## Depende de
`canonico`, `layout`, `render` y `shell`. Externas: `react`, `react-dom`, `zod`; `esbuild` solo en el build.

## Archivo de entrada
`packages/estudio/src/index.ts` (Node) y `packages/estudio/src/protocolo.ts`; la pagina arranca en `packages/estudio/navegador/dev.tsx`. Iterar la UI: rebuild del paquete y recargar (dev lee los estaticos en cada peticion).

## ADR relacionado
`docs/adr/0004-monorepo-pnpm-y-paquetes.md` (enmienda `estudio`) y `docs/adr/0007-interaccion-y-protocolo-de-edicion.md`.

## Probar
`pnpm --filter estudio test` (requiere los paquetes anteriores construidos).
