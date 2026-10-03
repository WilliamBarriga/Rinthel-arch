# Layout: ELK como paso de build con geometria cacheada

ELK (EPL-2.0) es el unico motor verificado que cubre Grupos anidados, puertos, routing ortogonal y restricciones; dagre y d3-hierarchy no cumplen. El layout es un paso de build: el CLI compila el DSL a Fuente canonica y anade una capa de geometria cacheada por Vista (estado por defecto de colapso). El render la recibe ya calculada, asi es sincrono y determinista para video y morph de slides. El shell interactivo re-ejecuta ELK en Web Worker solo en estados de colapso no cacheados.

## Decisiones derivadas

- **Pin**: se aplica despues de ELK como posicion relativa al Grupo padre, y se re-enrutan solo las Aristas que tocan Nodos pineados. Se descarta `position` + `semiInteractive` porque solo respeta el orden en la capa, no la posicion. El solape entre Pins es responsabilidad del autor; `validate` puede avisar.
- **Drill-down por colapso**: relayout de la Vista completa con `hierarchyHandling: INCLUDE_CHILDREN`, Aristas a Nodos ocultos agregadas sobre el Grupo cerrado, sin `considerModelOrder`; estabilidad visual por compensacion de camara (el Grupo tocado no se mueve en pantalla) mas morph animado entre la geometria anterior y la nueva. Se descarta `SEPARATE_CHILDREN` porque pierde precision en Aristas entre Grupos.

## Consecuencias

- Umbrales de aceptacion para el plan de construccion: build CLI de una Vista hasta 10k Nodos en menos de 60 s y 2 GB; relayout interactivo con hasta 1k Nodos visibles en menos de 2 s; colapso con 5k Nodos del Modelo en menos de 3 s; bundle del shell (elkjs worker + api) por debajo de 500 KB gzip. El shell no expande mas de ~1k Nodos a la vez. Se verifican con un proyecto externo y en navegador cuando exista la implementacion.
- Solo se cachea la geometria por defecto de cada Vista; no se precalculan otros estados de colapso.

## Enmienda

Se quita `considerModelOrder: NODES_AND_EDGES`: el benchmark (`research/elk-benchmark`) midio 633 s en 10k Nodos contra 18 s sin ella. `PREFER_*` y `semiInteractive` quedan sin medir; se reabre solo si camara y morph resultan insuficientes.
