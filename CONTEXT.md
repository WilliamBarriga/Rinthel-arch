# rinthel-arch

Sistema para explicar proyectos con diagramas grandes y detallados, agnostico del proyecto que se documenta.

## Language

**Proyecto documentado**:
El software o sistema que se explica (ej. un proyecto externo). El sistema de diagramas no depende de el.

**Modelo**:
Conjunto unico de Nodos y Aristas de un Proyecto documentado, del que salen todas las Vistas. El texto semantico (titulo, descripcion) vive una sola vez, aqui.

**Nodo**:
Entidad del Modelo con identidad estable, tipo libre definido por el proyecto (servicio, tabla, actor...), titulo, descripcion, Atributos opcionales y `source` opcional.

**Grupo**:
Nodo que contiene otros Nodos. Se anida sin limite. No es un concepto aparte de Nodo.

**Arista**:
Relacion entre dos extremos del Modelo. Un extremo es un Nodo o un Atributo de un Nodo, y puede llevar cardinalidad.

**Atributo**:
Elemento estructurado y ordenado de un Nodo (columna, campo, metodo), con nombre, tipo y notas. Es direccionable como extremo de una Arista. Distinto de un Nodo hijo.

**Source**:
Lista de referencias opacas de un Nodo al Proyecto documentado (ruta de archivo, ruta y simbolo, URL, id de entidad externa), cada una con `kind` y `ref`. El nucleo las guarda sin interpretarlas.

**Vista**:
Proyeccion declarativa de un Modelo, de un Tipo de diagrama: que Nodos incluye o excluye y hasta que profundidad. Nunca define entidades nuevas. Puede sobrescribir solo presentacion (etiqueta corta, Pin, estilo, orden).

**Tipo de diagrama**:
Familia de notacion que fija como se dibuja una Vista. Primera entrega: arquitectura y flujo. Despues: secuencia y ER.

**Drill-down**:
Pasar de un Nodo a su detalle. Cada Vista elige el mecanismo: colapsar o expandir el Grupo en la misma Vista, o enlazar a otra Vista.

**Pin**:
Posicion manual de un elemento en una Vista que anula el auto-layout.

**Fuente canonica**:
Formato estructurado y validable por esquema del que se renderiza todo. Escrito a mano, por agentes, o compilado desde un DSL de texto.

**DSL de texto**:
Sintaxis legible para humanos que compila a la Fuente canonica.

## Terminos pendientes
Fuente canonica y DSL de texto se afinan en su ticket de grilling del mapa.
