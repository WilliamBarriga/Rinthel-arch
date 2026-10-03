# rinthel-arch

Sistema para explicar proyectos con diagramas grandes y detallados, agnostico del proyecto que se documenta.

## Language

**Proyecto documentado**:
El software o sistema que se explica (ej. un proyecto externo). El sistema de diagramas no depende de el.

**Modelo**:
Conjunto unico de entidades y relaciones de un proyecto documentado, del que salen todas las vistas.

**Vista**:
Proyeccion de un Modelo, de un Tipo de diagrama, que se muestra como un diagrama. Varias vistas comparten entidades sin duplicarlas.

**Tipo de diagrama**:
Familia de notacion (arquitectura, secuencia, flujo...). El conjunto exacto esta por decidir.

**Drill-down**:
Pasar de una vista general al detalle de un subsistema, via grupos colapsables o vistas enlazadas.

**Pin**:
Posicion manual de un elemento que anula el auto-layout.

**Fuente canonica**:
Formato estructurado y validable por esquema del que se renderiza todo. Escrito a mano, por agentes, o compilado desde un DSL de texto.

**DSL de texto**:
Sintaxis legible para humanos que compila a la Fuente canonica.

## Terminos pendientes
Modelo/Vista y el conjunto de Tipos de diagrama se afinan en los tickets de grilling del mapa.
