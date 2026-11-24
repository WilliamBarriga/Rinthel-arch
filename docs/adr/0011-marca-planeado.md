# Marca Planeado: Blueprints desde un PRD y su paso a codigo real

Un agente puede escribir un Workspace a partir de un PRD, una spec o una descripcion de algo que aun no existe, y casi siempre lo hace sobre un sistema que ya existe (una feature nueva en un repo con Workspace). Por eso lo propuesto se marca elemento por elemento con una marca del Modelo, **Planeado** (`planned`), que el Tema dibuja como un estado de solo pintura. Asi conviven lo real y lo propuesto en la misma Vista. Se descarto marcarlo solo por convencion de Source (el nucleo no interpreta Source, asi que en el lienzo no se ve), con Tipos de nodo duplicados (ensucian el catalogo y no sirven para Aristas) y con un Tema o una Vista "plan" (no sirven cuando se mezcla con lo real). Fuente: el ticket "Blueprint desde un PRD o una descripcion" (#221) del mapa #211. Enmienda el ADR 0008 con un estado nuevo.

## Decisiones

- **Marca `planned`** en Nodo, Arista, Atributo (junto a `pk fk uk`, dibujada como chip) e Interaccion. Es parte del Modelo, no de la Vista.
- **Herencia**: un Grupo planeado marca a todos sus descendientes. Una Arista se dibuja planeada si lleva la marca o si alguno de sus extremos esta planeado. Un Mensaje hereda la marca de su Interaccion o de una Lifeline planeada; los Mensajes sueltos no se marcan. Un descendiente real (con Source `path`) bajo un Grupo planeado es error de `validate`, con `fix` que quita la marca del Grupo; la otra salida es moverlo fuera del Grupo.
- **Estado de Tema `planned`** (enmienda al ADR 0008): solo pinta, como `fantasma`, y nunca cambia Metricas. El Tema por defecto lo dibuja con borde discontinuo y opacidad baja; cada Tema puede reestilizarlo y, sin parche propio, hereda el del Tema por defecto.
- **Rastro al PRD**: cuando el PRD es un archivo, cada elemento escrito desde el lleva `source { kind "spec" ref "<archivo>#<seccion>" }`. Es simetrico al `kind "path"` del ADR 0010, y el nucleo tampoco lo interpreta.
- **Supuestos y preguntas abiertas**: van en la `description` del elemento afectado con prefijo `Assumption:` u `Open question:`, buscables con `inspect`. El agente escribe primero el borrador sin preguntar, entrega la URL de `dev` y como mucho unas 5 preguntas que cambian la forma del diagrama.
- **Tipos de diagrama por defecto**: una Vista `architecture` mas una `sequence` por cada recorrido clave del PRD; `er` si el PRD trae modelo de datos y `flow` a pedido.
- **Paso a codigo real**: cuando el sistema existe, el agente corre `diagrams scan` y reconcilia. A cada elemento planeado que encuentra en el Borrador de escaneo le agrega la Source `path` y le quita `planned`. Lo que no encuentra sigue planeado y se le reporta al usuario como "aun no construido o diverge del plan". El emparejamiento lo decide el agente, nunca el sistema. Ayudas mecanicas: `dg inspect planned` lista lo planeado con su Source `spec`, y el aviso `W_PLANNED_WITH_PATH` (con `fix` que quita `planned`) detecta un elemento que tiene las dos marcas.
- **Flujo para agentes**: seccion "Plan from a spec" de la skill `rinthel-diagramas`, junto a "Import from code".

## Fuera de v1

- Una marca para lo que el PRD retira (`retiring`). En v1 un retiro se anota como `Open question:` en la `description` del elemento.
- Filtros de Vista por planeado (`exclude planned`, un Paso que revela lo planeado). En v1, "hoy contra manana" se hace con dos Vistas y `exclude` explicito.
