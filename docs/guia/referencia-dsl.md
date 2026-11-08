# Referencia del DSL

Resumen de la sintaxis de los archivos `.dg`. La gramatica completa esta en `packages/dsl/src/gramatica/diagramas.langium`; las decisiones, en el [ADR 0001](../adr/0001-dsl-fuente-editable.md). Los Temas se describen en [Personalizar con Temas](personalizar-temas.md). Los comentarios empiezan con `//`.

Un Workspace es una carpeta con cualquier cantidad de `.dg` (en subcarpetas tambien); se fusionan en un unico Modelo. Un archivo puede mezclar bloques `specification`, `model`, `view`, `theme` y `part`.

## `specification`: Tipos de nodo

```
specification {
  node servicio { description "Pieza de logica"  icon server  color blue }
  node nota     { description "Elemento de prueba"  color gray }
}
```

`description`, `icon` y `color` son opcionales. `color` es un nombre de Paleta del Tema. Iconos usados en los ejemplos: `user`, `box`, `server`, `database`, `queue`, `cloud`. Usar un Tipo no declarado es un error.

## `model`: Nodos y Aristas

```
model {
  tipo id "Titulo" "Descripcion" {
    tipo hijo "Titulo"                     // un Grupo es un Nodo con hijos
    attrs { id: uuid   total: decimal "en centavos" }
    email: text? uk "unico"                // un Atributo tambien puede ir suelto en el cuerpo (ver "Vistas `er`")
    source { file "packages/x/src/a.ts"  url "https://..." }
  }

  origen -> destino "etiqueta"
  origen "1" -> "N" destino                // cardinalidades opcionales
  pedidos#cliente_id -> clientes#id        // un Atributo como extremo (`nodo#atributo`)
}
```

- Titulo y descripcion son opcionales; sin titulo, se usa el id.
- Los hijos se referencian con el id cualificado por su jerarquia: `plataforma.pedidos`.
- Los espacios alrededor de `->` son obligatorios (`-` es valido dentro de un id).
- `source` guarda referencias opacas (`kind "ref"`) al proyecto documentado; el sistema no las interpreta.
- `extend <nodo> { ... }`, dentro de un bloque `model`, agrega hijos, Atributos o `source` a un Nodo declarado en otro archivo o bloque.
- Las Aristas se declaran solo en `model`, nunca en una Vista.
- Un escenario ordenado entre Nodos es una Interaccion (ver abajo).

### Interacciones

```
model {
  interaction checkout "Compra" "Flujo de pago" {
    pedido: cliente -> api "POST /orders"   // `pedido:` es un alias opcional del Mensaje
    api -> db "consulta"
    reply db -> api "filas"
    async api -> cola "evento"
    api -> api "validar"                     // Mensaje propio
    reply api -> cliente "201"
  }
}
```

Ciclo de vida de una Lifeline: `create origen -> destino` la hace nacer (su cabecera baja a la altura del Mensaje y la flecha termina en ella) y `destroy origen -> destino` la termina (su linea se corta en una X, el marcador `cross`).

```
  interaction sesion {
    cliente -> api "login"
    create api -> token "emitir"
    destroy api -> token "revocar"
  }
```

- Un Mensaje es `[id:] [async|reply|create|destroy] origen -> destino ["etiqueta"] ["descripcion"]`; sin tipo es `sync`. Los extremos son Nodos de cualquier nivel (las Lifelines) y no hace falta una Arista entre ellos.
- El orden de declaracion es el orden temporal. La activacion no se escribe: un `sync` abre una en el receptor y el siguiente `reply` del receptor al emisor la cierra.
- `create` solo vale en la primera aparicion del destino (`E_CREATE_NOT_FIRST`) y ninguna Lifeline puede aparecer despues de su `destroy` (`E_AFTER_DESTROY`) en orden de declaracion, tambien dentro de Fragmentos; ambos errores traen `related`.
- Fragmento: `opt|loop|break|critical ["guarda"] { }` (un operando), `alt ["guarda"] { } else ["guarda"] { }` y `par { } and { }` (uno o mas). La guarda es texto libre y opcional. `else` solo vale en `alt` y `and` en `par`; otra combinacion da `E_INVALID_FRAGMENT_OPERAND`. Un `sync` sin `reply` dentro de un Fragmento deja su activacion abierta hasta el fin del Fragmento. `opt`, `loop`, `break`, `critical`, `alt`, `par`, `else` y `and` siguen valiendo como ids de Nodo.
- El id de una Interaccion tiene su propio espacio de nombres (puede coincidir con el de un Nodo); `interaction`, `async`, `reply`, `create`, `destroy` y `order` siguen valiendo como ids de Nodo.

Fragmentos (anidables) agrupan Mensajes con un operador:

```
interaction checkout {
  cliente -> api "pedir"
  alt "hay stock" {
    api -> db "reservar"
  } else "sin stock" {
    api -> cliente "rechazar"
  }
  par { api -> cola "evento" } and { api -> db "auditar" }
}
```

## `view`: que mostrar

```
view paquetes {
  type architecture             // o flow, sequence, er
  theme diagrams                // opcional; defecto: neutral
  include a, b.*, c.**          // selectores
  exclude a.privado
  depth 1
  expanded render, sesion       // Grupos abiertos al inicio
  collapsed canonico, tema      // Grupos cerrados al inicio
  link canonico -> canonico-detalle // drill-down a otra Vista (un Grupo con link no se expande)
  node render { label "Render"  pin 120,40  color amber }
}
```

| Propiedad | Efecto |
| --- | --- |
| `type` | `architecture`, `flow`, `sequence` o `er` |
| `include`, `exclude` | Selectores: `a` (el Nodo), `a.*` (sus hijos directos), `a.**` (todos sus descendientes). `**` solo, todo el Modelo |
| `depth N` | Profundidad inicial; los Grupos que la exceden aparecen colapsados |
| `expanded`, `collapsed` | Estado inicial de los Grupos nombrados |
| `link nodo -> vista` | Un Grupo enlazado no se expande en esta Vista: navega a la otra. Los ciclos son validos; el visor muestra las migas |
| `theme nombre { parche }` | Tema de la Vista, con un parche opcional solo para ella |
| `interaction id` | Solo en `sequence` (obligatoria): la Interaccion que proyecta |
| `order a, b` | Solo en `sequence`: orden de las Lifelines de izquierda a derecha; parcial, el resto sigue por primera aparicion |
| `node id { ... }` | Overrides de presentacion de un Nodo en esta Vista: `label`, `pin x,y`, `color` |

Una Vista nunca define entidades nuevas ni toca el Modelo.

### Vista de secuencia

```
view compra {
  type sequence
  interaction checkout
  order cliente, api
}
```

Dibuja una columna por Lifeline y los Mensajes de arriba abajo, con las activaciones derivadas (las anidadas van desplazadas). Cualquier Tema la dibuja: `message` y `lifeline` se derivan de la Arista y `activation` del Nodo; `reply` lleva la continuidad opuesta a la del trazo base. `include` y `pin` son error en una Vista de secuencia (`E_VIEW_PROPERTY_FOR_TYPE`), igual que `interaction` y `order` fuera de ella.

### Pin

`pin x,y` fija la posicion de un Nodo (relativa a su Grupo padre, o al lienzo si es raiz) y anula el auto-layout para ese Nodo. No se escribe a mano: arrastra el Nodo en el visor y el Pin se escribe en el `.dg` (o usa `dg edit --view <id> --node <id> --x N --y N`).

## Vistas `er`: tablas y claves foraneas

Una Vista `type er` dibuja cada Nodo hoja como una tabla (cabecera mas una fila por Atributo) y las Aristas como FK con marcadores de pie de gallo, sin flechas. Acepta lo mismo que `architecture` (`include`, `exclude`, `depth`, `expanded`, `collapsed`, `pin`, `node`, `steps`). Funciona con cualquier Tema; un Nodo `pill` o `circle` se dibuja como `rect`.

```
model {
  tabla orders "Pedidos" {
    id: uuid pk
    customer_id: uuid pk fk
    email: text? uk "unico"
  }
  tabla customers "Clientes" { id: uuid pk }
  orders#customer_id "1..*" -> "1" customers#id "pertenece" identifying
}
view tablas { type er  include ** }
```

- Atributo: `nombre: tipo[?] [pk] [fk] [uk] ["notas"]`. El `?` pegado al tipo lo hace opcional; las marcas van en cualquier orden y repetir una es `E_DUPLICATE_KEY_MARK` (su `fix` borra la repetida). Cada marca se dibuja como un chip en la fila.
- Arista identificante: palabra final `identifying` (linea continua; las demas van discontinuas). Un Nodo llamado `identifying` no puede abrir la declaracion que sigue justo a una Arista (se leeria como su marca); `pk`, `fk`, `uk` y `er` valen como ids en cualquier sitio.
- Cardinalidad: en una Vista ER solo valen `0..1`, `1`, `0..*` y `1..*` (`E_ER_CARDINALITY`, con `fix` si hay un candidato cercano unico). Cada una se dibuja como su marcador (`zero-one`, `one`, `zero-many`, `many`); un Grupo colapsado con varias FK agregadas va sin marcadores.
- Fuera de una Vista ER las marcas y `identifying` se ignoran sin aviso.

## Vistas `flow` y Pasos

Una Vista puede revelar su contenido por **Pasos**. Cada Paso es acumulativo: `show` revela, `hide` oculta. Solo cambia la visibilidad, nunca la posicion, asi que el diagrama no se mueve entre Pasos.

```
view flujo-edicion {
  type flow
  include autor, shell.sh-seleccion, sesion.ses-intenciones, workspace
  steps {
    step "El autor arrastra un Pin en el shell" {
      show autor, shell.sh-seleccion
    }
    step "El gesto se traduce en una Intencion" {
      show sesion.ses-intenciones
    }
    step "Se reescribe el archivo .dg" {
      show workspace
      hide shell.sh-seleccion
    }
  }
}
```

Un item es un selector de Nodos o una Arista (`a -> b`, o `edge a -> b`). En un Paso, `a.*` y `a.**` incluyen tambien al Grupo `a`. Un ejemplo completo esta en [`examples/rinthel-arch/vistas.dg`](../../examples/rinthel-arch/vistas.dg).

## `theme` y `part`

```
theme mio extends neutral { palette { ... }  node { ... }  group { ... }  edge { ... } }
part barra { layer acento shadow { color COLOR  x 4 } }
```

Detalle en [Personalizar con Temas](personalizar-temas.md) y en el [catalogo](../referencia-catalogo.md).

## Errores y avisos

`dg validate` imprime `archivo:linea:columna severidad codigo mensaje`, con `hint` o una correccion (`fix`) cuando hay un unico candidato. Con `--json` el resultado es un objeto con `contractVersion`, para agentes y herramientas ([ADR 0005](../adr/0005-cli-para-agentes.md)). Los codigos son estables (`E_DUPLICATE_PART`, `W_THEME_LOW_CONTRAST`, `E_UNKNOWN_LIFELINE`, `W_REPLY_WITHOUT_SYNC`...); los que empiezan con `E_` bloquean y los `W_` avisan.
