---
name: diagramas
description: Escribir, validar y servir diagramas .dg (Nodos, Aristas, Vistas, Pasos) con el CLI de este repo. Usalo al crear o editar un Workspace, al arreglar issues de validate, o al mostrar un diagrama al usuario.
---

# Diagramas: escribir y servir

Un **Workspace** es una carpeta de `.dg`; el DSL de texto es la unica fuente editable (ADR 0001). `.diagrams/` es salida derivada: se regenera, no se edita. Vocabulario exacto en `CONTEXT.md` (Modelo, Vista, Pin, Paso).

El CLI es `node packages/cli/dist/bin.js` (abreviado `dg`); si no existe `dist/`, corre `pnpm build`. `dg <comando> --help` es la fuente de las opciones; el contrato completo esta en `docs/guia/cli.md`.

## Bucle

1. **Ubicar**: `dg inspect buscar <texto> --workspace <ruta>` da ids cualificados y `archivo:linea`. Usa ids que `inspect` devolvio.
2. **Editar** el `.dg`. Sintaxis en `docs/guia/referencia-dsl.md`; ejemplo vivo: `examples/rinthel-arch/`.
3. **Validar**: `dg validate --workspace <ruta> --json`. Aplica primero cada `fix` (por `dg edit --edits '<json>'` o a mano), lee `hint` cuando no hay `fix`, y guiate por `code` (estable; `message` cambia).
4. **Cerrar** cuando `ok` es `true` y el resumen no trae errores. Con `--strict`, tambien sin avisos.
5. **Mirar** el resultado (abajo) cuando el cambio es visual: una Vista nueva, Pins, Pasos.

## Servir y mostrar

- `dg dev --workspace <ruta> --port <N>` sirve el visor en `http://127.0.0.1:<N>/#p=<vista>`. Lanzalo en segundo plano, espera la linea con la URL con Monitor y entrega esa URL al usuario.
- `dev` recompila al guardar: edita el `.dg` y el visor se actualiza solo. Arrastrar un Nodo en el visor reescribe su `pin` en el `.dg`; vuelve a leer el archivo antes de editarlo.
- Imagen de una Vista, para ti o para el usuario: `pnpm capturas --workspace <ruta> --vista <id> <tema>...` (necesita `pnpm build` y Chromium) deja los PNG en `/tmp/rinthel-capturas` y sirve una pagina; entrega la URL `http://localhost:<puerto>/salida/`. Firefox del usuario no ve este disco: sirve todo por localhost.
- Un Workspace con Tema de codigo (`.tsx`) exige `--trust-code` o confirmar en el visor; confia solo en Workspaces propios.

## Ejemplos para copiar

| Quiero... | Mira |
| --- | --- |
| El primer diagrama, paso a paso | `examples/tutorial/paso-1` a `paso-5`, y `docs/guia/tutorial.md` |
| Un Modelo grande con drill-down y Pasos | `examples/rinthel-arch/` (Vistas `paquetes`, `flujo-edicion`) |
| Ver un Tipo de nodo en cada estado | `examples/temas/galeria/` |

## Consultar antes de inventar

- Sintaxis o bloque desconocido: `docs/guia/referencia-dsl.md`.
- Estetica, colores, fuentes, animacion: skill `temas`.
- Cambiar el DSL, un Tema de ejemplo o el CLI: actualiza `docs/guia/` (y `docs/guia/cli.md` si cambian opciones); `pnpm docs:catalogo` regenera `docs/referencia-catalogo.md`.
