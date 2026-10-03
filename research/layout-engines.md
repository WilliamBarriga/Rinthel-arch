# Motores de auto-layout con grupos anidados (t03)

Ticket: `.wayfinder/tickets/t03-layout-engines.md`. Fecha: 2026-10-03.
Metodo: solo fuentes primarias (docs oficiales ELK/Graphviz/D3, READMEs de repos). Cada afirmacion cita su fuente. Lo no verificado se marca **[no verificado]**.

## Resumen

| Criterio | ELK (elkjs) | dagre | d3-hierarchy | Graphviz wasm |
|---|---|---|---|---|
| Grupos anidados | Si, `children` + cross-hierarchy edges | Clustering mencionado en wiki **[detalle no verificado]** | Solo arboles, sin aristas | Clusters; `compound` solo en `dot` |
| Puertos | Si, `portConstraints` | No | No | **[no verificado aqui]** |
| Pins/restricciones | `fixed`, layer/position constraints, interactive | No documentado | No | `pos` solo neato/fdp |
| Edge routing | orthogonal / polyline / spline, secciones con bendPoints | Control points (bends) | No | splines en salida SVG |
| Estabilidad al editar | `considerModelOrder`, semi-interactive, interactive | **[no verificado]** | Determinista por arbol | **[no verificado]** |
| Rendimiento grande | **[sin benchmarks oficiales encontrados]** | "medium sized graphs quickly" | n/d | **[no verificado]** |
| Licencia | EPL-2.0 | n/d | n/d | Apache-2.0 (wrapper) |

Recomendacion tentativa (para el ADR, no decidida aqui): ELK es el unico candidato verificado que cubre grupos anidados + puertos + routing ortogonal + restricciones. dagre y d3-hierarchy no cubren el requisito. Graphviz wasm es alternativa para grafos con clusters sin puertos jerarquicos finos.

## ELK / elkjs

- elkjs es el Eclipse Layout Kernel transpilado de Java con GWT; solo layout, "no rendering, styling" ([kieler/elkjs](https://github.com/kieler/elkjs)).
- Algoritmos por defecto: layered, stress, mrtree, radial, force, disco; box, fixed, random siempre disponibles ([kieler/elkjs](https://github.com/kieler/elkjs)).
- API: `layout(graph, options)` con grafo en ELK JSON; Web Worker via `workerUrl` para no bloquear la UI ([kieler/elkjs](https://github.com/kieler/elkjs)).
- Licencia: EPL-2.0 con clausula secundaria opcional GPL-3.0+ ([LICENSE.md](https://raw.githubusercontent.com/kieler/elkjs/master/LICENSE.md)).
- Formato JSON: el grafo es un nodo cuyos `children` son los nodos de nivel superior; nodos con `ports`; coordenadas relativas al contenedor; aristas con `sections` (`startPoint`, `endPoint`, `bendPoints`), con secciones que cruzan jerarquia via `incomingShape/outgoingShape` ([ELK JSON format](https://eclipse.dev/elk/documentation/tooldevelopers/graphdatastructure/jsonformat.html)).
- **Grupos anidados**: `layered` ofrece "full layout of compound graphs with cross-hierarchy edges" si se activa la opcion en el nivel superior ([layered](https://eclipse.dev/elk/reference/algorithms/org-eclipse-elk-layered.html)). Opcion `hierarchyHandling`: `INHERIT` (default), `INCLUDE_CHILDREN` (una sola corrida con descendientes), `SEPARATE_CHILDREN` (corrida nueva por compuesto) ([hierarchyHandling](https://eclipse.dev/elk/reference/options/org-eclipse-elk-hierarchyHandling.html)). Implicancia: drill-down por colapso puede usar `SEPARATE_CHILDREN`; aristas entre niveles requieren `INCLUDE_CHILDREN`.
- **Puertos**: `portConstraints` = UNDEFINED (default), FREE, FIXED_SIDE, FIXED_ORDER, FIXED_RATIO, FIXED_POS ([portConstraints](https://eclipse.dev/elk/reference/options/org-eclipse-elk-portConstraints.html)). Con routing ortogonal, layered respeta restricciones arbitrarias de puerto, apto para diagramas de bloques ([layered](https://eclipse.dev/elk/reference/algorithms/org-eclipse-elk-layered.html)).
- **Edge routing**: orthogonal, polyline, splines; self-loops, aristas multiples, etiquetas de arista ([layered](https://eclipse.dev/elk/reference/algorithms/org-eclipse-elk-layered.html)).
- **Pins/restricciones**:
  - Algoritmo `fixed`: no modifica el layout; acepta coordenadas opcionales de nodos y bend points ([fixed](https://eclipse.dev/elk/reference/algorithms/org-eclipse-elk-fixed.html)). Opera sobre un contenedor completo, no mezcla pineados y auto **[inferencia, no verificado]**.
  - En `layered`: layer constraints, position ID/choice constraints, predecesor/sucesor en capa, modo interactivo ([layered](https://eclipse.dev/elk/reference/algorithms/org-eclipse-elk-layered.html)).
  - `interactiveLayout` (bool, default false) ([interactiveLayout](https://eclipse.dev/elk/reference/options/org-eclipse-elk-interactiveLayout.html)).
  - `crossingMinimization.semiInteractive`: preserva el orden de nodos en la capa derivado de `org.eclipse.elk.position`; requiere LAYER_SWEEP ([semiInteractive](https://eclipse.dev/elk/reference/options/org-eclipse-elk-layered-crossingMinimization-semiInteractive.html)).
  - `partitioning.activate`: indices de particion fuerzan orden izquierda-derecha ([partitioning](https://eclipse.dev/elk/reference/options/org-eclipse-elk-partitioning-activate.html)).
  - Un **Pin** del dominio (posicion manual que anula el auto-layout) no es una opcion nativa unica; se aproxima con position + semiInteractive, o sobrescribiendo posiciones tras el layout **[decision de diseno pendiente]**.
- **Estabilidad al editar**: `considerModelOrder.strategy` (NONE default, NODES_AND_EDGES, PREFER_EDGES, PREFER_NODES) preserva el orden del modelo "si no genera cruces adicionales" ([considerModelOrder](https://eclipse.dev/elk/reference/options/org-eclipse-elk-layered-considerModelOrder-strategy.html)). No garantiza estabilidad de coordenadas.
- **Rendimiento**: la documentacion consultada no publica benchmarks. Web Worker mitiga el bloqueo de UI. **[Pendiente medir con grafo sintetico.]**
- **Integracion con render**: ELK devuelve solo geometria; el componente React dibuja. width/height de nodos son entrada del JSON, por lo que el render debe medirlos antes del layout **[inferido]**.

## dagre

- Libreria JS de layout de grafos dirigidos en cliente; rapida en grafos medianos, agnostica de render, usa graphlib ([dagre wiki](https://github.com/dagrejs/dagre/wiki)).
- La wiki cita trabajo de Sander sobre grafos dirigidos compuestos (clustering) ([dagre wiki](https://github.com/dagrejs/dagre/wiki)). La API de anidacion y sus limites no se verificaron; el README solo remite a la wiki ([README](https://raw.githubusercontent.com/dagrejs/dagre/master/README.md)).
- Sin puertos; aristas devueltas como puntos de control, asumiendo nodos rectangulares ([dagre wiki](https://github.com/dagrejs/dagre/wiki)).
- Prioriza velocidad "potentially at the cost of not being able to adopt more optimal or exact algorithms" ([dagre wiki](https://github.com/dagrejs/dagre/wiki)).
- Mantenimiento: ultima edicion de la wiki nov 2023, 172 issues abiertos (a fecha de consulta) ([dagre wiki](https://github.com/dagrejs/dagre/wiki)).
- Veredicto: sin puertos ni pins; no cumple requisitos.

## d3-hierarchy

- Layouts: tree, cluster, partition, pack, treemap ([d3-hierarchy](https://d3js.org/d3-hierarchy)).
- Solo jerarquias de arbol; sin DAG ni routing de aristas generales ([d3-hierarchy](https://d3js.org/d3-hierarchy)).
- Uso posible: dimensionar contenedores (treemap/pack) combinado con otro motor para aristas. Solo no resuelve el requisito.

## Graphviz wasm (@hpcc-js/wasm)

- Wrapper wasm de Graphviz 16.1.0 (README a la fecha de consulta); API `Graphviz.load()` y `graphviz.dot(dot)` devuelve SVG; Apache-2.0; Node y navegador ([hpcc-js-wasm](https://github.com/hpcc-systems/hpcc-js-wasm)).
- La API documentada entrega SVG (acople con render); extraer geometria requeriria formatos `json`/`plain` de Graphviz **[no verificado]**.
- Aristas hacia/desde clusters: `compound=true` + `lhead/ltail`, "dot only" ([compound](https://graphviz.org/docs/attrs/compound/)).
- `pos` solo funciona en neato y fdp, para inicializar posiciones ([pos](https://graphviz.org/docs/attrs/pos/)); `dot` no tiene pin por nodo.
- Tamano del wasm: no indicado en el README **[no verificado]**.

## Preguntas abiertas

1. Medir ELK layered con `INCLUDE_CHILDREN` en 1k/5k/10k nodos sinteticos: tiempo, memoria, tamano del bundle elkjs.
2. Definir como se implementa **Pin** sobre ELK (position + semiInteractive vs sobrescritura post-layout).
3. Drill-down por colapso: relayout con `SEPARATE_CHILDREN` vs vistas enlazadas (afecta estabilidad).
4. Verificar anidacion de dagre solo si se reconsidera como fallback.
