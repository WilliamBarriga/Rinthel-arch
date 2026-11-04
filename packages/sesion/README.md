# sesion

Estado compilado de un Workspace: compila, valida, calcula layout y edita el texto DSL sin tocar disco.

## Que hace
- `abrirSesion` da una `Sesion` inmutable con `diagnosticar`, `construir`, `geometria`, `estilo` y `actualizar`.
- Edita el texto: `aplicarEdiciones`, `editarPin`, `aplicarIntencion` y `Historial`; `aplicarAlWorkspace` escribe por el puerto `PuertoDeWorkspace`.

## Que NO hace
- No lee disco ni observa cambios: eso es de `cli`.
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
