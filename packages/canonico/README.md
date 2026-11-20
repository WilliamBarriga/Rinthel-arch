# canonico
Esquemas Zod de la Fuente canonica, las funciones puras que la consultan y los contratos que comparten `cli`, `sesion` y `estudio`.

## Que hace
- Define y valida el esquema de la Fuente canonica (Nodos, Aristas, Vistas, Pasos, Paleta) y de la Geometria; `validate` devuelve `Issue` con `hint` y `fix` (codigos en `CODIGOS`).
- `resolveView` selecciona los Nodos de una Vista y, en una Vista `sequence`, resuelve su Interaccion (Lifelines, activaciones; `secuencia.ts`); una Vista `er` se resuelve como `architecture`. `revealAt` interpreta sus Pasos.
- Unico dueno de los contratos versionados: las Intenciones de edicion (`pin.ts`: `mover-pin`, `ordenar-lifelines`, `fijar-tema`), las salidas `--json` de `validate`, `inspect` y `edit`, el Evento de actividad (`actividad.ts`, una linea del Registro de actividad; `crearLectorDeActividad` lee solo lo anexado) y el protocolo de `dev` (`dev.ts`: rutas, eventos SSE, estado, Diferencia, Historial de archivos; `estudio/protocolo` lo reexporta). Un campo nuevo de un contrato se agrega aqui, no en quien lo usa.

## Que NO hace
- No lee texto DSL ni fusiona archivos: eso es de `dsl`.
- No define el contenido de un Tema ni calcula geometria: eso es de `tema` y `layout`.
- No toca disco, reloj ni red: es nucleo puro (el Registro de actividad en disco es de `cli`; el protocolo lo sirve `cli` y lo produce `sesion`).

## Depende de
Ningun paquete del workspace. Es el primero de la cadena (`docs/CODING.md`, "Direccion de dependencias"). Dependencia externa: `zod`.

## Archivo de entrada
`packages/canonico/src/index.ts` (la cabecera documenta invariantes y modos de error).

## ADR relacionado
`docs/adr/0001-dsl-fuente-editable.md` (Fuente canonica), `docs/adr/0002-render-tema-y-revelado.md` (Pasos y colores de Paleta) y `docs/adr/0007-interaccion-y-protocolo-de-edicion.md` (Intenciones y protocolo de `dev`).

## Probar
`pnpm --filter canonico test`
