# canonico

Esquema Zod de la Fuente canonica y las funciones puras que la consultan.

## Que hace

- Define el esquema de la Fuente canonica (Nodos, Aristas, Vistas, Pasos, Paleta) y lo valida.
- `validate` devuelve los `Issue` semanticos con `hint` y `fix`; `candidatosCercanos` sugiere correcciones de typos.
- `resolveView` selecciona los Nodos de una Vista; `revealAt` interpreta sus Pasos.
- Define el vocabulario del Gesto de editar un Pin (`IntencionDePin`).

## Que NO hace

- No lee texto DSL ni fusiona archivos del Workspace: eso es de `dsl`.
- No define el contenido de un Tema (Capas, Slots, Metricas): eso es de `tema`.
- No calcula posiciones ni geometria: eso es de `layout`.
- No toca disco, reloj ni red: es nucleo puro.

## Depende de

Ningun paquete del workspace. Es el primero de la cadena (`docs/CODING.md`, "Direccion de dependencias"). Dependencia externa: `zod`.

## Archivo de entrada

`packages/canonico/src/index.ts` (la cabecera documenta invariantes y modos de error).

## ADR relacionado

`docs/adr/0001-dsl-fuente-editable.md` (Fuente canonica) y `docs/adr/0002-render-tema-y-revelado.md` (Pasos y colores de Paleta).

## Probar

`pnpm --filter canonico test`
