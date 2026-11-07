# Notaciones de referencia para secuencia y ER (issue #95, mapa #94)

Consultado el 2026-11-06 en fuentes primarias: spec UML 2.5.1 (OMG, `formal/2017-12-05`, PDF descargado y leido en local), docs oficiales de Mermaid, PlantUML y D2, y el codigo de D2. Lo no confirmado en fuente primaria va marcado **NO VERIFICADO**. Parte de `research/dsl-landscape` (Mermaid, PlantUML y D2 son solo export; no se adoptan como DSL) y de `CONTEXT.md`: Arista con cardinalidad y etiqueta, Atributo como extremo direccionable, Paso acumulativo.

## Conclusion corta

- Secuencia: adoptar el subconjunto UML 2 que los tres motores comparten: Lifeline, mensajes (sincrono, asincrono, respuesta, creacion, destruccion, propio), barra de activacion, Fragmentos combinados `alt opt loop par break critical`, Notas y autonumeracion. Dejar fuera `neg assert ignore consider strict seq`, estado invariante, restricciones de tiempo y Gates.
- ER: adoptar crow's foot (IE) como unica notacion visual, con las cuatro cardinalidades (`||`, `|o`, `}|`, `}o`), linea solida/discontinua (identificante o no), claves PK/FK/UK y Atributos con tipo y opcionalidad. Chen queda fuera: no lo soporta ninguno de los tres motores y su fuente primaria no se pudo leer.
- El Modelo actual ya cubre casi todo ER (Atributo direccionable, cardinalidad en Arista). Secuencia necesita ordenamiento de mensajes y fragmentos, que hoy el Modelo no expresa (ver "Huecos").

## 1. Secuencia

### 1.1 UML 2.5.1, capitulo 17 (Interactions)

Fuente: https://www.omg.org/spec/UML/2.5.1/PDF (Tabla 17.1, 17.2, 17.12.15, 17.12.22).

Nodos graficos (Tabla 17.1): Frame de la Interaction, Lifeline, ExecutionSpecification, InteractionUse, CombinedFragment, StateInvariant, Continuation, Coregion, DestructionOccurrenceSpecification, DurationConstraint/Observation, TimeConstraint/Observation.

Caminos (Tabla 17.2): Message, LostMessage, FoundMessage, GeneralOrdering.

`MessageSort` (17.12.22) tiene seis literales: `synchCall`, `asynchCall`, `asynchSignal`, `createMessage`, `deleteMessage`, `reply`.

`InteractionOperatorKind` (17.12.15) tiene doce: `seq`, `alt`, `opt`, `break`, `par`, `strict`, `loop`, `critical`, `neg`, `assert`, `ignore`, `consider`. Semantica relevante: `alt` elige como maximo un operando por su guarda; `opt` es un operando o nada; `break` ejecuta el operando en lugar del resto del fragmento envolvente; `par` permite cualquier intercalado que preserve el orden de cada operando; `loop` repite; `critical` es atomico.

### 1.2 Como lo resuelven los tres

| Elemento | Mermaid | PlantUML | D2 |
|---|---|---|---|
| Participante | `participant`, `actor`, tipos `boundary control entity database collections queue` via `@{"type":..}` | `participant actor boundary control entity database collections queue`, `order N` | objetos con `shape: sequence_diagram`; actores implicitos al primer uso |
| Alias | `participant A as Alice` | `<tipo> label as alias` | clave y `label` normales de D2 |
| Mensaje | `->` `-->` (sin punta), `->>` `-->>` (punta), `-x` (cruz), `-)` (abierta/asincrona); puntiagudas en media punta desde v11.12.3 | `->` `-->` `->>` `->x` (perdido) `->o` `<->`, `[->` `->]` (extremo del diagrama) | conexion entre actores, en orden de definicion |
| Respuesta | linea punteada `-->>` | `-->` y `return <etiqueta>` | conexion normal |
| Mensaje propio | `A->>A` | `A -> A` | conexion de un actor a si mismo |
| Activacion | `activate/deactivate`, atajo `+`/`-`, apiladas | `activate/deactivate`, `++`/`--`, `autoactivate on` | "span": objeto anidado en un actor conectado |
| Creacion/destruccion | `create participant X`, `destroy X` (v10.3.0+) | `create`, `destroy`, atajos `**` `!!` | no documentado en la pagina leida |
| Fragmentos | `loop alt/else opt par/and critical/option break rect`, cierran con `end` | `alt/else opt loop par break critical group`, cierran con `end`, anidables | "group": contenedor sin conexion propia que agrupa conexiones; dentro solo se citan actores de nivel superior |
| Notas | `Note left of/right of/over X[,Y]` | `note left/right [of]/over`, `hnote`, `rnote`, `note across` | objeto anidado en un actor sin conexiones salientes |
| Numeracion | `autonumber [inicio incremento]` | `autonumber [inicio incremento]`, `stop`, `resume`, formato | no documentado en la pagina leida |
| Agrupar participantes | `box [color] [etiqueta]` | `box` (**NO VERIFICADO** en la pagina leida) | contenedores D2 |
| Referencia a otra interaccion | no | `ref over X,Y : texto` ... `end ref` | no |
| Separadores / retardos | no | `== texto ==`, `...` | no |

Fuentes: https://mermaid.js.org/syntax/sequenceDiagram.html (fuente en `packages/mermaid/src/docs/syntax/sequenceDiagram.md`), https://plantuml.com/sequence-diagram, https://d2lang.com/tour/sequence-diagrams. Nota: Mermaid avisa que la palabra `end` en un texto rompe el parser; evitarlo o escaparlo en el DSL propio.

### 1.3 Elementos minimos y recomendacion

Interseccion de los tres motores y del nucleo de UML:

| Elemento | Decision | Motivo |
|---|---|---|
| Lifeline (participante con cabecera y linea de vida) con Tipo de nodo (actor, base de datos, cola...) | Adoptar | Comun a los tres; mapea a Nodo con Tipo de nodo, sin entidades nuevas |
| Mensaje sincrono, asincrono, respuesta | Adoptar | Los tres lo tienen; son tres `MessageSort` de UML. Respuesta = linea discontinua |
| Mensaje propio | Adoptar | Comun a los tres |
| Creacion y destruccion | Adoptar | UML `createMessage`/`deleteMessage`; Mermaid y PlantUML lo soportan; solo cambia donde empieza/termina la linea de vida |
| Mensaje perdido / encontrado | Diferir | UML y PlantUML lo tienen, Mermaid solo parcial (`-x`); poco uso en documentacion de arquitectura |
| Activacion (barra) | Adoptar | Los tres; es una marca de rango entre dos mensajes |
| Fragmentos `alt opt loop par break critical` con guarda | Adoptar | Los seis que comparten Mermaid y PlantUML; anidables |
| `neg assert ignore consider strict seq` | Descartar | Ningun motor los dibuja; sirven para trazas formales |
| Nota (izq., der., sobre uno o varios) | Adoptar | Comun |
| Autonumeracion | Adoptar | Comun a Mermaid y PlantUML; encaja con el orden de Pasos |
| Referencia a otra interaccion (`ref`) | Adoptar como Enlace entre Vistas | UML InteractionUse y PlantUML `ref over`; es el Drill-down de la secuencia |
| Caja de agrupar participantes (`box`) | Adoptar como Grupo | Un Grupo ya es un Nodo que contiene Nodos |
| Separadores y retardos | Opcional | Solo PlantUML; barato pero no esencial |
| Estado invariante, restricciones de tiempo, Gates, coregion | Descartar | Solo UML; ningun motor |

## 2. ER

### 2.1 Notaciones

- Crow's foot / Information Engineering (IE): el estandar de facto de herramientas. Mermaid y PlantUML lo usan con el mismo vocabulario de simbolos; D2 lo ofrece como cabezas de flecha.
- Chen: rectangulos para entidades, rombos para relaciones, elipses para atributos. La fuente primaria (Chen, "The Entity-Relationship Model: Toward a Unified View of Data", ACM TODS 1(1), 1976) **no se pudo descargar** en esta pasada (la copia de lsu.edu devuelve 404 y el DOI de ACM no entrega PDF). Lo anterior sobre Chen es conocimiento previo, **NO VERIFICADO**. Ningun motor revisado lo soporta (Mermaid, PlantUML y D2 solo ofrecen crow's foot o tablas).
- UML class diagram con multiplicidades: alternativa, no se profundizo (PlantUML ofrece `entity` como alias de `class`, ver 2.2).

### 2.2 Como lo resuelven los tres

**Mermaid** (https://mermaid.js.org/syntax/entityRelationshipDiagram.html)
- Relacion: `A <izq><linea><der> B : etiqueta`. Cardinalidad por extremo (caracter externo = maximo, interno = minimo):

| Izq. | Der. | Significado |
|---|---|---|
| `\|o` | `o\|` | cero o uno |
| `\|\|` | `\|\|` | exactamente uno |
| `}o` | `o{` | cero o mas |
| `}\|` | `\|{` | uno o mas |

- Linea: `--` identificante (solida), `..` no identificante (discontinua). La etiqueta se lee desde la primera entidad.
- Entidad: alias `p[Person]`, atributos `tipo nombre` entre llaves; claves `PK`, `FK`, `UK` (combinables, `PK, FK`); comentario entre comillas al final de la linea; tipo con `?` marca opcional (v11.16.0+); `direction TB|BT|LR|RL`.

**PlantUML** (https://plantuml.com/ie-diagram)
- `entity` (alias de `class`). Mismos cuatro simbolos de cardinalidad que Mermaid (`|o--`, `||--`, `}o--`, `}|--`) y linea `..` para discontinua.
- Atributos: prefijo `*` = obligatorio; una linea `--` separa los atributos clave (arriba) de los demas.
- `hide circle` y `skinparam linetype ortho` para mejorar el dibujo.

**D2** (https://d2lang.com/tour/sql-tables; cabezas en https://github.com/terrastruct/d2/blob/master/d2target/d2target.go)
- `shape: sql_table`: cada clave es una fila, el valor es el tipo y `constraint` fija la restriccion (`primary_key` se acorta a PK, `foreign_key` a FK, `unique` a UNQ; admite arreglo).
- La clave foranea es una conexion entre tablas; con los motores ELK o TALA la conexion apunta a la fila exacta (equivalente a una Arista entre Atributos).
- Cabezas de flecha crow's foot en el codigo: `cf-one`, `cf-one-required`, `cf-many`, `cf-many-required` (el dato sale de `d2target.go`; la pagina de tour consultada no los describe).

### 2.3 Elementos minimos y recomendacion

| Elemento | Decision | Motivo |
|---|---|---|
| Entidad con lista ordenada de Atributos (nombre, tipo, notas) | Adoptar | Es el Nodo con Atributos; ya en el Modelo |
| Marca de clave PK/FK/UK | Adoptar | Comun a Mermaid y D2 (PlantUML la reduce a `*` y separador) |
| Opcionalidad de Atributo (`?` / `*`) | Adoptar | Comun en la practica; cabe en las notas o el tipo del Atributo |
| Comentario por Atributo | Adoptar | Mermaid y el campo `notas` del Atributo |
| Cardinalidad por extremo: 0..1, 1, 0..*, 1..* | Adoptar | Los 4 simbolos identicos en Mermaid y PlantUML; D2 los representa con 4 cabezas; cabe en la cardinalidad de la Arista |
| Linea identificante (solida) / no identificante (discontinua) | Adoptar | Mermaid y PlantUML; es un estado o variante de la Arista |
| Etiqueta del verbo en la relacion | Adoptar | Es la etiqueta corta de la Arista |
| FK como Arista entre Atributos | Adoptar | D2 lo hace asi; el Modelo ya permite Atributo como extremo |
| Alias de entidad | No hace falta | El Nodo ya tiene id y titulo |
| Chen (rombos, elipses) | Descartar | Sin soporte en los motores; fuente primaria no verificada |
| Relacion N:M con tabla intermedia, supertipos/subtipos | Diferir | Ningun motor revisado lo trata como elemento propio; se modela con entidades y Aristas |

## 3. Huecos del Modelo y puntos para tickets siguientes

Esto es lectura de `CONTEXT.md`, no hallazgo de fuente:

1. ER encaja ya: Nodo con Atributos, Arista con cardinalidad y etiqueta, extremo Atributo. Faltaria solo declarar en el vocabulario de cardinalidad los cuatro valores y el estilo de linea (identificante / no).
2. Secuencia no tiene hoy: orden total de mensajes (en el Modelo las Aristas no estan ordenadas), tipo de mensaje (sincrono/asincrono/respuesta/creacion/destruccion), barras de activacion y Fragmentos combinados con operandos y guardas. Un Fragmento no es un Nodo ni un Grupo de Nodos: contiene mensajes, no entidades.
3. Los Pasos acumulativos del glosario coinciden con el orden natural de mensajes; la autonumeracion podria derivarse de ahi (pendiente de ticket "Pasos de revelado en secuencia").
4. Reuso de Temas: los elementos nuevos (cabecera de Lifeline, barra de activacion, marco de Fragmento, fila de Atributo, cabezas crow's foot) se pueden dibujar con Primitivas de forma, trazo y marcador de Arista existentes; los cuatro simbolos crow's foot serian Primitivas de la Familia "marcador de Arista" (no verificado contra `docs/referencia-catalogo.md` en esta pasada).

## 4. No verificado o pendiente

- Notacion de Chen desde la fuente primaria.
- Si D2 documenta creacion/destruccion y autonumeracion en secuencia (la pagina leida no lo menciona; podria existir en otra pagina).
- `box` en PlantUML y si el tour de D2 describe los `cf-*`.
- Los fetch de documentacion web pasaron por un resumidor, asi que las tablas de tokens de Mermaid y PlantUML conviene recotejarlas con la fuente antes de fijar el DSL.
