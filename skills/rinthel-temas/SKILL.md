---
name: rinthel-temas
description: Personalizar la estetica de un diagrama con Temas (Paleta, fuentes, Capas, Slots, Movimientos, Partes, y los Elementos de secuencia y ER). Usalo al crear o ajustar un Tema, estilizar una Vista sequence o er, cambiar colores o fuentes, animar, o corregir issues de Tema de validate.
---

# Temas: personalizar la estetica

La estetica vive en el **Tema** (texto `.dg`), nunca en el Modelo: cambiar `theme <nombre>` en una Vista cambia el aspecto sin tocar Nodos ni Aristas. Una Vista usa un Tema; los incorporados son `neutral`, `neutral-dark` y `alto-contraste`.

## Bucle

1. **Partir de un Tema existente**: elige el ejemplo mas cercano en `examples/rinthel-arch/temas/` (`synthwave` neon, `glass-chip` vidrio, `blueprint` plano, `pcb` circuito, `pixel-art`...) o extiende un incorporado con `theme mio extends neutral-dark { ... }` y escribe solo lo que cambia.
2. **Saber que parche editar**: `dg inspect tema <nombre> --workspace <ruta> --tipo <tipo> --estado <estado> --diagrama <tipo>` muestra la pila de Capas con el `archivo:linea` de cada parche. Edita ese parche.
3. **Editar** con el vocabulario cerrado del catalogo: `docs/referencia-catalogo.md` (Primitivas, Slots, Movimientos, Efectos con rangos). Un nombre fuera del catalogo es un error; `validate` propone el parecido.
4. **Validar**: `dg validate --workspace <ruta> --json` hasta `ok: true`. Corrige contraste (`W_THEME_LOW_CONTRAST`) y `W_THEME_COLOR_ONLY` o declara en la primera linea del Tema que su estetica los exige.
5. **Mirar**: `dg dev --workspace <ruta>` y la Vista con ese Tema (ver skill `rinthel-diagramas` para servirlo).

`dg` es el CLI `diagrams` (ver `rinthel-diagramas`). Las rutas `docs/` y `examples/` son del repo rinthel-arch.

## Secuencia, ER y Tipo de diagrama

Si el Tema no declara estos Elementos, se derivan de `edge` y `node`: una Vista `sequence` o `er` se dibuja bien con cualquier Tema, asi que declara solo lo que quieras distinto. `neutral` los declara todos y es el modelo de referencia.

| Elemento | Se declara en | Se deriva de |
| --- | --- | --- |
| `lifeline`, `message` (parches `kind <tipo>`) | nivel de `edge` | `edge` |
| `activation`, `fragment` (parches `op <operador>`), `note` | nivel de `node` | `node` |
| `row` (tabla ER: `alternate`, `key pk`, `optional`, `name`, `type`) | nivel de `node` | Slot `attrs` |
| `zone header`, `body` o `all` en una Capa de Nodo | dentro de `layer` | `all` |
| `diagram <tipo> { ... }` en `node`, `group`, `edge` | cualquier bloque | el parche solo aplica a ese Tipo |
| marcadores `cross`, `one`, `zero-one`, `many`, `zero-many` | `end`/`start` de una Arista | la cardinalidad y el tipo de Mensaje |

- Las separaciones de secuencia son Metricas del Tema (`gap`, `loop-width`, `create-offset`, `width`, `padding`) y `row { height }` lo es de ER: cambian la Geometria. Capas y colores solo pintan.
- Los marcadores ER los elige el nucleo segun la cardinalidad; el Tema cambia solo su `color` y `size`.
- Este Tema valida tal cual y estiliza una secuencia y una tabla:

```
specification { node servicio { description "Un servicio" icon box color blue } }
model {
  servicio cliente "Cliente"
  servicio api "API"
  interaction compra "Compra" {
    cliente -> api "POST /pedidos"
    reply api -> cliente "201"
  }
}
theme mio extends neutral {
  node { diagram er { layer cabecera solid after borde { color blue  zone header } } }
  message { kind reply { layer linea { style dashed } } }
  lifeline { gap 220 }
  row { height 30 }
}
view compra { type sequence interaction compra theme mio }
```

- Para ver la pila de un Elemento: `dg inspect tema mio --workspace <ruta> --diagrama sequence`. Referencia: `docs/guia/personalizar-temas.md` (secciones Tablas ER y Secuencia), `examples/temas/secuencia.dg`, `examples/temas/er.dg` y los rangos en `docs/referencia-catalogo.md`.

## Reglas que ahorran errores

- El hex solo existe en `palette`; en todo lo demas un color es un nombre de Paleta, con `nombre/0.4` para opacidad, o `COLOR` (color del Tipo del Nodo) y `ORIGEN` (en Aristas).
- La cascada, donde gana el ultimo: Tema base, Tipo de nodo, estado, parche de la Vista. Los estados (`hover`, `seleccionado`, `fantasma`, `en-ruta`, `atenuado`, `foco`) solo cambian pintura: tamano y Slots quedan fijos.
- Fuentes autohospedadas: archivos `woff2` o `ttf` en `fuentes/` del Workspace, nombrados en `fonts`. Licencia junto al archivo (ejemplos en `examples/rinthel-arch/temas/fuentes/`).
- Ajuste solo para una Vista: `theme <nombre> { layer borde { color amber } }` dentro de la `view`.
- Parte reutilizable: `part <nombre> { ... }` y `use <nombre>` en un parche; el nombre es unico en el Workspace.
- El trazado de las Aristas es del layout; el Tema pinta, no enruta.
- Un Tema con componentes `.tsx` ejecuta codigo en el visor: `dev` pide confirmacion o `--trust-code`.

## Referencias

- Tutorial de Temas con ejemplos: `docs/guia/personalizar-temas.md`.
- Contrato y razones: `docs/adr/0008-sistema-de-temas-expresivo.md`.
- Un Tema de ejemplo nuevo o modificado: `pnpm docs:capturas` regenera `docs/img/`; `examples/rinthel-arch/temas/` es la unica copia (la galeria la toma con `--theme-path`); no dupliques Temas ni fuentes.
