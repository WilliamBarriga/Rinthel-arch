# Benchmark de ELK en 1k/5k/10k Nodos (ticket #13)

Fecha: 2026-10-03. Contexto: ADR 0004 (`docs/adr/0004-layout-elk-geometria-cacheada.md`) pide validar ELK con Grupos anidados y colapso con relayout completo. Fuente de las cifras: medicion propia (no hay benchmarks oficiales de ELK; ver `research/layout-engines`). Lo no medido se marca **[no medido]**.

## Resumen

- Con las opciones del ADR (`INCLUDE_CHILDREN` + `considerModelOrder: NODES_AND_EDGES`), 10k Nodos tardan **633 s** y 3.5 GB de RSS: inviable, incluso en worker.
- El costo lo domina `considerModelOrder.strategy = NODES_AND_EDGES`. Sin ella, 10k Nodos tardan **18 s** y 1.3 GB; 5k tardan 10 s.
- El colapso (relayout de la Vista con Grupos cerrados) sufre lo mismo: 5k con `considerModelOrder` 40 s, sin ella 1.7 s.
- Bundle: `elk.bundled.js` 1.6 MB (470 KB gzip); worker 1.6 MB min (465 KB gzip) + `elk-api.js` 9.8 KB (3 KB gzip).
- Recomendacion: umbral de aceptacion abajo; reconsiderar `considerModelOrder` en el ADR (estabilidad por otra via).

## Metodo

- elkjs 0.12.0 (npm, licencia `EPL-2.0 OR GPL-3.0-or-later` segun su `package.json`), `elk.bundled.js`, Node v24.20.0, 16 nucleos, 31 GB RAM, Linux. Un proceso por medicion; tiempo = `elk.layout()` de punta a punta (en Node corre en el hilo principal); memoria = `maxRSS` del proceso (incluye ~55-70 MB base).
- Grafo sintetico determinista (semilla fija): 3 niveles de anidacion (raiz > Grupo de 100 hojas > subgrupos de 10 hojas > Nodos de 120x48). Aristas = 1.39 por Nodo: 70% dentro del subgrupo, 20% entre subgrupos del mismo Grupo, 10% entre Grupos distintos (aristas cross-hierarchy).
- Opciones base: `algorithm=layered`, `direction=RIGHT`, `edgeRouting=ORTHOGONAL`, `hierarchyHandling=INCLUDE_CHILDREN` (decision del ADR), padding de Grupo 24/8/8/8.
- Colapso: cada Grupo de nivel 1 se vuelve un Nodo hoja de 200x80 y las aristas se agregan por par de Grupos (N/100 Nodos visibles).
- Una sola corrida por celda (sin repeticiones); tomar los valores como orden de magnitud. Grafo aleatorio: un Modelo real con estructura mas clara podria rendir mejor o peor **[no medido]**.
- Script (no commiteado, ~50 lineas): reproducible con los parametros de arriba.

## Resultados

Layout completo, ortogonal, `INCLUDE_CHILDREN`:

| Nodos | Aristas | `considerModelOrder` NODES_AND_EDGES | RSS max | Sin `considerModelOrder` | RSS max |
|---|---|---|---|---|---|
| 1 000 | 1 391 | 1.9 s | 334 MB | 1.5 s | 331 MB |
| 5 000 | 6 967 | 51.5 s | 1 428 MB | 10.4 s | 887 MB |
| 10 000 | 13 905 | 633 s | 3 483 MB | 18.2 s | 1 267 MB |

Routing POLYLINE (con `considerModelOrder`): 1k 1.7 s / 315 MB; 5k 48.9 s / 1 383 MB. El tipo de routing casi no cambia el costo; el layout resultante es 3x mas ancho en 5k (607 803 vs 192 261 px), sin ventaja.

Colapso (Grupos de nivel 1 cerrados, aristas agregadas):

| Nodos del Modelo | Nodos visibles | Aristas agregadas | Con `considerModelOrder` | Sin |
|---|---|---|---|---|
| 1 000 | 10 | 76 | 0.16 s | n/m |
| 5 000 | 50 | 623 | 39.8 s (649 MB) | 1.7 s (321 MB) |
| 10 000 | 100 | 1 328 | 557 s (1 295 MB) | **[no medido]** |

Extra (5k colapsado): quitar solo `hierarchyHandling` da 24 s; quitar ambas 1.3 s. Con ambas fuera el grafo se aplana y deja de ser comparable al caso anidado, solo sirve para aislar el costo.

Observaciones:

1. Escala superlineal con `considerModelOrder`: x5 Nodos = x27 tiempo (1k a 5k), x12 (5k a 10k). Sin ella: x7 y x1.8.
2. El colapso no es barato aunque haya pocos Nodos visibles: con 50-100 Nodos y aristas densas tarda decenas de segundos con `considerModelOrder`. El grafo agregado es denso (12-13 aristas por Nodo) por mi generador aleatorio; un Modelo real tendra menos pares de Grupos conectados **[no medido]**.
3. Bundle: `elk.bundled.js` 1 609 707 B (469 661 B gzip); `elk-worker.min.js` 1 595 334 B (464 625 B gzip); `elk-api.js` 9 782 B (2 966 B gzip). En el shell via Web Worker se carga `elk-api` + worker; el core de render y el CLI no necesitan el bundle en el navegador (ADR 0004: geometria cacheada).
4. Memoria: sin `considerModelOrder` aprox 125 MB por 1k Nodos a 10k; con ella crece mas rapido que lineal. Un worker de navegador con 3.5 GB seria inviable; 1.3 GB es limite alto.
5. En Node el layout es sincrono y bloquea el hilo; en el navegador el Web Worker evita bloquear la UI, pero no acorta el tiempo **[worker no medido en navegador]**.

## Umbral de aceptacion propuesto

Por defecto, build en CLI (geometria cacheada, ADR 0004) vs relayout interactivo en el shell:

| Escenario | Tamano | Umbral |
|---|---|---|
| Build CLI, layout completo de una Vista | hasta 10k Nodos | menos de 60 s y menos de 2 GB RSS |
| Relayout interactivo por colapso (shell, worker) | hasta 1k Nodos visibles/expandidos | menos de 2 s |
| Relayout interactivo por colapso | 5k Nodos del Modelo, Grupos cerrados | menos de 3 s |
| Bundle del shell (elkjs worker + api) | n/a | menos de 500 KB gzip |

Resultado contra el umbral: sin `considerModelOrder` todo se cumple excepto 10k de colapso (no medido); con `NODES_AND_EDGES` falla en 5k y 10k (build y colapso). Un 10k de Nodos totalmente expandidos en el shell excede 2 s de sobra; la regla practica es que el shell no expanda mas de ~1k Nodos a la vez y el resto vaya colapsado o cacheado.

## Impacto sobre decisiones del ADR 0004

- `considerModelOrder` para estabilidad: la medicion lo contraindica con `NODES_AND_EDGES`. Pendiente probar `PREFER_EDGES`/`PREFER_NODES` y `semiInteractive` **[no medido]**, y medir cuanta estabilidad de coordenadas da cada opcion (la doc dice que solo preserva orden, no coordenadas).
- Estabilidad real del drill-down: el ADR ya propone compensacion de camara; con layout rapido y sin orden de modelo, esa compensacion pasa a ser la unica garantia visual.
- `INCLUDE_CHILDREN` solo (sin `considerModelOrder`) es viable hasta 10k en build.

## Idea: aviso de Pins solapados en `validate`

El ADR dice que el solape entre Pins es responsabilidad del autor y que `validate` puede avisar. Propuesta, no medida:

- Entrada: Pins de una Vista como rectangulos (posicion relativa al Grupo padre + tamano del Nodo). El Pin es posicion del Nodo; el tamano sale de la medicion de render, que `validate` (nucleo puro, sin I/O) no tiene. Opciones: (a) avisar solo con tamano declarado/por defecto del Tipo de diagrama; (b) avisar en el CLI tras el layout, donde ya hay tamanos.
- Solo comparar Pins hermanos (mismo Grupo padre) entre si, y Pins contra Nodos no pineados solo tras el layout, porque dependen de ELK.
- Algoritmo: barrido por eje (sweep line) o rejilla espacial; coste O(n log n), irrelevante frente a ELK incluso con miles de Pins.
- Severidad: advertencia, no error (el ADR deja el solape al autor).

## Preguntas abiertas

1. Medir `PREFER_EDGES`, `PREFER_NODES` y `semiInteractive` (tiempo y estabilidad).
2. Repetir con un Modelo real (un proyecto externo como caso de uso) y con varias corridas; mediana y dispersion.
3. Medir en navegador con Web Worker (tiempo, memoria del worker, transferencia del grafo).
4. Medir colapso a 10k sin `considerModelOrder`, y colapso por niveles distintos (no solo nivel 1).
5. Costo de re-enrutar solo aristas de Nodos pineados tras el layout (ADR) **[no medido]**.
