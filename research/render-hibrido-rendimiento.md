# Research: rendimiento del render hibrido (HTML/CSS + SVG) con miles de Nodos (issue #8)

Fecha: 2026-10-23. Fuentes primarias (MDN, specs W3C, web.dev, Chrome for Developers); donde no hay primaria se dice. Lo no verificado o sin cifra publica se marca **[no verificado]**. No repite `research/render-stack` ni el ADR 0002 (nucleo SVG propio, colapso por Vista); aporta cifras y tecnicas para decidir limites y estrategia de colapso.

## Pregunta
Con Nodos como HTML/CSS y Aristas en una capa SVG con pan/zoom: que limites hay con miles de Nodos y Aristas, que tecnicas funcionan (culling por viewport, `will-change`, capas, `contain`, `transform` vs `zoom` CSS) y cuanto cuestan los efectos CSS (`backdrop-filter`, `filter`, `box-shadow`, blend).

## Resumen

1. **No existe un limite oficial de nodos.** Ningun fabricante publica un techo. Las referencias numericas son umbrales de DOM de Lighthouse (aviso a 800 nodos, excesivo sobre 1.400), pensados para paginas y no para visores de diagramas, y casos de terceros (JointJS: 100.000 celdas con culling virtual; Felt: abandono de SVG/React por canvas). Los limites del proyecto deben fijarse con benchmark propio (seccion final).
2. **Pan/zoom barato = un solo `transform` sobre un contenedor**, no `zoom` CSS ni cambiar tamanos por Nodo. `transform` no recalcula layout; `zoom` si.
3. **El costo dominante con miles de Nodos es el trabajo de React/DOM por cada paso de pan/zoom y el numero de elementos pintados**, no el transform en si. Lo que escala: no dibujar lo que no se ve (colapso + culling), aislar subarboles (`contain`) y sacar React del camino caliente del gesto.
4. **Efectos que necesitan textura intermedia (`filter`, `backdrop-filter`, blend, opacidad de grupo) y `will-change` indiscriminado** consumen GPU y memoria; se reservan para pocos elementos y se evitan en el estilo base del Nodo.
5. **Colapso como estrategia primaria de escala**: lo no dibujado no cuesta layout, paint ni memoria; el culling por viewport es complemento.

## 1. Limites de tamano: que cifras hay

- Lighthouse avisa por encima de 800 nodos DOM y considera excesivo >1.400; un ejemplo extremo reporta un unico recalculo de estilos sobre 2.547 elementos. Insertar, borrar o cambiar DOM puede disparar "very costly layout, styling, compositing, and paint work". Son umbrales de pagina, no techos duros, y miden carga/interactividad (INP), no fps de transform. https://web.dev/articles/dom-size-and-interactivity
- Un Nodo HTML con contenido rico suele ser varias decenas de elementos DOM, asi que 1.000 Nodos superan esos umbrales con holgura (estimacion propia).
- JointJS (motor de diagramas SVG), elementos SVG contados vs comportamiento de frames en Chrome DevTools: 647 y 1.156 sin problemas; ~6.000 y ~11.000 fluido con algun frame parcial o descartado; 100.000 elementos (50.000 tarjetas y enlaces) "fluido" con varios frames parciales y algunos descartados, **usando virtual rendering (solo celdas visibles) y viewport matching**. Cambia a canvas con zoom muy alejado para evitar el lag de SVG con miles de elementos visibles. No publica fps/ms ni hardware (resultado cualitativo, de proveedor). https://www.jointjs.com/blog/jointjs-performance-overview-testing-diagrams-with-100-000-nodes
- Felt (mapas) migro de SVG/React a canvas: en pan/zoom React debia crear, comparar y actualizar miles de elementos por movimiento; su atajo (redibujar al asentarse el viewport y escalar lo existente mientras) daba texto borroso y parpadeo; el navegador agrupaba pines en capas que se redibujaban en cada zoom. Select All en pines: ~100 ms en canvas vs 4.000-6.000 ms en DOM. Evidencia de un tercero (blog de empresa), caso de mapas con pines, no de diagramas con texto rico. https://felt.com/blog/from-svg-to-canvas-part-1-making-felt-faster
- Comparativas genericas SVG vs canvas son antiguas y contradictorias (un poster academico de 2018 los halla casi iguales). **No se usan como cifra**; solo como senal de que el redibujo completo por frame favorece canvas y la modificacion incremental favorece DOM/SVG. https://mt.inf.tu-dresden.de/cnt/uploads/Horak-2018-Graph-Performance-Poster.pdf

Implicacion: miles de Nodos con detalle completo a la vez es territorio donde hasta SVG especializado recurre a culling virtual y a un modo canvas de baja fidelidad. El equivalente aqui es colapso + Vista resumen (ya apuntado en el ADR 0002).

## 2. `transform` vs `zoom` CSS para pan/zoom

- Con `transform: scale()`, MDN: "will not cause layout recalculation or move other elements". `zoom` "scales the targeted element, which can affect the page layout" (los vecinos se reubican). `zoom` es Baseline 2024 (desde mayo 2024), definido en el borrador CSS Viewport Module Level 1, con implementacion parcial posible. https://developer.mozilla.org/en-US/docs/Web/CSS/zoom
- Solo `transform` y `opacity` se pueden animar sin layout ni paint, siempre que el elemento este en su propia capa compositora. https://web.dev/articles/stick-to-compositor-only-properties-and-manage-layer-count
- Chromium (RenderingNG) separa el arbol de propiedades de transform del de efectos (opacity, filtros, mascaras, blend), lo que permite mover capas sin re-rasterizar. https://developer.chrome.com/docs/chromium/renderingng-data-structures
- MDN (Canvas): escalar con CSS transform es mas rapido (GPU) que redimensionar el canvas. https://developer.mozilla.org/en-US/docs/Web/API/Canvas_API/Tutorial/Optimizing_canvas
- Derivado: un unico contenedor con `transform: translate() scale()` y `transform-origin: 0 0`, compartido por la capa HTML de Nodos y la capa SVG de Aristas (mismo sistema de coordenadas, sin desincronia). Prohibido `zoom` CSS o `width/height/left/top` por Nodo para el gesto.

### Nitidez al hacer zoom (`will-change: transform`)
- Desde Chrome 53 el contenido se re-rasteriza cuando cambia la escala del transform, salvo que tenga `will-change: transform`: queda como bitmap fijo que no se redibuja durante las actualizaciones (rapido, pero blando al ampliar). Aplica a escalas cambiadas por script, no a animaciones CSS/Web Animations. https://developer.chrome.com/blog/re-rastering-composite
- Receta del mismo articulo: poner `will-change: transform` al empezar el gesto y quitarlo al terminar (re-rasteriza nitido en el siguiente frame); anadirlo y quitarlo puede tener "a large one-time performance cost"; para forzar re-raster en medio, quitarlo y reponerlo en un `requestAnimationFrame`; si se quita la capa puede perderse (evitar con `translateZ(0)`). El articulo es antiguo; **[no verificado]** que el comportamiento sea identico hoy.
- Diseno: durante el gesto, texto algo blando es el precio de 60 fps; al soltar, re-rasterizar.

## 3. Aislamiento y culling

### `contain`
- `contain: layout paint style` (= `content`) aisla un subarbol: cambios internos no fuerzan recalculo del resto y con `paint` "if the containing box is offscreen, the browser does not need to paint its contained elements". `size` exige tamano explicito. https://developer.mozilla.org/en-US/docs/Web/CSS/contain
- Efectos secundarios (MDN y spec): `layout` y `paint` crean contenedor para `position: absolute/fixed`, un stacking context y un contexto de formato de bloque; `paint` recorta el desbordamiento (sombras, badges y puertos fuera del borde del Nodo se cortarian). https://www.w3.org/TR/css-contain-2/
- La spec dice que la contencion "enables heavy optimizations by user agents when used well"; las subsecciones de optimizacion son no normativas. No hay cifra publica de ganancia de `contain` solo. **[no verificado]**
- Para Nodos: `contain: layout style` es seguro; `paint` solo si los puertos se dibujan dentro del Nodo o en otra capa.

### `content-visibility: auto`
- Activa contencion de layout, style y paint y, si el elemento no es "relevante" (fuera del viewport mas un margen que la spec sugiere de 50%, sin foco, seleccion ni top layer), omite su contenido, con size containment. A diferencia de `hidden`, sigue disponible para busqueda, foco y seleccion. Baseline 2024. https://www.w3.org/TR/css-contain-2/ y https://developer.mozilla.org/en-US/docs/Web/CSS/content-visibility
- Cifras del autor del articulo (demo propia, no garantizadas): render inicial de 232 ms a 30 ms (7x); esperable "reduction of 50% or more". Facebook: hasta 250 ms menos al volver a vistas cacheadas (con `hidden`). https://web.dev/articles/content-visibility
- Requiere `contain-intrinsic-size` (p. ej. `auto 120px`): sin el, el elemento omitido mide 0 y la barra de scroll salta; `auto` recuerda el ultimo tamano renderizado. Mismo articulo. Los Nodos tienen tamano conocido (ya medido por el layout, ADR 0003), asi que el tamano intrinseco exacto es trivial.
- Esta pensado para scroll en flujo de documento. Como decide la relevancia con un ancestro con `transform` grande (pan/zoom) y con Nodos `position: absolute`: **[no verificado]**, requiere prueba. Llamar APIs que fuerzan layout (p. ej. `getBoundingClientRect`) sobre subarboles omitidos anula la ganancia; el contenido omitido sigue en el arbol de accesibilidad.

### Culling propio en el shell
- Ya decidido en el ADR 0002: filtrado por viewport en el shell + colapso. Referente: JointJS (solo celdas visibles). Costo a medir: calculo de visibilidad (indice espacial o rejilla) y montaje/desmontaje de React al cruzar el borde. **[no verificado]** cifra.
- React Flow documenta que `onlyRenderVisibleElements` agrega overhead de computo (ver render-stack): conviene calcular al asentarse el gesto o por intervalos, no en cada frame.

## 4. Capas y `will-change`

- Cada capa compositora "requires memory and management, and that's not free": sus texturas se suben a la GPU (ancho de banda CPU-GPU, memoria de texturas limitada); "layer explosion" es promover todo. Objetivo orientativo de compositing de "around 4-5ms"; **no hay limite de capas publicado**. https://web.dev/articles/stick-to-compositor-only-properties-and-manage-layer-count
- Chromium fusiona por defecto los chunks de paint en una capa, salvo donde el estado cambiara en el hilo compositor (scroll, animaciones de transform); una capa por chunk "would quickly exhaust GPU memory". https://developer.chrome.com/docs/chromium/renderingng-data-structures
- MDN `will-change`: "last resort"; "Excessive use ... will result in excessive memory use"; no aplicarlo a contenedores grandes ni dejarlo en hojas de estilo; crea el stacking context por adelantado. https://developer.mozilla.org/en-US/docs/Web/CSS/will-change
- Regla derivada: `will-change: transform` en **un** contenedor (el lienzo) y solo durante el gesto; nunca por Nodo ni por Arista. El costo de memoria de una capa unica enorme (tamano de tiles, limites de textura) no se confirmo en fuente primaria: **[no verificado]**; el culling reduce lo que hay dentro.
- Separacion util: capa de Nodos HTML y capa de Aristas SVG con el mismo transform, y capa de overlay (seleccion, guias) aparte.

## 5. Costo de efectos CSS

Las fuentes primarias dan mecanismo, casi nunca cifras.

- Filtros y blend avanzados "require that two or more quads are drawn to an intermediate texture"; pasadas secuenciales en GPU frente a una sola. Sin cuantificar. https://developer.chrome.com/docs/chromium/renderingng-data-structures
- `opacity` < 1, `filter`, `mask`, `clip-path`, `mix-blend-mode`, `backdrop-filter` y `will-change` de esas propiedades convierten el elemento en **backdrop root**: un `backdrop-filter` hijo solo ve lo pintado dentro de ese ancestro. Con `opacity` o `will-change: opacity` en el contenedor del lienzo, el desenfoque de fondo dejaria de ver el resto del diagrama. https://developer.mozilla.org/en-US/docs/Web/CSS/backdrop-filter
- `backdrop-filter`: MDN no da cifra de costo. Por mecanismo (lee lo pintado detras, textura intermedia, el fondo cambia con cada frame de pan) es el mas caro; magnitud por elemento **[no verificado]**. Recomendacion: no usarlo en Nodos base.
- `box-shadow`: MDN solo indica que el algoritmo de desenfoque no esta especificado exactamente y que no afecta al modelo de caja; **sin cifra primaria de costo**. La guia de React Flow (render-stack) ya cita sombras y gradientes entre el CSS a simplificar; MDN Canvas recomienda evitar `shadowBlur`. Una sombra estatica rasterizada una vez en una capa que solo se mueve es barata en el gesto; el costo aparece cuando se repinta. Costo relativo **[no verificado]**.
- `filter` (blur, drop-shadow) en HTML o en SVG sobre muchas Aristas: multiplica pasadas; magnitud **[no verificado]**.
- Regla web.dev: solo `transform` y `opacity` son baratos de animar; lo demas fuerza layout o paint.
- Presupuesto sugerido (a validar): Nodo base con borde, fondo solido y, como mucho, sombra estatica; vidrio/desenfoque/blend solo en elementos unicos (seleccion, paneles) o en export; el Tema (ADR 0002) podria declarar un nivel de efectos que el shell degrade con muchos Nodos visibles.

## 6. Costo de DOM y React por gesto

- Cada paso de pan/zoom no debe pasar por React: aplicar el transform al contenedor por ref (`style.transform`, como hace d3-zoom, agnostico del DOM segun render-stack) y re-renderizar solo al asentarse (culling, nivel de detalle). Felt documenta lo contrario como causa de su lentitud.
- Un recalculo de estilos que afecta miles de elementos es el patron costoso (dom-size-and-interactivity). Cambiar una clase en un ancestro comun (p. ej. `.zoomed-out`) para degradar detalle fuerza recalculo del subarbol; `contain` y selectores acotados ayudan, magnitud **[no verificado]**.
- Herramienta de medicion: Chrome DevTools, Performance y pestana Layers (capas y por que se crearon). https://web.dev/articles/stick-to-compositor-only-properties-and-manage-layer-count

## 7. Nivel de detalle (LOD)

- Evidencia convergente: JointJS cambia a canvas al alejar; Felt simplifica geometria con poco zoom (rutas de ~37 a 60 FPS). Para este proyecto: bajo cierto zoom no dibujar texto ni sombras (Nodos como rectangulos SVG simples) sin cambiar geometria ni relayout. Compatible con el ADR 0002 porque solo cambia lo dibujado. Umbrales de zoom: a decidir con benchmark.

## 8. Conclusiones (inputs, no decision)

1. **Presupuesto por Vista visible, no por Modelo.** Anclas citables: pagina normal <1.400 nodos DOM; SVG de motor de diagramas fluido hasta ~11.000 elementos visibles y 100.000 con culling virtual (JointJS, cualitativo). Con Nodos HTML de decenas de elementos, un punto de partida prudente seria del orden de 300-500 Nodos HTML con detalle completo visibles a la vez (**estimacion propia, a validar**).
2. **El colapso por Vista (ADR 0002) es la palanca principal;** culling por viewport y LOD son secundarias y se miden aparte.
3. **Arquitectura de gesto:** un contenedor, un `transform`, `will-change` solo durante el gesto, re-raster al soltar, React fuera del camino caliente.
4. **Aislar cada Nodo** con `contain: layout style` y evaluar `content-visibility: auto` con `contain-intrinsic-size` exacto, probando su interaccion con el transform del lienzo.
5. **Efectos:** nivel de efectos en el Tema; `backdrop-filter`, `filter` y blend fuera del Nodo base; cuidado con `opacity` en el contenedor (backdrop root).
6. **La evidencia primaria no justifica abandonar el modelo hibrido por canvas.** Canvas gana en redibujo completo masivo (Felt) pero pierde nodos React y fidelidad de export (render-stack). Queda como modo opcional de vista general.

## Pendiente: benchmark propio

No hay cifras oficiales. Medir en el prototipo, en Chrome y tambien Firefox y Safari 18+ (soporte de `content-visibility`):
- Matriz: 500 / 1.000 / 2.000 / 5.000 Nodos HTML; Aristas SVG a 1x y 3x los Nodos; pan y zoom continuos; fps y tiempo de frame (DevTools Performance) y numero de capas (Layers).
- Variantes: con y sin `contain`; con y sin `content-visibility: auto`; con y sin culling; `will-change` en el contenedor vs ausente; sombras, filtros y `backdrop-filter` en todos los Nodos vs ninguno.
- Medir memoria de GPU y nitidez tras el zoom (re-raster).
- Con los datos, fijar el presupuesto de Nodos visibles y los umbrales de LOD.
