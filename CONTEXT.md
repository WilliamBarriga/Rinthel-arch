# rinthel-arch

Sistema para explicar proyectos con diagramas grandes y detallados, agnostico del proyecto que se documenta.

## Language

**Proyecto documentado**:
El software o sistema que se explica (ej. un proyecto externo). El sistema de diagramas no depende de el.

**Modelo**:
Conjunto unico de Nodos y Aristas de un Proyecto documentado, del que salen todas las Vistas. El texto semantico (titulo, descripcion) vive una sola vez, aqui.

**Nodo**:
Entidad del Modelo con identidad estable (id cualificado por su jerarquia, ej. `rinthel.api.auth`), Tipo de nodo declarado por el proyecto, titulo, descripcion, Atributos opcionales y `source` opcional.

**Grupo**:
Nodo que contiene otros Nodos. Se anida sin limite. No es un concepto aparte de Nodo.

**Arista**:
Relacion entre dos extremos del Modelo. Un extremo es un Nodo o un Atributo de un Nodo, y puede llevar cardinalidad.

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

**Grupo colapsado**:
Grupo mostrado como un Nodo unico, con su contador de hijos y las Aristas de sus hijos elevadas a su borde. Al abrir una Vista, los Grupos que exceden su profundidad aparecen colapsados.

**Enlace entre Vistas**:
Drill-down de un Nodo hacia otra Vista. Es navegacion, no jerarquia: una Vista puede tener varios padres y los ciclos son validos. La ruta recorrida se muestra como breadcrumbs.

**Tema**:
Conjunto resuelto de tokens de presentacion (paleta, fuentes, tokens semanticos) con el que se dibuja una Vista. Se declara en el Workspace, es modular (compone partes y hereda de otro Tema) y nunca toca el Modelo.

**Paleta**:
Colores con nombre de un Tema (`blue`, `danger`). El Modelo y las Vistas solo se refieren a un color por su nombre de Paleta, nunca por valor literal.

**Paso**:
Punto ordenado de una Vista que revela Nodos y Aristas de forma acumulativa. Solo cambia visibilidad, nunca posicion. Una Vista sin Pasos se muestra completa.

**Pin**:
Posicion manual de un elemento en una Vista que anula el auto-layout.

**Fuente canonica**:
Formato estructurado (Modelo y Vistas) validable por esquema, del que se renderiza todo. Es un artefacto derivado: nadie lo edita, se compila siempre desde el DSL de texto.

**DSL de texto**:
Sintaxis legible para humanos y agentes, y unica fuente que se edita y versiona. Compila en un solo sentido a la Fuente canonica.

**Workspace**:
Carpeta de archivos de DSL de texto que se fusionan en el Modelo unico de un Proyecto documentado. Cada archivo puede aportar Nodos, Aristas y Vistas.
