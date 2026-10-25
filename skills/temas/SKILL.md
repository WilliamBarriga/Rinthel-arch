---
name: temas
description: Personalizar la estetica de un diagrama con Temas (Paleta, fuentes, Capas, Slots, Movimientos, Partes). Usalo al crear o ajustar un Tema, cambiar colores o fuentes, animar, o corregir issues de Tema de validate.
---

# Temas: personalizar la estetica

La estetica vive en el **Tema** (texto `.dg`), nunca en el Modelo: cambiar `theme <nombre>` en una Vista cambia el aspecto sin tocar Nodos ni Aristas. Una Vista usa un Tema; los incorporados son `neutral`, `neutral-dark` y `alto-contraste`.

## Bucle

1. **Partir de un Tema existente**: elige el ejemplo mas cercano en `examples/temas/galeria/` (`synthwave` neon, `glass-chip` vidrio, `blueprint` plano, `pcb` circuito, `pixel-art`...) o extiende un incorporado con `theme mio extends neutral-dark { ... }` y escribe solo lo que cambia.
2. **Saber que parche editar**: `dg inspect tema <nombre> --workspace <ruta> --tipo <tipo> --estado <estado>` muestra la pila de Capas con el `archivo:linea` de cada parche. Edita ese parche.
3. **Editar** con el vocabulario cerrado del catalogo: `docs/referencia-catalogo.md` (Primitivas, Slots, Movimientos, Efectos con rangos). Un nombre fuera del catalogo es un error; `validate` propone el parecido.
4. **Validar**: `dg validate --workspace <ruta> --json` hasta `ok: true`. Corrige contraste (`W_THEME_LOW_CONTRAST`) y `W_THEME_COLOR_ONLY` o declara en la primera linea del Tema que su estetica los exige.
5. **Mirar**: `dg dev --workspace <ruta>` y la Vista con ese Tema (ver skill `diagramas` para servirlo).

`dg` es `node packages/cli/dist/bin.js` (`pnpm build` si falta `dist/`).

## Reglas que ahorran errores

- El hex solo existe en `palette`; en todo lo demas un color es un nombre de Paleta, con `nombre/0.4` para opacidad, o `COLOR` (color del Tipo del Nodo) y `ORIGEN` (en Aristas).
- La cascada, donde gana el ultimo: Tema base, Tipo de nodo, estado, parche de la Vista. Los estados (`hover`, `seleccionado`, `fantasma`, `en-ruta`, `atenuado`, `foco`) solo cambian pintura: tamano y Slots quedan fijos.
- Fuentes autohospedadas: archivos `woff2` o `ttf` en `fuentes/` del Workspace, nombrados en `fonts`. Licencia junto al archivo (ejemplos en `examples/rinthel-arch/fuentes/`).
- Ajuste solo para una Vista: `theme <nombre> { layer borde { color amber } }` dentro de la `view`.
- Parte reutilizable: `part <nombre> { ... }` y `use <nombre>` en un parche; el nombre es unico en el Workspace.
- El trazado de las Aristas es del layout; el Tema pinta, no enruta.
- Un Tema con componentes `.tsx` ejecuta codigo en el visor: `dev` pide confirmacion o `--trust-code`.

## Referencias

- Tutorial de Temas con ejemplos: `docs/guia/personalizar-temas.md`.
- Contrato y razones: `docs/adr/0008-sistema-de-temas-expresivo.md`.
- Un Tema de ejemplo nuevo o modificado: `pnpm docs:capturas` regenera `docs/img/`; `examples/rinthel-arch/temas/` debe quedar identico a `examples/temas/galeria/` (una prueba lo exige).
