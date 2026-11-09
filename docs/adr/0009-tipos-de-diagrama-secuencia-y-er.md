# Tipos de diagrama secuencia y ER sobre el Modelo unico y los Temas existentes

Secuencia y ER entran como dos Tipos de diagrama nuevos sin un segundo Modelo, sin Temas aparte y sin migracion: todo cambio es aditivo. ER cabe en el Modelo de hoy (Nodos con Atributos, Aristas entre extremos) con tres marcas nuevas; secuencia necesita una entidad nueva, la Interaccion, porque ni las Aristas ni la Vista pueden guardar un escenario ordenado. Cualquier Tema existente dibuja los cuatro Tipos de diagrama: los Elementos de Tema nuevos se derivan de los que ya declara. El layout se elige por Tipo de diagrama detras de la misma entrada y de una Geometria comun. Notacion de referencia: subconjunto UML 2 comun a Mermaid, PlantUML y D2 para secuencia; solo crow's foot para ER (Chen descartado). Fuentes: los tickets cerrados del mapa "Nuevos Tipos de diagrama: secuencia y ER" (#94) y el research `research/tipos-diagrama-notacion`.

Fuera de este ADR (pendientes del mapa): codigos concretos de `validate`, export, guias, skills y Temas de ejemplo. Otros Tipos de diagrama (estados, clases, C4, Gantt, mindmap) estan fuera de alcance.

## Modelo

### ER: marcas en Atributo y Arista

- **Atributo**: `keys` opcional, conjunto cerrado `pk | fk | uk`, combinable; `optional` booleano (defecto `false`).
- **Arista**: `identifying` booleano opcional (defecto `false`).
- **Cardinalidad**: el Modelo conserva el `string` libre por extremo. Solo en una Vista ER se exigen los cuatro valores canonicos `0..1 | 1 | 0..* | 1..*`.
- **FK**: una Arista entre Atributos (`orders#customer_id -> customers#id`); entre Nodos tambien vale. ER no dibuja flechas: la direccion solo fija la lectura de la etiqueta.
- Sin Tipos de nodo reservados: un Nodo hoja en una Vista ER es una tabla, con o sin Atributos.
- `keys`, `optional` e `identifying` se escriben siempre (son Modelo); solo las Vistas ER los dibujan, las demas los ignoran sin aviso.

### Secuencia: la Interaccion

- **Interaccion**: entidad del Modelo con id en espacio de nombres propio (puede coincidir con el de un Nodo), titulo y descripcion opcionales. Se declara entera en un bloque, sin `extend`. Es una lista ordenada de items (Mensaje, Nota, Fragmento, `ref`); el orden de declaracion es el orden temporal.
- **Lifeline**: un Nodo de cualquier nivel (tambien un Grupo), no una entidad aparte. Orden de izquierda a derecha por primera aparicion, sobrescribible en la Vista. El Grupo padre cubre el `box` de UML.
- **Mensaje**: `from`, `to` (solo Nodos, nunca Atributos), `kind` en `sync | async | reply | create | destroy` (defecto `sync`), etiqueta y descripcion opcionales. Mensaje propio: `from == to`. Su identidad es la posicion (ruta de indices en la Fuente canonica); un id opcional, unico en su Interaccion, es solo un alias para citarlo. Perdido/encontrado, diferidos.
- **Activacion**: no se guarda, se deriva. Un `sync` abre activacion en el receptor y el siguiente `reply` del receptor al emisor la cierra (pila para las anidadas); un `sync` sin `reply` dura hasta el fin de su Fragmento o de la Interaccion. `reply` siempre es explicito.
- **Fragmento**: operador `alt opt loop par break critical`; `opt loop break critical` tienen un operando, `alt par` uno o mas; cada operando con guarda de texto libre opcional y su lista de items. Anidable. No es Nodo ni Grupo: las Lifelines que cubre se derivan de su contenido.
- **Nota**: item anclado `left of X`, `right of X` u `over X[, Y]`.
- **`ref <interaccion>`**: item que referencia otra Interaccion; ciclos validos (no se expande); destino inexistente es error.
- **Mensaje y Arista son independientes**: un Mensaje no exige ni crea Arista y las Vistas de arquitectura no derivan nada de las Interacciones.

Descartados: Aristas ordenadas (no cubren repeticiones, retornos ni etiquetas propias del escenario) y Mensajes declarados en la Vista (romperia "la Vista no define entidades").

## Vistas

- **Tipo**: `type sequence` y `type er`, junto a `architecture` y `flow`.
- **Vista ER**: acepta lo mismo que `architecture` (`include`, `exclude`, `depth`, `expanded`, `collapsed`, `pin`, overrides de `node`, `steps` sobre tablas y FK). Cada Nodo hoja se dibuja como tabla (cabecera mas filas del Slot `attrs`, siempre visible); los Grupos se colapsan o aplanan segun la profundidad, como en arquitectura. `link` queda como hoy.
- **Vista de secuencia**: proyecta exactamente una Interaccion (`interaction <id>`, obligatoria); no tiene `include`. `order a, b, c` sobrescribe el orden de las Lifelines y puede ser parcial (el resto sigue por primera aparicion). Valen `depth`, `collapsed`, `exclude`, `theme`, `node id { label color }`, `steps` y `autonumber`; son error `include` y `pin`; `link` solo vale con una Lifeline como origen (error sobre Mensajes, Notas y Fragmentos). `depth`/`collapsed` funden las Lifelines hijas en la de su Grupo y elevan sus Mensajes como hoy las Aristas (dentro del mismo Grupo pasan a mensaje propio); `exclude X` quita la Lifeline y sus Mensajes; un Fragmento vacio desaparece.

### Pasos y autonumeracion en secuencia

- **Paso = corte del tiempo**: cada Paso muestra la Interaccion hasta un Mensaje (incluido) y solo avanza. No cita Lifelines; `show`/`hide` son error.
- **`steps each`**: un Paso por Mensaje proyectado, titulado con su etiqueta o `from -> to`. No se combina con `step` explicitos.
- **Paso explicito**: `step "titulo" { upto <id> }`, con el id opcional del Mensaje. Solo los Mensajes son citables. Descartados: citar por numero (fragil ante inserciones y proyeccion) y marcas de Paso en la Interaccion (presentacion dentro del Modelo).
- **Revelado**: Notas y `ref` aparecen con el Mensaje que los precede (los previos al primer Mensaje, en el primer Paso). Todas las Lifelines son visibles desde el primer Paso salvo las nacidas con `create`, que aparecen con el. La activacion se recorta en el corte (no anuncia el `reply`). El marco y el operador de un Fragmento aparecen completos, en su tamano final, al entrar el corte; la guarda de cada operando, al entrar el corte en ese operando. Nada cambia de posicion. Lo que el ultimo Paso no alcanza queda oculto, sin aviso.
- **`autonumber`**: propiedad de Vista. Numera los Mensajes proyectados (tras `exclude`/`depth`) en orden de declaracion, recorriendo operandos en orden; cuenta `reply`, `create`, `destroy` y propios elevados; no numera Notas ni `ref`. Sin inicio ni incremento. No depende de los Pasos y puede diferir entre Vistas de la misma Interaccion. El numero es parte de la etiqueta del Mensaje.

## Navegacion y drill-down

- **`ref`**: click en el marco navega, como Enlace entre Vistas con migas, a la primera Vista de secuencia declarada que proyecte la Interaccion referida. Sin ninguna, el marco es inerte y `validate` avisa (informativo). Si esa Vista es la actual (ciclo), inerte y sin aviso. Sin sintaxis para elegir destino; se podra sumar despues.
- **`link`**: el destino puede ser una Vista de cualquier Tipo de diagrama, desde cualquier tipo. En secuencia, solo desde una Lifeline (click en su cabecera); un Grupo enlazado navega y no se expande.
- **Expandir/colapsar en secuencia**: mismo gesto que en arquitectura. Las hijas de la Lifeline fundida aparecen en su lugar (por primera aparicion o `order`), el resto se desplaza y el `box` del Grupo las envuelve; si el Grupo tiene Mensajes propios, conserva su Lifeline como primera dentro del `box`. Relayout con el algoritmo de secuencia, compensacion de camara (el borde izquierdo del Grupo queda fijo) y morph, como el ADR 0003. El Paso actual se mantiene (los `upto` y `autonumber` no cambian al elevar).
- **Grupo colapsado en ER**: Nodo unico con contador, no tabla. Una sola FK elevada conserva sus marcadores; varias agregadas van sin marcadores, como en arquitectura (la Arista resuelta lleva `count`, pero `render` no lo dibuja en ningun Tipo); la linea identificante solo si todas lo son.
- Navegar a otra Vista entra en su primer Paso. Una Vista `sequence` o `er` con `steps` se abre en el Paso 1 (el Paso 0 la dejaria vacia); `architecture` y `flow` siguen abriendo en el 0 (ADR 0002).
- **Ref anidado**: el marco de un `ref` cuenta para los extremos del Fragmento que lo contiene, que siempre lo envuelve.

## Seleccion, gestos y edicion

- **Seleccionables en secuencia**: Lifeline (cabecera y linea, con el id de su Nodo), Mensaje, Fragmento y Nota; `TipoDeElemento` suma `mensaje | fragmento | nota`. La activacion no se selecciona: el click cae en su Lifeline. Un `ref` se selecciona como Fragmento y ademas navega. Lo que el Paso actual no revelo no se selecciona.
- **Acierto**: Mensaje (flecha o etiqueta), Nota, Lifeline o activacion, Fragmento (solo pestana y borde; el interior deja pasar el click), fondo.
- **Id de seleccion de un Mensaje**: siempre su ruta de indices, con la Interaccion (`checkout:2.0.1`), tambien en el estado del hash; el alias no se usa. Tras una edicion externa la seleccion puede correrse a otro Mensaje: aceptado.
- **Arrastre en secuencia**: arrastrar en horizontal la cabecera de una Lifeline emite la Intencion `ordenar-lifelines` (ADR 0007), que reescribe el `order` completo de la Vista; la Lifeline arrastrada va en `fantasma`. Se escribe el orden visible y las entradas de `order` hoy ocultas (hijas de un Grupo colapsado, excluidas) conservan su posicion relativa; se escribe aunque coincida con la primera aparicion. Una hija dentro del `box` de su Grupo solo se mueve dentro del `box`; arrastrar la cabecera del `box` mueve el bloque, escrito como hijas consecutivas en `order`. Mensajes, Notas y Fragmentos no se arrastran: reordenar la Interaccion es editar el Modelo y se hace en el texto.
- **ER**: como arquitectura. Tabla = Nodo, fila = `atributo`, FK = Arista; arrastrar una tabla emite `mover-pin`; las filas no se arrastran.
- **Ruta mas corta**: en ER como en arquitectura (sobre las FK). En secuencia no hay ruta ni resaltado derivado: dos Lifelines seleccionadas son solo seleccion multiple.
- **Teclado en secuencia**: Tab recorre las Lifelines en orden de columna; izquierda/derecha saltan a la Lifeline vecina; abajo/arriba recorren los Mensajes visibles en orden temporal (el foco pasa al Mensaje); Enter sobre una Lifeline de Grupo colapsa o abre, sobre una con `link` navega. En ER, como en arquitectura.
- **Estados que emite el shell**: `lifeline` y su cabecera `hover seleccionado foco fantasma`; `activation` refleja los de su Lifeline; `message` `hover seleccionado foco`; `fragment` y `note` `hover seleccionado`; `row` `hover seleccionado`. En secuencia nadie emite `en-ruta` ni `atenuado`; el Tema puede declararlos igual.
- **Fuera de alcance**: edicion en el lugar (renombrar, crear Mensajes, cambiar `kind`), reordenar Mensajes y Atributos. La unica Intencion nueva es `ordenar-lifelines`.

## Sintaxis DSL

Las palabras nuevas entran en la regla `Id` y siguen valiendo como id de Nodo.

```
model {
  orders "Pedidos" {
    id: uuid pk
    customer_id: uuid pk fk
    email: text? uk "unico"
  }
  orders "1..*" -> "1" customers "pertenece" identifying

  interaction checkout "Compra" "Flujo de pago" {
    pedido: cliente -> api "POST /orders"
    async api -> cola "evento"
    alt "con saldo" { api -> pagos "cobrar" } else "sin saldo" { reply api -> cliente "402" }
    par { api -> a } and { api -> b }
    opt "reintento" { loop "3 veces" { api -> api "reintentar" } }
    note over cliente, api "sesion abierta"
    ref login
    reply api -> cliente "201"
  }
}

view compra {
  type sequence
  interaction checkout
  order cliente, api
  autonumber
  step "Pedido" { upto pedido }
}
```

- **Atributo**: `nombre: tipo[?] [pk] [fk] [uk] ["notas"]`; `?` pegado al tipo es `optional`; marcas en cualquier orden, repetir una es error.
- **Arista identificante**: palabra final `identifying`.
- **Interaccion**: `interaction <id> ["Titulo"] ["Descripcion"] { items }` dentro de `model`; dentro solo hay items, ninguna Arista.
- **Mensaje**: `[id:] [async|reply|create|destroy] from -> to ["etiqueta"] ["descripcion"]`.
- **Fragmento**: `opt|loop|break|critical ["guarda"] { ... }`; `alt ["guarda"] { ... } else ["guarda"] { ... }`; `par { ... } and { ... }`.
- **Nota y ref**: `note left of X "t"`, `note right of X "t"`, `note over X[, Y] "t"`; `ref <interaccion>`.

## Validacion

Severidades y codigos fijados aqui (codigos en "Codigos de issue").

- **Errores**: propiedad de Vista no valida para su tipo; Vista de secuencia sin `interaction` o con una inexistente; `ref` a una Interaccion inexistente; id de Interaccion duplicado; Lifeline o extremo de Mensaje que no es un Nodo; `create` que no es la primera aparicion del destino; aparicion despues de `destroy`; marca de clave repetida; operandos invalidos en un Fragmento (`else`/`and` cruzados o segundo operando en `opt|loop|break|critical`); id de Mensaje duplicado en su Interaccion; `upto` a un id inexistente, a un Mensaje no proyectado o que no avanza estrictamente; `steps each` junto a `step`; `show`/`hide` en secuencia.
- **Error en Vista ER**: cardinalidad fuera de `0..1 | 1 | 0..* | 1..*` en una Arista incluida.
- **Aviso**: `reply` sin `sync` abierto. `solo-color` (ADR 0008) se amplia a los tipos de Mensaje y a la Arista identificante.

### Codigos de issue

El parser acepta la forma general (operandos de Fragmento, propiedades de Vista, `show`/`hide`, `link`) y `canonico` emite el codigo especifico; nada de esto sale como `E_SYNTAX_ERROR`. `fix` solo con un candidato unico (ADR 0005); si no, `hint`.

| Regla | Codigo | Severidad | Ayuda |
| --- | --- | --- | --- |
| Propiedad de Vista no valida para su tipo (`include`/`link`/`pin` en secuencia, `interaction`/`order`/`autonumber` fuera de secuencia, `show`/`hide` en secuencia) | `E_VIEW_PROPERTY_FOR_TYPE` | error | `hint` con la alternativa (`show`/`hide` a `step { upto }`) |
| Vista de secuencia sin `interaction` | `E_SEQUENCE_WITHOUT_INTERACTION` | error | `hint` con las Interacciones existentes |
| `interaction` de Vista o `ref` a una Interaccion inexistente | `E_UNKNOWN_INTERACTION` | error | `fix` por typo |
| id de Interaccion duplicado | `E_DUPLICATE_INTERACTION` | error | `related` al original |
| Lifeline, extremo de Mensaje o entrada de `order` que no es un Nodo | `E_UNKNOWN_LIFELINE` | error | `fix` por typo |
| `create` que no es la primera aparicion del destino | `E_CREATE_NOT_FIRST` | error | `related` a la primera aparicion |
| Aparicion despues de `destroy` | `E_AFTER_DESTROY` | error | `related` al `destroy` |
| Marca de clave repetida | `E_DUPLICATE_KEY_MARK` | error | `fix`: borrar la repetida |
| Operandos invalidos en un Fragmento | `E_INVALID_FRAGMENT_OPERAND` | error | `hint` (`else` es de `alt`, `and` de `par`) |
| id de Mensaje duplicado en su Interaccion | `E_DUPLICATE_MESSAGE_ID` | error | `related` |
| `upto` a un id inexistente | `E_UNKNOWN_STEP` (reusado) | error | `fix` por typo |
| `upto` a un Mensaje no proyectado (`depth`/`exclude`) | `E_STEP_NOT_PROJECTED` | error | `hint` |
| `upto` que no avanza estrictamente | `E_STEP_NOT_ADVANCING` | error | `related` al Paso anterior |
| `steps each` junto a `step` | `E_STEPS_EACH_WITH_STEP` | error | - |
| `link` en secuencia con origen que no es una Lifeline | `E_LINK_NOT_LIFELINE` | error | - |
| Cardinalidad fuera de `0..1 \| 1 \| 0..* \| 1..*` en una Arista de Vista ER | `E_ER_CARDINALITY` | error | `fix` con candidato cercano unico, si no `hint` con las cuatro |
| `reply` sin `sync` abierto | `W_REPLY_WITHOUT_SYNC` | warning | - |
| `ref` a una Interaccion que ninguna Vista de secuencia proyecta | `W_REF_WITHOUT_VIEW` | warning | `hint`: agregar una Vista |
| Nodo de `order` que no participa en la Interaccion proyectada (se ignora en el layout) | `W_ORDER_NOT_IN_INTERACTION` | warning | - |
| `solo-color` en tipos de Mensaje o Arista identificante | `W_THEME_COLOR_ONLY` (reusado, descripcion ampliada) | warning | - |

Sin severidad `info`: el `ref` sin Vista es warning y `--strict` lo hace fallar a proposito. Sin avisos de coherencia entre Mensajes y Aristas: un Mensaje entre dos Nodos sin Arista es valido (los Mensajes son independientes de las Aristas), y tampoco se avisa de una Interaccion sin Vista.

## Tema

Todo reutiliza Capas, Primitivas, Slots y Paleta (ADR 0008); no hay Familia nueva.

- **Elementos de Tema nuevos**: bloques al nivel de `node` y `edge`: `lifeline`, `activation`, `message`, `fragment`, `note` y `row`. La cabecera de la Lifeline y la tabla ER se dibujan con `node`. Admiten `extends`, `part`, `use` y los mismos estados que Nodo y Arista (un estado solo pinta); `inspect tema` muestra sus pilas.
- **Cascada por Tipo de diagrama**: `diagram <tipo> { ... }` dentro de `node`, `edge` y `group`, para los cuatro tipos. Orden: Tema base, Tipo de diagrama, Tipo de nodo, estado, Vista. A diferencia de un estado, puede cambiar las Metricas.
- **`message`**: el modelo de `edge` (pila de trazos, `start`/`end`, `label`) con parches `kind <tipo>`. Defectos: `sync` continuo con `arrow`; `async` continuo con `chevron`; `reply` discontinuo con `chevron`; `create` discontinuo con `chevron`, terminando en la cabecera; `destroy` continuo con `arrow`.
- **`lifeline`**: pila de trazos mas `end`, el marcador al final de una Lifeline destruida (defecto `cross`). La cabecera no se repite al pie.
- **`activation`**: Capas de Nodo con ancho propio `width` (10 en `neutral`) y el `COLOR` del Nodo de su Lifeline.
- **`fragment`**: Capas de Nodo para el marco; `operator` (pestana, estilo `label`), `guard` (estilo `text`), `divider` (trazo entre operandos) y parches `op <operador>`. `ref` es un fragmento `op ref` con el titulo de la Interaccion referida.
- **`note`**: Capas de Nodo mas el estilo `text`.
- **`row`**: Capas por fila (fondos alternos, separador `stripe side bottom`), textos `name`, `type` y `key` (estilo `chip`) y parches `key pk|fk|uk` y `optional`, que entran en la categoria de presencia de contenido del ADR 0008.
- **`zone all|header|body`**: propiedad comun nueva de las Capas de Nodo, solo pinta (defecto `all`). `header` es la zona de los Slots anteriores a `attrs`; sin `attrs` equivale a `all`.
- **Marcadores nuevos** en la Familia marcador: `one`, `zero-one`, `many`, `zero-many` (compuestos, porque un extremo admite un solo marcador) y `cross`. En una Vista ER el nucleo traduce la cardinalidad a su marcador (`1` a `one`, `0..1` a `zero-one`, `1..*` a `many`, `0..*` a `zero-many`); el Tema solo cambia `color`/`size` con `edge { diagram er { ... } }`, no la traduccion. Arista identificante continua, no identificante discontinua, parcheable.

### Derivacion cuando el Tema no declara un Elemento

El nucleo deriva una version sobria, de modo que los Temas existentes dibujan secuencia y ER sin tocarlos (verificado con 17 Temas en el prototipo de la rama `prototype/tipos-diagrama`):

- `message` y `lifeline` salen de `edge` (la Lifeline con trazo discontinuo).
- `activation` y `fragment` salen solo de las Capas de forma, relleno y borde de `node`, sin decoraciones, sombras, efectos ni giro.
- `note` se deriva como "papel": esquina doblada (`fold`), relleno con tinte suave del color de nota de la Paleta (`amber`, si no el borde), trazo fino y texto normal (sin `title`, icono ni insignia) envuelto a un ancho maximo. No hereda la pila completa de Nodo porque se confundia con un participante.
- **Distincion `reply`/`sync` garantizada**: si el trazo base de la Arista es continuo, `reply` y `create` van discontinuos; si no lo es, van continuos.
- **Texto sobre la pagina** (guardas de Fragmento) toma el color del trazo de la Arista, no el `foreground`. Las guardas van por encima de las activaciones.
- **Tabla ER**: una forma `pill` o `circle` del Nodo se dibuja como `rect` con radio acotado; el Tema puede cambiarlo con `node { diagram er { ... } }`.

Temas incorporados: `neutral` declara de forma explicita todos los Elementos y parches `diagram` (modelo de referencia); `neutral-dark` los hereda y solo cambia la Paleta; `alto-contraste` los declara con trazos mas gruesos. Los tres, sin warnings. Los Temas de ejemplo se apoyan en la derivacion.

### Metricas nuevas

Cabecera de Lifeline (entrada de Nodo con su parche `diagram sequence`), `activation.width`, pestana y guarda de Fragmento, caja de Nota, etiqueta de Mensaje (con la regla de la etiqueta de Arista), alto de `row`, y las separaciones de secuencia: gap entre Lifelines, gap entre Mensajes, padding de Fragmento, ancho del lazo propio y desplazamiento de `create`. Todas tienen defectos del nucleo y se ajustan con `diagram sequence` o en los bloques nuevos. La pestana y las guardas de Fragmento, las etiquetas de Mensaje y el texto de las Notas entran en `textosAMedir` (con la estimacion la pestana salia recortada).

## Layout y Geometria

- **Una sola entrada**: `layoutView` / `layoutConMetricas` eligen el algoritmo por `vista.type`; `sesion`, `cli`, `shell` y el Worker no cambian. Secuencia corre por el mismo adaptador (Worker en el shell, Node en el CLI).
- **Geometria**: union discriminada por `kind`, `grafo` (arquitectura, flujo, ER) o `secuencia`. Ambas comparten `nodes` (en secuencia, las cabeceras de Lifeline), `width` y `height`, asi `indiceDeGeometria`, camara y morph siguen operando. `secuencia` agrega Lifelines (x, y inicial, y final, destruida), activaciones, Mensajes (por ruta de indices, con puntos y caja de etiqueta), Fragmentos (marco, pestana, guardas, divisores) y Notas. `render` hace switch por `kind` y no mide.
- **ER**: el camino ELK de arquitectura (`layered`, `RIGHT`, ortogonal) con el ajuste post-ELK del puerto a la fila del Atributo, mas una garantia nueva: el tramo final de cada Arista a una tabla es horizontal y mide al menos el marcador de pie de gallo (sin ella el pie se monta sobre el codo). Puertos ELK por fila (`FIXED_POS` E/W) descartados; se reabren solo ante cruces o solapes inaceptables.
- **Secuencia**: algoritmo propio sin ELK, determinista y sincrono (firma `async` por uniformidad).
  - Columnas: una por Lifeline en el orden de `order` y luego primera aparicion; distancia entre vecinas = max(gap del Tema, etiqueta mas ancha de un Mensaje entre ellas, lazo propio, Nota).
  - Filas: de arriba abajo; cada Mensaje ocupa alto de etiqueta mas gap; el mensaje propio, el alto de su lazo; un Fragmento suma pestana, guarda y padding arriba, padding abajo y un divisor por operando. `par` apila sus operandos en vertical con divisor, como `alt`.
  - Cabeceras en la misma `y` con el alto de la mayor; `create` baja la del destino a la altura de su Mensaje. Las lineas llegan al fondo (ultimo item mas padding) salvo las destruidas, cortadas en su marcador.
  - Activaciones derivadas de la pila `sync`/`reply`; cada nivel anidado se desplaza `activation.width/2`; las flechas terminan en el borde de la activacion.
  - Marco de Fragmento: las Lifelines que cubre su contenido mas padding; el de `ref`, los participantes de la Interaccion referida presentes en la Vista, o todas si no hay ninguno en comun.
  - Etiqueta de Mensaje centrada encima de la flecha; en el mensaje propio, a la derecha del lazo.
- **Clave y cache**: `claveDeLayout` y `claveDeEstructura` incluyen `vista.type`; en secuencia, ademas, los items de la Interaccion proyectada (extremos, tipo y etiquetas tras `depth`/`exclude`), `order` y `autonumber` (cambia las etiquetas); sin Pins. Las Metricas nuevas entran por la via existente. `geometriaCacheadaSchema` valida la union; un JSON anterior sin `kind` se lee como `grafo`.
- **Rendimiento**: escenario nuevo `secuencia-grande` en `pnpm bench`: 1000 Mensajes, 50 Lifelines, Fragmentos anidados 3 niveles, presupuesto 500 ms.

## Consecuencias

- Los ADR 0001 (DSL), 0003 (layout) y 0008 (Temas) siguen vigentes; este ADR los amplia por Tipo de diagrama sin cambiar lo que ya rige para arquitectura y flujo.
- `pixel-art` se ve mal en secuencia y ER aun con la derivacion; queda en el pendiente de Temas de ejemplo.
- Seleccion, gestos y edicion quedan fijados en "Seleccion, gestos y edicion"; la navegacion, en "Navegacion y drill-down".
