# estudio

App de navegador de `dev`: la pagina que `diagrams dev` sirve en `/` y `/_estudio/*`.

## Que hace
- `navegador/estudio.tsx` (`<Estudio fetch eventos hash layout confirmar>`): marco F con lienzo `VistaInteractiva` (`chrome={false}`), barra de pildoras e islas de vidrio (estetica G neon, tokens `--ui-*` bajo `.ui-chrome` en `tokens.css`). Vista en `#vista=<id>` (`hash-de-estudio.ts`).
- Seams para los paneles: registro `marco/pestanas.tsx` (`PESTANAS_IZQUIERDAS`, `PESTANAS_DERECHAS`, `PILDORAS_DE_LA_BARRA`; componentes sin props) y `useEstudio()` de `marco/contexto.ts` (estado, cliente, Vista, Seleccion, `irAVista`, `abrirPestana`, `alternarIsla`, `avisar`, `portales` para Base UI). Islas: `marco/use-isla.ts` con limites puros en `marco/limites.ts`.
- `navegador/cliente.ts`: unica pieza con rutas; una conexion SSE con eventos con nombre (`escuchar(nombre, fn)`, `EVENTOS_DE_DEV`), `inspeccionar`, ediciones y Geometria bajo demanda.
- `estudio/protocolo`: estado SSE, nombres de eventos y `/api/inspect`. `estudio/contrato` (solo pruebas): `probarContratoDeDev(crear)`, `devEnMemoria` (Sesion real, transporte falso) y `eventosSobreFetch`.
- Build (`tsup` + `scripts/construir.ts`): `dist/estudio/` con `index.html`, `pagina.js`, `worker.js` (sin zod) y `estilo.css` (paso de CSS conectable); `activosDelEstudio()` da sus rutas.

## Que NO hace
- No sirve nada ni toca el Workspace: servidor, disco y `.tsx` de Temas son de `cli`. No dibuja: eso es de `render` y `shell`.
- No va en `NUCLEO`: usa DOM, `fetch` y `EventSource`. Sin Tailwind ni shadcn: Base UI (version fijada) y CSS propio.

## Depende de
`canonico`, `layout`, `render`, `sesion` (solo `devEnMemoria`) y `shell`. Externas: `react`, `react-dom`, `zod`, `@base-ui/react`; `esbuild` en el build; `vitest` peer opcional de `estudio/contrato`.

## Archivo de entrada
`packages/estudio/src/index.ts` (Node), `packages/estudio/src/protocolo.ts` y `packages/estudio/src/contrato.ts`; la pagina arranca en `packages/estudio/navegador/dev.tsx`. Iterar: rebuild y recargar.

## ADR relacionado
`docs/adr/0004-monorepo-pnpm-y-paquetes.md` (enmienda `estudio`) y `docs/adr/0007-interaccion-y-protocolo-de-edicion.md`.

## Probar
`pnpm --filter estudio test`: funciones puras, contrato contra `devEnMemoria` y la app en jsdom (`test/ayudas-de-ui.tsx`: `montarEstudio`, consultas por rol). `cli` corre el mismo contrato contra el `dev` real.
