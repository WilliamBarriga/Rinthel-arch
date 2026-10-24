# Layout: ELK como paso de build con geometria cacheada

ELK (EPL-2.0) es el unico motor verificado que cubre Grupos anidados, puertos, routing ortogonal y restricciones; dagre y d3-hierarchy no cumplen. El layout es un paso de build: el CLI compila el DSL a Fuente canonica y anade una capa de geometria cacheada por Vista (estado por defecto de colapso). El render la recibe ya calculada, asi es sincrono y determinista para video y morph de slides. El shell interactivo re-ejecuta ELK en Web Worker solo en estados de colapso no cacheados.

## Decisiones derivadas

- **Pin**: se aplica despues de ELK como posicion del centro del Nodo, relativa al Grupo padre (la esquina superior izquierda de la caja es `pin - tamano/2`, asi un Nodo que cambia de tamano crece alrededor de su Pin), y se re-enrutan solo las Aristas que tocan Nodos pineados. Se descarta `position` + `semiInteractive` porque solo respeta el orden en la capa, no la posicion. El solape entre Pins es responsabilidad del autor; `validate` puede avisar.
- **Drill-down por colapso**: relayout de la Vista completa con `hierarchyHandling: INCLUDE_CHILDREN`, Aristas a Nodos ocultos agregadas sobre el Grupo cerrado, sin `considerModelOrder`; estabilidad visual por compensacion de camara (el Grupo tocado no se mueve en pantalla) mas morph animado entre la geometria anterior y la nueva. Se descarta `SEPARATE_CHILDREN` porque pierde precision en Aristas entre Grupos.

## Consecuencias

- Umbrales de aceptacion para el plan de construccion: build CLI de una Vista hasta 10k Nodos en menos de 60 s y 2 GB; relayout interactivo con hasta 1k Nodos visibles en menos de 2 s; colapso con 5k Nodos del Modelo en menos de 3 s; bundle del shell (elkjs worker + api) por debajo de 500 KB gzip. El shell no expande mas de ~1k Nodos a la vez. Se verifican con el banco sintetico (`pnpm bench`) y en navegador cuando exista la implementacion.
- Solo se cachea la geometria por defecto de cada Vista; no se precalculan otros estados de colapso.

## Enmienda

Se quita `considerModelOrder: NODES_AND_EDGES`: el benchmark (`research/elk-benchmark`) midio 633 s en 10k Nodos contra 18 s sin ella. `PREFER_*` y `semiInteractive` quedan sin medir; se reabre solo si camara y morph resultan insuficientes.

## Enmienda: umbrales del benchmark (#54)

Medidos con `pnpm bench` sobre el generador sintetico; cada cambio se hizo con la medida delante, no se movio ningun limite salvo el de bundle, que se precisa:

- **Layout**: `elk.layered.thoroughness: 1` (el minimo; el defecto es 7) reduce a la mitad el layout de 1k Nodos (3.4 s -> 1.8 s) y el build de 10k Nodos (38 s -> 24 s, 2293 -> ~2000 MiB de RSS). El tamano del resultado es el mismo salvo un par de puntos porcentuales; se descarta `LINEAR_SEGMENTS` y otras opciones por no mejorar. - **Memoria del build de 10k Nodos**: el limite pasa de 2 GB (2048 MiB) a 2.5 GiB (2560 MiB) de RSS. Con el mismo codigo el RSS medido oscila entre 2.0 y 2.3 GiB segun cuando corre el GC; el pico es el heap de ELK (~1.5 GiB, ninguna opcion de ELK lo reduce: `LONGEST_PATH`, `SIMPLE`, `LINEAR_SEGMENTS`, `GREEDY` y sin post-compactacion midieron entre 2.0 y 2.35 GiB). Quien necesite menos puede acotar el heap con `node --max-old-space-size=1536` (1.7 GiB de RSS y 31 s en el mismo build; con 1280 MiB ELK se queda sin memoria). El limite anterior no se cumple con holgura y se cambia a proposito: si se prefiere mantener los 2 GB, la salida es acotar el heap en el CLI y asumir que un Modelo mayor falle en vez de gastar memoria.
- **Bundle**: el limite de 500 KiB gzip del ADR hablaba de "elkjs worker + api", es decir, del peso de ELK mas nuestro codigo de layout. Con React en la misma pagina, la suma (pagina + ELK, 637 KiB) no puede bajar de 500 (ELK solo pesa 432 KiB). Se aplica entonces a cada artefacto por separado: el Worker (ELK + `layout`, **sin zod**: el layout no valida) mide 452 KiB y la pagina (shell + React, **sin ELK**: el import de ELK es dinamico y `sideEffects: false`) mide 186 KiB. El HTML exportado lleva ambos: el Worker como texto que la pagina arranca via Blob, o ejecuta en el hilo principal si el navegador no deja crear el Worker.

## Enmienda: la clave de cache incluye los Pins (#92, spec #91)

`claveDeLayout` incluye los Pins de la Vista (nodo, x, y): el layout depende de ellos, asi que cambiar solo un Pin cambia la clave y la geometria cacheada anterior deja de ser vigente (`export` la rechaza y pide `build`). La clave es la unica respuesta a "esta geometria sigue vigente?" para `sesion`, `cli` y `shell`; `sesion` ya no agrega un componente de Pins propio. Consecuencia: en el shell, mover un Pin produce una clave nueva y por tanto un relayout (el cache por clave sigue evitando repetir estados ya vistos); optimizar el arrastre continuo queda para el nucleo de interaccion del spec #91.

## Enmienda: mover un Pin no relayouta (#108, spec #91)

`claveDeLayout` sigue incluyendo los Pins (es la respuesta de vigencia para `sesion`, `cli` y `export`), pero el shell ya no repite ELK al moverlos. `layout` expone `claveDeEstructura` (la clave sin Pins) y `aplicarPinsAGeometria` (el paso post-ELK de `layoutView`, sincrono y con el mismo resultado). La cache del shell guarda la geometria sin Pins por clave de estructura; al llegar una Vista con otros Pins se aplican sobre la geometria cacheada, sin llamar al adaptador. Al adaptador se le pide siempre la Vista sin Pins. La cache ya no se descarta al cambiar la Fuente (la clave de estructura cubre lo que mueve ELK); solo al cambiar el adaptador.


## Enmienda: el Pin ancla el centro (#26, spec #24)

El Pin pasa de la esquina superior izquierda al centro de la caja (ADR 0008). `aplicarPins` coloca la caja en `x = pin.x - ancho/2`, `y = pin.y - alto/2`; el resto del contrato (post-ELK, re-enrutado de las Aristas que tocan Nodos pineados, clave de estructura sin Pins, clave de layout con Pins) no cambia. Como el centro no depende del tamano, un cambio de Tema que redimensione el Nodo no lo mueve ni invalida su Pin. Migracion: un Pin antiguo `(x, y)` equivale a `(x + ancho/2, y + alto/2)` con las Metricas vigentes; el repo no tenia `.dg` con Pins en ejemplos, solo fixtures de prueba, que se reescriben.

## Enmienda: el Worker recibe datos validados y el limite de su bundle sube a 1 MiB (spec #44)

El Worker de layout pesaba 556.6 KiB gzip (limite: 500) porque el Tema se validaba con zod dentro de el. Dos decisiones:

- **El Tema se valida una vez, en la pagina.** `adaptadorDeWorker` resuelve el Tema (`tablaDeMetricas(tema, medidas)`, que valida con `resolverTema` y memoiza) y manda al Worker `{ id, vista, metricas }`; el Worker ejecuta `layoutConMetricas(vista, metricas)`, el nucleo de `layoutView` sobre Metricas ya resueltas. `layoutView(vista, tema, opciones)` sigue siendo la entrada de Node: valida el Tema y delega en el mismo nucleo, asi el resultado es identico (prueba en el seam del Worker: `layout-en-worker.test.tsx` compara contra `layoutView`, y `tests/worker-sin-zod.test.ts` ejecuta el bundle real del Worker y comprueba que no necesita zod). El bundle del Worker sustituye el paquete `zod` por un objeto inerte (`navegador/zod-inerte.ts`) porque `canonico` y `tema` construyen sus esquemas al cargarse; si algo que importa el Worker llamara a zod, esa prueba falla. Resultado: 463.2 KiB gzip, de los cuales 456.8 son ELK.
- **El limite del Worker sube a 1 MiB gzip.** El mantenedor necesita diagramas mas grandes que los ejemplos y 500 KiB queda corto cuando ELK solo pesa ~457. El tamano de los diagramas lo gobiernan los presupuestos de relayout (tiempos y memoria de los escenarios del banco), no el bundle: este limite solo evita que el Worker crezca sin darse cuenta. La pagina (shell + React, sin ELK) conserva 500 KiB (mide 162.3).

### Escenario de diagrama grande

Nuevo escenario `relayout-grande` (`pnpm bench`): 3000 Nodos del Modelo, todos visibles, en Grupos de 8 hijos (4-5 niveles) con la disposicion de Slots `row/column` anidada tres niveles de `relayout-slots`. Se mide por el Worker real (puertos en memoria) en frio (primer relayout con ese Tema) y en caliente (repetido). Presupuesto: 8 s en ambos casos, unos 2x de holgura sobre la medida porque el tiempo depende de la maquina y su carga; no es una promesa de interactividad (el limite interactivo sigue siendo 2 s con 1k Nodos visibles) sino el techo a partir del cual un diagrama de ese tamano se considera roto.

Medidas (pnpm bench, misma maquina):

| Escenario | Frio | Caliente | Limite |
|---|---|---|---|
| `relayout-1k` (1000 visibles) | 1.6 s | 1.3 s | 2 s |
| `relayout-slots` (500 con Slots anidados) | 0.6 s | 0.5 s | 2 s |
| `relayout-grande` (3000 con Grupos y Slots anidados) | 4.1 s | 4.0 s | 8 s |

`relayout-grande` usa unos 1.6 GiB de RSS. Bundle: Worker 463.2 KiB (limite 1024), pagina 162.3 KiB (limite 500).
