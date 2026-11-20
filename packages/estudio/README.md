# estudio

App de navegador de `dev`: la pagina que `diagrams dev` sirve en `/` y `/_estudio/*`.

## Que hace
- `navegador/estudio.tsx` (`<Estudio fetch eventos hash layout confirmar>`): marco F con lienzo `VistaInteractiva` (`chrome={false}`), barra de pildoras e islas de vidrio (estetica G neon, tokens `--ui-*` bajo `.ui-chrome` en `tokens.css`). Vista en `#vista=<id>` (`hash-de-estudio.ts`).
- Seams para los paneles: registro `marco/pestanas.tsx` (`PESTANAS_IZQUIERDAS`, `PESTANAS_DERECHAS`, `PILDORAS_DE_LA_BARRA`; componentes sin props) y `useEstudio()` de `marco/contexto.ts` (estado, cliente, Vista, Seleccion, `irAVista`, `abrirPestana`, `alternarIsla`, `previsualizarTema` (Tema previo de la Vista activa, lo usa la galeria `temas/`), `avisar`, `recargar`, `abrirDialogo`, `abrirCodigo`/`sitioDeCodigo`, `vaciarGuardado`/`registrarGuardado`, `plataforma`, `portales` para Base UI). Islas: `marco/use-isla.ts` con limites puros en `marco/limites.ts`. Agente: `agente/actividad.ts` (puras `destinoDelObjetivo`, `marcaDelEvento`, `resumenDelEvento`; almacen por cliente `useActividadDelAgente(cliente)` con `alEnVivo` para cada tanda en vivo y `siguiendo` del interruptor, seams de la Diferencia), panel en `agente/panel-del-agente.tsx` y pildoras en `agente/pildoras.tsx`.
- Comandos: registro unico `COMANDOS` en `navegador/comandos/registro.ts` del que salen los atajos (un solo listener, `use-atajos.ts`), el Buscador (Mod+K, `buscador.tsx`) y la ayuda (`?`, Mod+/, `ayuda.tsx`). Agregar un comando es una entrada `{ id, nombre, teclas: ['Mod+Shift+X'], ambito, ejecutar: (estudio) => ... }` (`ejecutar` recibe `useEstudio()`; `teclas: []` si solo va al Buscador; `enTexto: false` si cede la tecla al editor y a los campos). Ambitos y reglas en `comandos/teclas.ts` (`resolverTecla`, pura). Un boton anuncia su atajo con `<BotonConAtajo comando="id">` (`comandos/atajo.tsx`).
- Codigo (`navegador/editor/`): CodeMirror 6 sobre `GET /api/archivo/<ruta>`; `guardado.ts` (`crearGuardador`: debounce de 400 ms, cambios minimos de `cambios.ts`, `POST /api/edit { ediciones, version, aunqueNoCompile: true }`), issues en linea (`diagnosticos.ts:diagnosticosDe`, el `fix` como accion). Issues (`navegador/issues/`): panel con filtro, salto a `archivo:linea`, boton por `fix` y "Aplicar N fix"; aplicar contra `dev` es `issues/aplicar-fix.ts:aplicarFixes` (version vista, 409 recarga y reintenta una vez, aviso con motivo y archivo), compartido con la accion en linea del editor, `completado.ts`, resaltado `lenguaje.ts` con `palabras-clave.ts` (generado de la gramatica en build) y F12 a la definicion. Seams: vaciar el guardado antes de tocar el Historial (`useEstudio().vaciarGuardado()`, ya en deshacer/rehacer y Mod+S), saltar a `archivo:linea` con `abrirCodigo`, y traer texto del disco sin guardarlo con la anotacion `desdeElDisco` (`marcas-del-disco.ts`). Escrituras externas: `reconciliacion.ts` (puras `diferenciaMinima`, `fusionarTresVias`; solape por lineas, gana el disco) y `guardador.sincronizar({ hash, version })` con el hash de `/api/archivos` (el eco propio no relee); ante 409 mergea y reintenta, y un aviso ofrece recuperar lo perdido. Esc del editor es `salir-del-editor` en `COMANDOS`, ejecutado desde el keymap de CodeMirror tras sus capas.
- `navegador/cliente.ts`: unica pieza con rutas; una conexion SSE con eventos con nombre (`escuchar(nombre, fn)`, `EVENTOS_DE_DEV`), `inspeccionar`, `archivos`/`archivo`, `editar` (Intencion), `editarTexto` (ediciones, `fix` y "Aplicar N fix") y Geometria bajo demanda (`?tema=` para previsualizar).
- `estudio/protocolo`: estado SSE, nombres de eventos, `event: actividad` (`actividadDeDevSchema`: `previos` al conectar, luego en vivo), `/api/inspect`, `/api/archivos`, `/api/archivo/<ruta>` y `PeticionDeEdiciones`. `estudio/contrato` (solo pruebas): `probarContratoDeDev(crear)`, `devEnMemoria` (Sesion real, transporte falso, `anexarActividad`) y `eventosSobreFetch`.
- Build (`tsup` + `scripts/construir.ts`): `dist/estudio/` con `index.html`, `pagina.js`, `worker.js` (sin zod) y `estilo.css` (paso de CSS conectable); `activosDelEstudio()` da sus rutas.

## Que NO hace
- No sirve nada ni toca el Workspace: servidor, disco y `.tsx` de Temas son de `cli`. No dibuja: eso es de `render` y `shell`.
- No va en `NUCLEO`: usa DOM, `fetch` y `EventSource`. Sin Tailwind ni shadcn: Base UI (version fijada) y CSS propio.

## Depende de
`canonico`, `layout`, `render`, `sesion` (solo `devEnMemoria`) y `shell`. Externas: `react`, `react-dom`, `zod`, `@base-ui/react`, CodeMirror 6 en paquetes sueltos (`@codemirror/*`, `@lezer/highlight`; versiones fijadas); `esbuild` en el build; `vitest` peer opcional de `estudio/contrato`.

## Archivo de entrada
`packages/estudio/src/index.ts` (Node), `packages/estudio/src/protocolo.ts` y `packages/estudio/src/contrato.ts`; la pagina arranca en `packages/estudio/navegador/dev.tsx`. Iterar: rebuild y recargar.

## ADR relacionado
`docs/adr/0004-monorepo-pnpm-y-paquetes.md` (enmienda `estudio`) y `docs/adr/0007-interaccion-y-protocolo-de-edicion.md`.

## Probar
`pnpm --filter estudio test`: funciones puras, contrato contra `devEnMemoria` y la app en jsdom (`test/ayudas-de-ui.tsx`: `montarEstudio`, consultas por rol). `cli` corre el mismo contrato contra el `dev` real.
