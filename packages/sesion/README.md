# sesion
Estado compilado de un Workspace: compila, valida, calcula layout y edita el texto DSL sin tocar disco; tambien el estado de `dev` sin transporte.

## Que hace
- `abrirSesion` da una `Sesion` inmutable con `diagnosticar`, `construir`, `geometria`, `estilo`, `consultar` (detalle de Nodo, busqueda, `archivo:linea`, `inspect tema`; la usa `inspect`) y `actualizar`.
- Edita el texto: la puerta de escritura unica `aplicarAlWorkspace` (una Intencion o una lista de ediciones con hash, todo o nada, solo archivos propios del Workspace; los de `--theme-path` se leen pero no se escriben) y el `Historial` de Intenciones. El reductor, los Gestos y la aplicacion de ediciones sueltas son internos; `diferenciar` da la Diferencia pura entre dos Fuentes.
- Workspace vivo (`src/workspace-vivo.ts`): `abrirWorkspaceVivo` sobre `PuertoDelWorkspaceVivo` (disco, observador y Registro de actividad; `Reloj` y hora inyectados). Unico dueno de la secuencia de eventos del protocolo (`conexion`, `escuchar`), de la cola de escrituras, las versiones y la Diferencia con origen. Compone el Historial de archivos (`src/historial-de-archivos.ts`: deshacer, rehacer y saltar por archivo; una escritura externa no lo reinicia, solo rechaza con `hash-desactualizado` si toco un archivo que la entrada restaura) y el Registro de actividad vivo (`src/registro-de-actividad-vivo.ts`: lectura incremental con debounce).
- `atenderApiDeDev` (`src/api-de-dev.ts`): peticion con cuerpo crudo -> respuesta completa, nunca rechaza; una sola tabla `RUTAS` da ruteo, 404 y 405 (bordes 400/403/409/422/500 y el bundle de `/componentes.js`). Una ruta nueva va aqui, al protocolo de `canonico` y al contrato de `estudio`. `puertoEnMemoria` es el fake del puerto. Solo exporta lo que usa otro paquete (o sus pruebas).

## Que NO hace
- No lee disco, no observa cambios ni sirve HTTP: el puerto de disco, el watcher, el SSE y la seguridad HTTP son de `cli`.
- No parsea DSL ni calcula posiciones: eso es de `dsl` y `layout`.
- No ejecuta ni importa codigo de Temas: recibe los `.tsx` ya compilados (`CodigoCompilado`) del adaptador.

## Depende de
`canonico`, `tema`, `dsl` y `layout` (`docs/CODING.md`, "Direccion de dependencias").

## Archivo de entrada
`packages/sesion/src/index.ts` (la cabecera resume la interfaz; el detalle esta en el TSDoc de cada export).

## ADR relacionado
`docs/adr/0007-interaccion-y-protocolo-de-edicion.md` (Intenciones, Historial y protocolo de `dev`) y `docs/adr/0005-cli-para-agentes.md` (edicion estructurada y Registro de actividad).

## Probar
`pnpm --filter sesion test` (las pruebas cruzan la interfaz publica; reloj falso y Eventos de actividad de prueba en `tests/ayudas/` de la raiz).
