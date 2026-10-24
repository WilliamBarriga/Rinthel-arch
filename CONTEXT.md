# rinthel-arch

Sistema para explicar proyectos con diagramas grandes y detallados, agnostico del proyecto que se documenta.

## Language

**Proyecto documentado**:
El software o sistema que se explica (ej. este mismo repo, en `examples/rinthel-arch/`). El sistema de diagramas no depende de el.

**Modelo**:
Conjunto unico de Nodos y Aristas de un Proyecto documentado, del que salen todas las Vistas. El texto semantico (titulo, descripcion) vive una sola vez, aqui.

**Nodo**:
Entidad del Modelo con identidad estable (id cualificado por su jerarquia, ej. `rinthel.api.auth`), Tipo de nodo declarado por el proyecto, titulo, descripcion, Atributos opcionales y `source` opcional.

**Grupo**:
Nodo que contiene otros Nodos. Se anida sin limite. No es un concepto aparte de Nodo.

**Arista**:
Relacion entre dos extremos del Modelo. Un extremo es un Nodo o un Atributo de un Nodo, y puede llevar cardinalidad y una etiqueta corta.

**Atributo**:
Elemento estructurado y ordenado de un Nodo (columna, campo, metodo), con nombre, tipo y notas. Es direccionable como extremo de una Arista. Distinto de un Nodo hijo.

**Tipo de nodo**:
Categoria de Nodo (servicio, tabla, actor...) declarada en el catalogo del Proyecto documentado, con su icono y estilo. Un Tipo de nodo no declarado es error de validacion. Distinto de Tipo de diagrama.

**Source**:
Lista de referencias opacas de un Nodo al Proyecto documentado (ruta de archivo, ruta y simbolo, URL, id de entidad externa), cada una con `kind` y `ref`. El nucleo las guarda sin interpretarlas.

**Vista**:
Proyeccion declarativa de un Modelo, de un Tipo de diagrama: que Nodos incluye o excluye y hasta que profundidad. Nunca define entidades nuevas. Puede sobrescribir solo presentacion (etiqueta corta, Pin, estilo, orden).

**Tipo de diagrama**:
Familia de notacion que fija como se dibuja una Vista. Primera entrega: arquitectura y flujo. Despues: secuencia y ER.

**Drill-down**:
Pasar de un Nodo a su detalle. Cada Vista tiene un mecanismo por defecto (colapsar o expandir el Grupo en la misma Vista) y puede anularlo por Nodo enlazando a otra Vista. Un Grupo enlazado no se expande en esa Vista.

**Cabecera del Grupo**:
Arbol de Slots (mini-layout) que el Tema declara en `group` para el titulo y el icono de un Grupo abierto; su alto, con el padding de la zona de hijos, es el margen superior que layout reserva.

**Grupo colapsado**:
Grupo mostrado como un Nodo unico, con su contador de hijos y las Aristas de sus hijos elevadas a su borde. Al abrir una Vista, los Grupos que exceden su profundidad aparecen colapsados.

**Enlace entre Vistas**:
Drill-down de un Nodo hacia otra Vista. Es navegacion, no jerarquia: una Vista puede tener varios padres y los ciclos son validos. La ruta recorrida se muestra como breadcrumbs.

**Tema**:
Declaracion de presentacion con la que se dibuja una Vista: Paleta, fuentes, tokens y, por cada elemento (Nodo, Arista, Grupo, fondo de pagina), una pila de Capas, mas su animacion. Se declara en el Workspace, es modular (`extends` de un padre y Partes reutilizables) y nunca toca el Modelo. Una Vista elige un solo Tema, asi que diagramas distintos pueden tener lineas visuales distintas; dentro de la Vista, la forma varia por Tipo de nodo, estado, Arista y Grupo mediante parches.

**Tema por defecto**:
Tema incorporado que usa una Vista sin Tema: `neutral` (claro). Lo acompanan `neutral-dark` y `alto-contraste`. Escrito en el mismo DSL que cualquier Tema.

**Capa**:
Unidad con nombre de la pila que dibuja un elemento; es una instancia de una Primitiva, va bajo el contenido (defecto) o sobre el, y puede animarse. La variacion por Tipo, estado o Vista se expresa como parche por nombre de Capa (cambiar, anadir con `before`/`after`, quitar con `none`). Un componente de codigo del Tema tambien es una Capa (Componente de Tema).

**Primitiva**:
Tipo de Capa del catalogo cerrado (forma, relleno, trazo, sombra, vidrio, decoracion...). Una Primitiva nueva se anade al catalogo por issue; una Familia nueva, por ADR.

**Familia**:
Grupo de Primitivas del mismo oficio (forma, relleno, borde/trazo, sombra, glow, vidrio, filtro, decoracion, marcador de Arista, estilo de texto de Slot, codigo). Cada Primitiva pertenece a una sola.

**Slot**:
Lugar de contenido de nombre fijo en un Nodo o Grupo (`icon`, `title`, `desc`, `badge`, `footer`, `attrs`, `counter`). El Tema decide cuales se muestran, en que orden y con que estilo. Junto con la caja, son lo unico que afecta a las Metricas.

**Movimiento**:
Animacion continua de catalogo cerrado (`flujo`, `pulso`, `respiracion`...) que se cuelga de una Capa y puede atarse a un estado. Las reacciones a la interaccion son transiciones entre parches de estado; `enter`/`exit` animan la aparicion y salida, y un Paso solo dispara la `enter`.

**Parte de Tema**:
Parche reutilizable sin Tema (`part`), incluido con `use` dentro de un elemento.

**Componente de Tema**:
Componente React/TS del Workspace que un Tema referencia por nombre como Capa `code`, para lo que el catalogo no cubre. Es solo visual y no afecta a las Metricas; un Tema que lo usa queda marcado "con codigo".

**Paleta**:
Colores con nombre de un Tema (`blue`, `danger`). El Modelo y las Vistas solo se refieren a un color por su nombre de Paleta, nunca por valor literal.

**Paso**:
Punto ordenado de una Vista que revela Nodos y Aristas de forma acumulativa. Solo cambia visibilidad, nunca posicion. Una Vista sin Pasos se muestra completa.

**Pin**:
Posicion manual de un elemento en una Vista que anula el auto-layout. Ancla el centro del elemento.

**Fuente canonica**:
Formato estructurado (Modelo y Vistas) validable por esquema, del que se renderiza todo. Es un artefacto derivado: nadie lo edita, se compila siempre desde el DSL de texto.

**DSL de texto**:
Sintaxis legible para humanos y agentes, y unica fuente que se edita y versiona. Compila en un solo sentido a la Fuente canonica.

**Workspace**:
Carpeta de archivos de DSL de texto que se fusionan en el Modelo unico de un Proyecto documentado. Cada archivo puede aportar Nodos, Aristas y Vistas.

**Sesion**:
Estado compilado de un Workspace en un momento dado: Fuente canonica, issues y geometria por Vista (calculada bajo demanda). Es un valor inmutable; un cambio de archivos produce otra Sesion. Lo consumen el CLI, `dev` y `inspect`.

**Estilo resuelto**:
Resultado de aplicar la cascada (Tema base, Tipo de nodo, estado, override de la Vista) a las pilas de Capas. Tiene dos mitades: las Metricas (las lee el layout) y la pintura (las Capas, las lee el render). Cambiar la estetica es cambiar el Tema, no la logica de dibujo.

**Metricas**:
Medidas de espacio derivadas de un Tema, por elemento (Nodo por Tipo de nodo, Grupo abierto, Grupo colapsado, etiqueta de Arista): padding, gap, tamano de Slot y caja minima de la forma. Solo la caja y los Slots las afectan. Las comparten el calculo de posiciones y el dibujo, de modo que lo reservado y lo dibujado no pueden divergir.

**Geometria vigente**:
Geometria cacheada de una Vista que sigue valiendo: nada de lo que influye en las posiciones (estructura, textos, fuentes, Metricas, Pins) cambio desde que se calculo. Una sola respuesta para Sesion, CLI y shell.

**Intencion**:
Cambio que el usuario pide sobre el DSL de texto, expresado en terminos del dominio (hoy: mover el Pin de un Nodo en una Vista). Aun no es una edicion de texto; un Gesto la convierte en una.

**Gesto**:
Operacion de la Sesion que recibe una Intencion, calcula la edicion minima del DSL de texto, la auto-prueba y la aplica en memoria. Quien lo invoca solo se ocupa de escribir el resultado.

**Seleccion**:
Elemento o elementos de una Vista (Nodo, Arista, Atributo) sobre los que actua el editor. Es el sujeto de las Intenciones.
