# sesion

Estado compilado de un Workspace: compila, valida, calcula layout y edita el texto DSL sin tocar disco.

## Que hace
- `abrirSesion` da una `Sesion` inmutable con `diagnosticar`, `construir`, `geometria`, `estilo`, `consultar` (detalle de Nodo, busqueda, `archivo:linea`; la usa `inspect`) y `actualizar`.
- Edita el texto: la puerta de escritura unica `aplicarAlWorkspace` (una Intencion o una lista de ediciones con hash, todo o nada, solo archivos propios del Workspace, por el puerto `PuertoDeWorkspace`), el reductor puro `aplicarIntencion` (`mover-pin`, `ordenar-lifelines`) y el `Historial`. Los Gestos (`src/gestos.ts`) y la aplicacion de ediciones sueltas son internos.
- Workspace vivo, el estado de `dev` sin transporte (`src/workspace-vivo.ts`): `abrirWorkspaceVivo` sobre `PuertoDelWorkspaceVivo` (reloj y hora inyectados; Historial por archivo, cola, versiones, `clasificarCambio`, Diferencia con origen por hash, Registro de actividad), `atenderApiDeDev` (peticion con cuerpo crudo -> respuesta completa, con los bordes 400/403/404/405/409/422/500 y el bundle de `/componentes.js`) y el fake `puertoEnMemoria`.

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
