# sesion

Estado compilado de un Workspace: compila, valida, calcula layout y edita el texto DSL sin tocar disco.

## Que hace
- `abrirSesion` da una `Sesion` inmutable con `diagnosticar`, `construir`, `geometria`, `estilo`, `consultar` (detalle de Nodo, busqueda, `archivo:linea`; la usa `inspect`) y `actualizar`.
- Edita el texto: la puerta de escritura unica `aplicarAlWorkspace` (una Intencion o una lista de ediciones con hash, todo o nada, solo archivos propios del Workspace) y el `Historial` de Intenciones. El reductor `aplicarIntencion`, los Gestos y la aplicacion de ediciones sueltas son internos.
- Workspace vivo, el estado de `dev` sin transporte (`src/workspace-vivo.ts`): `abrirWorkspaceVivo` sobre `PuertoDelWorkspaceVivo` (reloj y hora inyectados; dueno de la secuencia de eventos del protocolo con `conexion` y `escuchar`; Historial de archivos, cola, versiones, Diferencia con origen por hash; compone el Registro de actividad vivo de `src/registro-de-actividad-vivo.ts`), `atenderApiDeDev` (peticion con cuerpo crudo -> respuesta completa, con los bordes 400/404/405/409/422/500) y el fake `puertoEnMemoria`. Solo exporta lo que usa otro paquete.

## Que NO hace
- No lee disco, no observa cambios ni sirve HTTP: el puerto de disco, el watcher y el servidor son de `cli`.
- No parsea DSL ni calcula posiciones: eso es de `dsl` y `layout`.
- No ejecuta ni importa codigo de Temas: lo conoce el adaptador (`componentes`).

## Depende de
`canonico`, `tema`, `dsl` y `layout` (`docs/CODING.md`, "Direccion de dependencias").

## Archivo de entrada
`packages/sesion/src/index.ts` (la cabecera resume la interfaz; el detalle esta en el TSDoc de cada export).

## ADR relacionado
`docs/adr/0007-interaccion-y-protocolo-de-edicion.md` (Intenciones e Historial) y `docs/adr/0005-cli-para-agentes.md` (edicion estructurada).

## Probar
`pnpm --filter sesion test`
