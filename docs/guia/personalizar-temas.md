# Personalizar con Temas

La estetica de un diagrama vive en el **Tema**, nunca en el Modelo: el mismo Modelo y la misma Vista se pueden ver como tarjetas sobrias, neon o placa de circuito cambiando una linea (`theme <nombre>`). Esta guia explica como esta hecho un Tema y como escribir uno. Si no lo has hecho, empieza por el [tutorial](tutorial.md). La lista exacta de Primitivas, propiedades y rangos esta en el [catalogo](../referencia-catalogo.md); el contrato, en el [ADR 0008](../adr/0008-sistema-de-temas-expresivo.md).

## Elegir un Tema

- Los incorporados: `neutral` (defecto), `neutral-dark` y `alto-contraste`.
- Los de ejemplo, un `.dg` por Tema en [`examples/rinthel-arch/temas/`](../../examples/rinthel-arch/temas/): el listado, con una imagen cada uno, esta en la [galeria](../galeria.md). Copia el `.dg` de uno a tu Workspace (y sus fuentes, ver abajo) y usalo en una Vista.
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
- Las fuentes se **autohospedan**: pon los archivos en una carpeta `fuentes/` del Workspace (`woff2` o `ttf`, uno por familia y peso) y nombra la familia en `fonts`. No hay CDN. `fallback` es la familia generica de reserva. Los ejemplos traen sus fuentes y licencias en `examples/rinthel-arch/temas/fuentes/`.

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
| marcador (Aristas) | `arrow`, `dot`, `diamond`, `square`, `bar`, `via`, `hollow`, `chevron`, `cross` (una X centrada en el extremo), y los pies de gallo ER `one`, `zero-one`, `many`, `zero-many` |
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

La cascada, donde gana el ultimo, es: Tema base, Tipo de diagrama, Tipo de nodo, estado, parche de la Vista.

`diagram <tipo> { ... }` (dentro de `node`, `group` y `edge`) distingue un Tipo de diagrama (`architecture`, `flow`, `sequence`, `er`): `node { diagram flow { slots row pad 20 { title attrs } } }` solo cambia las Vistas de flujo. Admite `layer`, `use` y `slots`; `padding` en `group`; marcadores (`start`/`end`) y `label` en `edge`. A diferencia de un estado, puede cambiar las Metricas. Un tipo desconocido es `E_THEME_UNKNOWN_DIAGRAM_TYPE`. `inspect tema <nombre> --diagrama flow` muestra la pila resultante. Los estados son `hover`, `seleccionado`, `fantasma`, `en-ruta`, `atenuado` y `foco`. Un estado solo puede cambiar pintura: nunca el tamano ni los Slots (`validate` lo rechaza), asi que pasar el raton no mueve el diagrama. Un Grupo tiene ademas `state collapsed`, el aspecto del Grupo cerrado.

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

### Tablas ER: `row`, `zone` y marcadores

Una Vista `er` dibuja cada Nodo como tabla (cabecera y una fila por Atributo). El Tema la estiliza con el bloque `row`, la propiedad `zone` de las Capas de Nodo y los marcadores de Arista (ejemplo completo en [`examples/temas/er.dg`](../../examples/temas/er.dg)):

```dg
specification { node tabla { icon database  color green } }

model {
  tabla clientes "Clientes" { id: uuid pk  email: text? uk }
  tabla pedidos "Pedidos" { id: uuid pk  cliente_id: uuid fk  nota: text? }
  pedidos#cliente_id "0..*" -> "1" clientes#id "pertenece a" identifying
}

theme libreta {
  palette { papel "#fffdf5"  tinta "#1f2937"  azul "#2457d6"  gris "#ece8dc"  verde "#d9f2dc"  ambar "#fdecc8" }
  node {
    layer forma rect { radius 6 }
    layer relleno solid { color papel }
    layer cabecera solid { color azul  zone header }   // solo la cabecera (all, header o body)
    layer borde border { color tinta }
    slots column { title { color papel  weight 700 }  attrs }
  }
  row {
    height 26                                           // alto de cada fila: cambia el tamano de las tablas
    layer fondo solid { color papel }
    layer separador stripe { color gris  side bottom  width 1 }
    alternate { layer fondo { color gris } }            // filas impares
    key pk { layer fondo { color verde } }              // filas con esa marca (pk, fk, uk); se apilan en ese orden
    optional { layer fondo { color ambar } }            // Atributos opcionales (despues de las claves)
    name { weight 600 }  type { color azul }            // estilo de texto
    key { fill azul  color papel  radius 4 }            // el chip de cada marca de clave
  }
  edge {
    layer linea line { color tinta }
    diagram er { end arrow { size 12  color azul } }   // solo color y size del pie de gallo
  }
}

view tablas { type er  theme libreta  include ** }
```

- `zone header` pinta de arriba hasta donde empiezan las filas (`attrs`); sin `attrs` equivale a `all`. `zone body` cubre las filas. Una Capa con `zone` pinta aparte de la caja, asi que un parche de estado no la cambia.
- `row` solo vale en Vistas `er`; en las demas los Atributos siguen con el estilo del Slot `attrs`. El alto (`height`, 12 a 120) es una Metrica; las Capas y parches solo pintan (uno que cambie la caja es `E_THEME_STATE_TOUCHES_METRICS`).
- El marcador de cada extremo lo fija el nucleo segun la cardinalidad (`1` a `one`, `0..1` a `zero-one`, `1..*` a `many`, `0..*` a `zero-many`); el Tema solo cambia su `color` y `size`.
- Las Aristas identificantes (`identifying`) van continuas y las demas discontinuas; `edge { identifying { layer linea { color azul } } }` cambia ademas el trazo de las identificantes. Si ambas quedan iguales salvo el color, `validate` avisa con `W_THEME_COLOR_ONLY`.

### Secuencia: `lifeline`, `activation`, `message`, `fragment` y `note`

Una Vista `sequence` se dibuja sola con cualquier Tema (los elementos se derivan de `edge` y `node`); para estilizarla se declaran bloques al nivel de `node` y `edge` (ejemplo completo en [`examples/temas/secuencia.dg`](../../examples/temas/secuencia.dg)). Todos admiten `layer`, `use`, `state` y, donde aplica, parches por variante, y las separaciones de secuencia son sus Metricas:

```dg
specification { node pieza { icon box  color blue } }

model {
  pieza cliente
  pieza api
  pieza db
  interaction pedido {
    cliente -> api "pedir"
    api -> db "guardar"
    reply db -> api "ok"
    alt "hay stock" { api -> db "reservar" }
    note right of db "idempotente"
    reply api -> cliente "201"
  }
}

theme tinta {
  palette { papel "#fefce8"  tinta "#1f2937"  azul "#2563eb"  verde "#16a34a"  rojo "#dc2626"  ambar "#d97706" }
  node {
    layer forma rect { radius 6 }
    layer relleno solid { color papel }
    layer borde border { color tinta }
    slots { title }
  }
  edge { layer linea line { color tinta  width 1.2 } }
  lifeline {
    layer linea line { color tinta/0.5  width 1  style dashed }
    end cross { size 12  color rojo }
    gap 200                                          // distancia minima entre Lifelines
  }
  activation {
    layer relleno solid { color azul/0.2 }
    layer borde border { color azul }
    width 12
  }
  message {
    layer linea line { color tinta  width 1.5 }
    end arrow { size 10 }
    gap 40  loop-width 48  create-offset 0           // entre Mensajes, ancho del lazo propio, desplazamiento de la cabecera creada
    kind async { layer linea { color verde }  end chevron { size 10  color verde } }   // parche por tipo: sync, async, reply, create, destroy
  }
  fragment {
    layer forma rect { radius 8 }
    layer relleno solid { color papel/0.6 }
    layer borde border { color tinta/0.6 }
    operator { color tinta  weight 700 }  guard { color tinta }  divider { color tinta/0.5  style dashed }
    op alt { layer borde { color azul } }            // parche por operador: opt loop break critical alt par ref
    padding 20  padding-y 10                         // alrededor del contenido
  }
  note {
    layer relleno solid { color ambar/0.25 }
    layer borde border { color ambar }
    text { color tinta  weight 600 }
  }
}

view pedido { type sequence  theme tinta  interaction pedido }
```

- Que cambia con cada tipo: `message { kind async { ... } }` solo toca los Mensajes `async`. Sin parche, `reply` y `create` van con la continuidad opuesta a la del trazo base y el marcador depende del tipo.
- `lifeline` y `message` usan trazos de Arista; `activation`, `fragment` y `note` usan Capas de Nodo. `COLOR` es el de la Lifeline. `gap`, `loop-width`, `create-offset`, `width` y `padding` son Metricas (cambian la Geometria); lo demas solo pinta. Los rangos y defectos estan en el [catalogo](../referencia-catalogo.md#elementos-de-secuencia); uno fuera de rango es un error de `validate`.
- Si dos tipos de Mensaje (los que usa la Vista) quedan iguales salvo el color, `validate` avisa con `W_THEME_COLOR_ONLY`.
- Los Temas incorporados declaran todos estos elementos y la fila `row`: `neutral` es el modelo de referencia, `neutral-dark` lo hereda y solo cambia la Paleta, `alto-contraste` usa trazos mas gruesos. `inspect tema <nombre>` muestra la pila, los parches y las Metricas de cada uno.

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
