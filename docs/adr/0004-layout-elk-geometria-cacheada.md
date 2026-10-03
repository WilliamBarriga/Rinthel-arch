# Layout: ELK como paso de build con geometria cacheada

ELK (EPL-2.0) es el unico motor verificado que cubre Grupos anidados, puertos, routing ortogonal y restricciones; dagre y d3-hierarchy no cumplen. El layout es un paso de build: el CLI compila el DSL a Fuente canonica y anade una capa de geometria cacheada por Vista (estado por defecto de colapso). El render la recibe ya calculada, asi es sincrono y determinista para video y morph de slides. El shell interactivo re-ejecuta ELK en Web Worker solo en estados de colapso no cacheados.

## Decisiones derivadas

- **Pin**: se aplica despues de ELK como posicion relativa al Grupo padre, y se re-enrutan solo las Aristas que tocan Nodos pineados. Se descarta `position` + `semiInteractive` porque solo respeta el orden en la capa, no la posicion. El solape entre Pins es responsabilidad del autor; `validate` puede avisar.
- **Drill-down por colapso**: relayout de la Vista completa con `hierarchyHandling: INCLUDE_CHILDREN`, Aristas a Nodos ocultos agregadas sobre el Grupo cerrado, estabilidad con `considerModelOrder` y compensacion de camara para que el Grupo tocado no se mueva en pantalla. Se descarta `SEPARATE_CHILDREN` porque pierde precision en Aristas entre Grupos.

## Consecuencias

- Pendiente de validacion tras el spec: benchmark de ELK en 1k/5k/10k Nodos sinteticos (tiempo, memoria, bundle) con umbral de aceptacion.
