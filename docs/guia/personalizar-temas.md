# Personalizar con Temas

La estetica de un diagrama vive en el **Tema**, nunca en el Modelo: el mismo Modelo y la misma Vista se pueden ver como tarjetas sobrias, neon o placa de circuito cambiando una linea (`theme <nombre>`). Esta guia explica como esta hecho un Tema y como escribir uno. Si no lo has hecho, empieza por el [tutorial](tutorial.md). La lista exacta de Primitivas, propiedades y rangos esta en el [catalogo](../referencia-catalogo.md); el contrato, en el [ADR 0008](../adr/0008-sistema-de-temas-expresivo.md).

## Elegir un Tema

- Los incorporados: `neutral` (defecto), `neutral-dark` y `alto-contraste`.
- Los 14 de ejemplo, en [`examples/temas/galeria/`](../../examples/temas/galeria/): `soft-card`, `glass-chip`, `neobrutalist`, `blueprint`, `claro-suave`, `crt-terminal`, `synthwave`, `editorial`, `bauhaus`, `sticky-notes`, `keycaps`, `metro-map`, `pcb` y `pixel-art`. Copia el `.dg` de uno a tu Workspace (y sus fuentes, ver abajo) y usalo en una Vista. Para ver todos aplicados a un mismo diagrama, mira la [galeria del README](../../README.md#galeria).
- El tuyo: un bloque `theme` en cualquier `.dg` del Workspace.

Una Vista usa un Tema. Se puede ajustar solo para esa Vista con un parche entre llaves:

```
view destacado {
  type architecture
  theme tienda { layer borde { color amber  width 3 } }
  include **
}
```

## Anatomia de un Tema

```
theme mi-tema extends neutral-dark {   // `extends` es opcional; un solo padre
  palette { ... }   // nombres de color
  fonts   { ... }   // familias tipograficas
  tokens  { ... }   // fondo, texto y borde por defecto
  page    { ... }   // Capas del fondo de la pagina
  node    { ... }   // Capas, Slots, parches por Tipo y por estado
  group   { ... }   // lo mismo para los Grupos, mas cabecera y padding
  edge    { ... }   // trazos, marcadores y etiqueta de las Aristas
}
```

Todo es opcional; con `extends` solo escribes lo que cambia.

### Paleta, fuentes y tokens

```
palette { fondo "#13001f"  texto "#fdf4ff"  rosa "#ff2bd6"  blue "#22e4ff" }
fonts   { body "Outfit"  mono "JetBrains Mono"  fallback "sans-serif" }
tokens  { background "#13001f"  foreground "#fdf4ff"  border "#ff2bd6" }
```

- El hex solo existe en `palette`. En todo el resto, un color es un **nombre de Paleta**, con modificadores: `rosa/0.4` (opacidad) o los especiales `COLOR` (el color del Tipo del Nodo, el que declaraste en `specification`) y `ORIGEN` (en Aristas, el color del Nodo de origen).
- Los nombres `blue`, `green`, `amber`, `red`, `purple` y `gray` son los colores que usan los Tipos de nodo; define los que uses.
- Las fuentes se **autohospedan**: pon los archivos en una carpeta `fuentes/` del Workspace (`woff2` o `ttf`, uno por familia y peso) y nombra la familia en `fonts`. No hay CDN. `fallback` es la familia generica de reserva. Los ejemplos traen sus fuentes y licencias en `examples/rinthel-arch/fuentes/`.

### Capas y Primitivas

Cada elemento se dibuja con una **pila de Capas**, de abajo hacia arriba. Una Capa es una instancia de una **Primitiva** del catalogo (el DSL no admite CSS suelto):

```
node {
  layer glow   glow     { color rosa/0.55  radius 18 }
  layer forma  rect     { radius 12 }
  layer relleno gradient { from rosa  to cian  angle 100 }
  layer borde  border   { color cian  width 2 }
}
```

Las Primitivas se agrupan en familias:

| Familia | Ejemplos |
| --- | --- |
| forma | `rect`, `pill`, `cut` (esquina cortada), `circle` |
| relleno | `solid`, `gradient`, `radial`, `grid`, `lines`, `dots`, `noise` |
| borde | `border`, `dashed`, `dotted`, `outline` |
| sombra y glow | `shadow`, `glow` |
| vidrio y filtro | `glass`, `sketch` (mano alzada) |
| decoracion | `tilt`, `tape`, `stripe`, `pins`, `fold`, `ring` |
| trazo (Aristas) | `line` con `corner` (`sharp`, `chamfer`, `round`) y `style` |
| marcador (Aristas) | `arrow`, `dot`, `diamond`, `square`, `bar`, `via`, `hollow`, `chevron` |
| texto y contenido | `text`, `chip`, `icon`, `label` |
| codigo | `code`: un componente React propio, para lo que el catalogo no cubre |

Los numeros tienen rangos; uno fuera de rango es un error de `validate`, nunca se recorta. Las Capas y las propiedades de cada Primitiva estan en el [catalogo](../referencia-catalogo.md). Un parche puede ademas ordenar una Capa (`before` / `after` otra), ponerla sobre el contenido (`over`), desplazarla (`offset x y`), agrandarla (`grow`) o quitarla (`layer sombra none`).

### Slots: que contenido se muestra y donde

Un Nodo tiene Slots de contenido con nombre fijo: `icon`, `title`, `badge` (el nombre del Tipo), `desc`, `footer`, `attrs` y `counter` (el numero de hijos de un Grupo colapsado). El Tema decide cuales se pintan, en que orden y con que estilo, con un mini-layout de filas y columnas:

```
slots column min-width 160 slack 28 {
  row gap 10 pad 14 min-height 50 {
    icon { variant dot  side 18 }
    column {
      title { weight 700  text-align start }
      badge { alpha 0.6  transform uppercase  size 0.66  tracking 0.18 }
    }
    counter { fill rosa  border cian }
  }
  attrs
}
```

Un Slot que no listas no se dibuja. Los Slots y la caja son lo unico que cambia el tamano del Nodo (sus **Metricas**); todo lo demas solo pinta.

### Parches por Tipo y por estado

La variacion dentro de un Tema se escribe como parches sobre las Capas, por nombre:

```
node {
  type externo { layer borde dashed { color cian } }           // solo Nodos de ese Tipo
  state hover { layer glow { color cian/0.8  radius 28 }  transition 140ms ease-out }
}
```

La cascada, donde gana el ultimo, es: Tema base, Tipo de nodo, estado, parche de la Vista. Los estados son `hover`, `seleccionado`, `fantasma`, `en-ruta`, `atenuado` y `foco`. Un estado solo puede cambiar pintura: nunca el tamano ni los Slots (`validate` lo rechaza), asi que pasar el raton no mueve el diagrama. Un Grupo tiene ademas `state collapsed`, el aspecto del Grupo cerrado.

### Partes: parches reutilizables

```
part barra { layer acento shadow after borde { color COLOR  x 4  y 0  inset 1 } }

theme mi-tema { node { type servicio { use barra }  type paquete { use barra } } }
```

Una `part` no pertenece a ningun Tema y su nombre es unico en el Workspace. Las del tutorial estan en [`examples/tutorial/paso-4/tema.dg`](../../examples/tutorial/paso-4/tema.dg).

### Aristas y fondo

```
edge {
  layer halo  line { color rosa/0.18  width 8  corner round  radius 14 }   // trazo ancho translucido: da el glow
  layer linea line { color cian  width 1.8  corner round  radius 14 }
  start hollow { size 7 }
  end arrow { size 10  color cian }
  label { scale 0.82  pad 10  radius 50  fill fondo  border rosa/0.7 }
}
page {
  layer rejilla grid { color rosa/0.10  size 44 }
  fixed          // el fondo no se mueve con el pan/zoom
}
```

El enrutado de las Aristas lo hace el layout y no depende del Tema.

## Movimiento y entrada

- **Movimientos** (catalogo cerrado): `flujo`, `pulso`, `respiracion`, `giro` y `aura`, colgados de una Capa: `layer glow { motion aura 2s ease-in-out intensity 0.6 }`. Se pueden atar a un estado.
- **Keyframes** para propiedades animables (`opacity`, `scale`, `rotate`, `shift-x`, `shift-y`, `blur`): `keyframes opacity 2s { 0 1  50 0.4  100 1 }`.
- **Transiciones y entradas**: `transition 140ms ease-out` entre estados; `enter fundido 300ms`, `exit escala 200ms` (`fundido`, `escala`, `deslizar`) y `stagger 60ms` para escalonar.

Los rangos y easings estan en el [catalogo](../referencia-catalogo.md#movimientos).

## Contraste y accesibilidad

`validate` mide el contraste de cada Tipo y estado (texto 4.5:1 y partes graficas 3:1) y avisa con `W_THEME_LOW_CONTRAST`. Si dos Tipos solo se distinguen por color, avisa con `W_THEME_COLOR_ONLY` y el visor muestra una leyenda. Algunos Temas de ejemplo (`glass-chip`, `soft-card`, `pixel-art`...) los emiten a proposito, porque su estetica lo pide: la primera linea de su archivo lo declara. El Tema incorporado `alto-contraste` reemplaza al de la Vista, solo en el visor, para quien lo necesite.

## Inspeccionar y depurar un Tema

- `dg inspect tema <nombre> --workspace <ruta>` imprime el Tema resuelto (su padre, sus Partes, las Capas y su `archivo:linea`). Con `extends`, es la forma de ver que heredas.
- `dg validate` lista errores con sugerencias: una Primitiva mal escrita propone la mas parecida.
- Para estudiar un efecto concreto, busca el Tema de ejemplo que lo usa: `synthwave` (neon y rejilla), `glass-chip` (vidrio), `sticky-notes` (mano alzada y cinta), `keycaps` (teclas 3D), `pcb` (pines y trazos ortogonales), `metro-map` (trazos con `corner chamfer`), `pixel-art` (`style pixel`).
