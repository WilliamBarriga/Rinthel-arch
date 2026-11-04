# sesion

Estado compilado de un Workspace (Sesion), Intenciones de edicion e historial de deshacer.

## Que hace

- `abrirSesion` compila, valida y calcula layout; es la unica tuberia que comparten `cli`, `dev` e `inspect`.
- La Sesion es inmutable: `actualizar` devuelve otra y reutiliza la geometria de las Vistas sin cambios.
- `aplicarIntencion` es el reductor puro de Intenciones; `editarPin` reescribe el Pin en el texto.
- `Historial` (`crearHistorial`, `editarEnHistorial`, `deshacer`, `rehacer`, `apilar`) es la pila inmutable de deshacer y rehacer sobre el texto.

## Que NO hace

- No lee ni escribe disco ni observa archivos: eso es de `cli`.
- No importa codigo de usuario: el adaptador de `cli` entrega la interfaz de los componentes.
- No dibuja ni maneja el raton: eso es de `render` y `shell`.

## Depende de

`canonico`, `dsl`, `layout` y `tema`.

## Archivo de entrada

`packages/sesion/src/index.ts` (la cabecera documenta invariantes y modos de error).

## ADR relacionado

`docs/adr/0007-interaccion-y-protocolo-de-edicion.md` (Intenciones e historial) y `docs/adr/0008-sistema-de-temas-expresivo.md` (via de escape en codigo).

## Probar

`pnpm --filter sesion test`
