# Research: personalizacion visual en sistemas de diagramas similares (issue #16)

Fecha: 2026-10-23. Mapa #7 (Sistema de Temas expresivo). Fuentes primarias (docs oficiales, specs, codigo de repos). Lo no verificado o sin fuente primaria se marca **[no verificado]**. Los resumenes de la herramienta de fetch pueden omitir contenido; cuando una pagina "no menciona" algo se dice asi y no se afirma que no exista. No repite `research/render-stack`, `research/dsl-landscape` ni `research/render-hibrido-rendimiento` (que ya cubren stack, DSL y costos de efectos CSS).

## Pregunta
Existe en sistemas comparables un nivel de personalizacion visual como el del prototipo (Temas declarativos de Capas sobre un catalogo cerrado de Primitivas, parches por Tipo de nodo y estado)? Si no, hay razones publicadas? Que riesgos y lecciones aplican?

## Resumen corto

1. **Dentro de los diagramas como codigo y de arquitectura: no hallamos nada comparable.** Lo mas expresivo que encontramos ofrece, por elemento, un conjunto plano de propiedades de estilo (color, borde, sombra booleana, "3d", "multiple", patron de relleno) mas un unico interruptor global de "mano alzada". Ninguno modela el elemento como pila de Capas con nombre, ni permite parchear una Capa por Tipo y estado, ni ofrece vidrio, varias sombras, glow o giro determinista como datos. La ausencia es de lo que hallamos en docs; no se puede probar un negativo universal.
2. **Si hay precedentes de la forma del modelo fuera de diagramas**: Mapbox/MapLibre Style Spec (pila ordenada de capas con tipo, filtro y propiedades paint), Cytoscape.js (hoja de estilos declarativa por selector, con estado y clases, y propiedades como gradiente, pie y stripe), draw.io (cadena de estilo con `glass`, `gradientColor`, `shadow`, `sketch`), Figma Variables, Design Tokens (W3C CG), temas de VS Code y CSS Zen Garden (mismo contenido, muchos estilos).
3. **Razones publicadas del limite**: sobre todo de diseno de producto y de portabilidad, no de rendimiento. Estan documentadas: notacion deliberadamente constrenida (Structurizr, C4), paleta curada (Excalidraw), estilos que no se portan a otros exportadores (Structurizr), `foreignObject` que rompe SVG en otros visores (Mermaid, draw.io), `skinparam` abandonado por incoherencia entre tipos de diagrama (PlantUML), aleatoriedad de la mano alzada (Mermaid, Rough.js, Excalidraw). No encontramos un post de mantenedor que diga "limitamos la personalizacion por X"; las razones se infieren de docs y issues.
4. **Lecciones**: catalogo cerrado con validacion; determinismo (semilla) para mano alzada; plan de exportacion SVG/PNG por Primitiva; legibilidad/contraste como invariante del Tema, no del autor; Paleta con nombres y modificadores; evitar el parche por cadena libre. Detalle en la seccion 5.

## 1. Que ofrece cada sistema

Leyenda: Decl = declarativo (datos/DSL), Cod = requiere codigo.

| Sistema | Decl / Cod | Granularidad | Efectos y limites verificados |
|---|---|---|---|
| Structurizr | Decl (DSL/JSON) | Estilo por **tag**, en cascada por orden; Temas = JSON de estilos por tag, compartibles por URL | 16 formas, iconos, colores, borde solido/discontinuo/punteado, opacidad 0-100, trazo 1-10; relaciones con grosor, color, estilo, ruteo. Notacion "deliberadamente simple y constrenida"; sin estados. https://docs.structurizr.com/ui/diagrams/notation , https://docs.structurizr.com/ui/diagrams/themes |
| IcePanel | UI (sin DSL) | **[no verificado]** personalizacion de objetos | La doc consultada solo muestra tema de UI claro/oscuro. https://docs.icepanel.io/other-information/ui-theme.md . No se encontro pagina de estilos de objeto en el indice (https://docs.icepanel.io/llms.txt). |
| D2 / Terrastruct | Decl (DSL) | Por elemento/conexion, mas **tema** global (+ `theme-overrides`) | Palabras de estilo: opacity, stroke, fill, `fill-pattern` (dots/lines/grain), stroke-width 1-15, stroke-dash, border-radius 0-20, `shadow`, `3d`, `multiple`, `double-border`, `font: mono` (unica opcion), font-size 8-100, `animated`, text-transform. A nivel raiz solo algunas. https://d2lang.com/tour/style/ . Temas: algunos cambian mas que colores (el tema Terminal fija mayusculas, sin radio, monoespaciada, patron de puntos en contenedores, doble borde). Overrides solo reemplazan codigos de color. https://d2lang.com/tour/themes/ . Modo sketch via `--sketch`, implementado con RoughJS. https://d2lang.com/tour/sketch/ , https://d2lang.com/blog/hand-drawn-diagrams/ |
| Mermaid | Decl (frontmatter/config) | Tema global o por diagrama; `classDef`/`style`/`linkStyle` por nodo; sin estados | 11 temas; **solo el tema `base` admite `themeVariables`**; variables derivadas entre si "para asegurar legibilidad"; solo colores hex. https://mermaid.js.org/config/theming.html . `look`: `classic`, `neo`, `handDrawn` (esta ultima aparece solo en ejemplos); `handDrawnSeed` para fijar semilla. https://mermaid.js.org/config/schema-docs/config-properties-handdrawnseed.html . CSS externo sobre nodos "no funciona de forma fiable" y se sobrescribe; la via recomendada es `classDef`. https://mermaid.js.org/syntax/flowchart.html |
| PlantUML | Decl | `skinparam` por tipo de elemento y estereotipo; nuevo sistema `style` tipo CSS | `shadowing`, `handwritten`, `roundcorner`, colores, fuentes, `monochrome`. https://plantuml.com/skinparam . `skinparam` "esta siendo retirado": cada tipo de diagrama tiene sus propios parametros y algunos elementos no admiten estereotipos; `style` usa selectores. https://plantuml.com/style-evolution . `!theme` carga archivos `.puml` de tema. https://plantuml.com/theme |
| LikeC4 | Decl (DSL) | Por **kind** (specification), por elemento, por vista; colores personalizables | 11 formas, colores nombrados + personalizados, size/padding/textSize, opacidad y borde (solo grupos), `multiple`, iconos con packs, `iconPosition`, estilo de relacion (color, linea, head/tail). La pagina no documenta tema. https://likec4.dev/dsl/styling/ |
| Ilograph | Decl (YAML) | Por recurso, relacion, perspectiva; herencia via `abstract`/`instanceOf` | color, backgroundColor, `style` de borde (default/plural/dashed/outline/flat), icon, iconStyle. **No tiene propiedad de tema**; solo claro/oscuro/auto con inversion de colores de flechas. https://www.ilograph.com/docs/spec/ |
| Eraser (diagram-as-code) | Decl | Diagrama, nodo o grupo | Tres propiedades de enumeracion cerrada: `colorMode` (pastel/bold/outline), `styleMode` (shadow/plain/watercolor), `typeface` (rough/clean/mono). https://docs.eraser.io/docs/styling . (Descartado como DSL en este proyecto; se cita solo como dato.) |
| draw.io | Decl (cadena `clave=valor;` por celda) | Por celda; muy amplia | `shadow`, `glass`, `gradientColor`/`gradientDirection`, `opacity`/`fillOpacity`/`strokeOpacity`; claves desconocidas se ignoran en silencio. https://www.drawio.com/doc/faq/drawio-style-reference . Es el modelo plano mas amplio; `sketch` no se confirmo en esta pasada **[no verificado]**. |
| Excalidraw | Datos por elemento, UI limitada | Por elemento | Uniones cerradas: `fillStyle` hachure/cross-hatch/solid/zigzag, `strokeStyle` solid/dashed/dotted; `roughness` numerico. https://github.com/excalidraw/excalidraw/blob/master/packages/element/src/types.ts . Paleta curada de 15 colores en 3 tonos (blog de contribuidor, secundaria): https://blog.websoft9.com/?p=2193 |
| tldraw | Cod (SDK, TypeScript) | StyleProps reutilizables por forma; Temas con paletas light/dark | Enumeraciones cerradas (`StyleProp.defineEnum`, ampliables en runtime); `TLTheme` con colores por variante (solid, semi, pattern, frame, note...), fuentes, tamano, trazo. Limites: colores propios deben existir en todos los temas y en ambos modos; fontSize/lineHeight/strokeWidth no varian por modo. https://tldraw.dev/sdk-features/styles , https://tldraw.dev/sdk-features/themes . Licencia: ver `research/render-stack`. |
| React Flow / xyflow | Cod (nodos y aristas son componentes React) | Total (cualquier solucion de CSS) | Variables CSS (`--xy-node-background-color-default`...), `colorMode`, clases `.react-flow__node`, Tailwind; no hay modelo de Tema propio. https://reactflow.dev/learn/customization/theming |
| Cytoscape.js | Decl (hoja de estilos JSON) | **Selector** (nodo, arista, clase, estado `:selected`...) | Forma, `shape-polygon-points`, gradientes `background-gradient-*`, borde, imagen de fondo, `pie-*`, `stripe-*`; la doc desaconseja estilos por elemento ("DO NOT USE THE `style` FIELD UNLESS ABSOLUTELY NECESSARY") y avisa que ignoran estado y clases. https://js.cytoscape.org/#style . underlay/overlay/shadow/ghost: **[no verificado]** en esta pasada. |
| Graphviz | Decl | Por nodo/arista/cluster | `style` admite `filled` en clusters (resto de valores **[no verificado]** con la pagina consultada). https://graphviz.org/docs/attrs/style/ |
| Miro / FigJam | UI | Por objeto | **[no verificado]**: no se consultaron sus docs; son pizarras con paletas y estilos fijos de UI, no sistemas declarativos. |

Observaciones transversales:
- **Ningun DSL de diagramas verificado separa "estructura del elemento" de "capas".** El patron dominante es propiedades planas + 1 tema global + 1 modo mano alzada.
- **El eje "estado" casi no existe.** Entre los verificados solo Cytoscape tiene selectores de estado (`:selected`) y React Flow permite CSS `:hover`. En los DSL de arquitectura el estilo es estatico.
- **El eje "por Tipo" si existe**: tags en Structurizr, kinds en LikeC4, selectores en Cytoscape, estereotipos en PlantUML, `classDef` en Mermaid. Es la parte del diseno propio con mas precedente.
- **Mano alzada se resuelve siempre con Rough.js**: D2 (https://d2lang.com/blog/hand-drawn-diagrams/), Mermaid (`handDrawn`; uso de Rough.js no confirmado en docs de Mermaid **[no verificado]**) y Excalidraw (`roughness`).
- **Temas "radicales" ya existen solo como paquete cerrado de la herramienta**: el tema Terminal de D2 es lo mas cercano al CRT del prototipo, pero se expresa como un conjunto de defaults internos, no como Capas editables.

## 2. Precedentes de modelo de capas/primitivas declarativo

| Precedente | Que aporta | Fuente |
|---|---|---|
| Mapbox / MapLibre Style Spec | Pila ordenada de **capas** con `id`, `type` (fill, line, symbol, circle, fill-extrusion...), `filter`, propiedades `paint` (baratas de cambiar) vs `layout` (caras), visibilidad por zoom. Es el precedente mas cercano a "pila de Capas sobre catalogo cerrado". Leccion: separar propiedades baratas de caras. | https://docs.mapbox.com/style-spec/reference/layers/ |
| Cytoscape.js stylesheet | Selector + estado + clases + propiedades compuestas (gradiente, pie, stripe); mapeo desde datos. | https://js.cytoscape.org/#style |
| draw.io style string | Catalogo plano pero amplio (glass, gradiente, sombra, opacidades por canal), tolerante a claves desconocidas. | https://www.drawio.com/doc/faq/drawio-style-reference |
| Design Tokens (W3C Design Tokens Community Group, borrador) | Tokens tipados (`$type` obligatorio, no se adivina por el valor), alias con `{grupo.token}`, grupos con `$extends`, tipos compuestos (border, shadow como objeto o array de sombras, transition). Estado: borrador, "no implementar". Encaja con Paleta nombrada y sombras multiples. | https://www.designtokens.org/tr/drafts/format/ |
| Figma Variables | Colecciones con **modos** (claro/oscuro), alias entre variables; tipos COLOR, FLOAT, STRING; los paints enlazados son solidos (gradientes: no mencionados). Leccion: modos como eje de la Paleta. | https://developers.figma.com/docs/plugins/working-with-variables/ |
| tldraw `TLTheme` | Tema = objeto con paletas por modo, variantes de color por contexto; extensible por augmentacion de tipos. | https://tldraw.dev/sdk-features/themes |
| VS Code color themes | Tema = archivo JSON que declara colores del workbench y tokens; contribucion en `package.json`. Catalogo de claves lo define el producto (la pagina consultada no lo afirma; **[no verificado]** como "catalogo cerrado"). | https://code.visualstudio.com/api/references/contribution-points#contributes.themes |
| CSS Zen Garden | Mismo HTML, "toda la apariencia solo con CSS e imagenes/fuentes": prueba historica de que un Modelo fijo admite apariencias radicalmente distintas. | https://www.csszengarden.com/pages/about/ |

Conclusion: la combinacion "Capas con nombre + parches por Tipo y estado + Paleta con modificadores + catalogo cerrado de Primitivas" no la vimos reunida en un solo sistema de diagramas, pero cada pieza tiene precedente: capas (Mapbox), selector+estado (Cytoscape), tokens/modos/alias (W3C DTCG, Figma), temas como archivos de datos (VS Code, Structurizr, tldraw, PlantUML).

## 3. Razones y opiniones publicadas

Se separan hechos de docs/issues de inferencia.

### 3.1 Notacion constrenida y consistencia
- Structurizr: "purposely uses a very simple and constrained notation consisting of boxes and unidirectional arrows"; los estilos aparecen en una clave automatica del diagrama. https://docs.structurizr.com/ui/diagrams/notation . Los Temas existen para "consistently style diagrams across workspaces". https://docs.structurizr.com/ui/diagrams/themes
- C4 (c4model.com): es "notation independent"; recomienda colores consistentes, avisa de impresion en blanco y negro y daltonismo, y exige una clave/leyenda para "shapes, colours, border styles, line types, arrow heads". https://c4model.com/diagrams/notation . Es guia de comunicacion, no una prohibicion de estilo.
- Excalidraw (secundaria, blog de contribuidor): "decidimos limitar la paleta a un conjunto curado de 15 colores"; la simplicidad es una cualidad. https://blog.websoft9.com/?p=2193 . Cita de segunda mano; **[no verificado]** en fuente primaria de Excalidraw.

### 3.2 Portabilidad y exportacion
- Structurizr: los estilos estan "disenados para el renderizador de Structurizr y pueden no estar plenamente soportados" por los exportadores PlantUML, Mermaid, etc. (resumen de busqueda de la pagina de notacion/temas; texto exacto **[no verificado]** palabra por palabra). https://docs.structurizr.com/ui/diagrams/themes
- draw.io usa `foreignObject` para etiquetas HTML complejas; editores como Inkscape/Illustrator no los renderizan ("Text is not SVG - cannot display"); la salida es "Convert Labels to SVG", que no soporta tablas, listas, enlaces ni fondos. https://www.drawio.com/docs/manual/export/svg-export-text-problems/
- Mermaid: SVG con `foreignObject` pierde texto en visores no navegador; hay un reporte de `mmdc` que muestra SVG sin etiquetas en Eog/Gthumb con librsvg 2.58.0 (sin respuesta de mantenedores en la pagina). https://gitlab.gnome.org/GNOME/librsvg/-/issues/1082 . Informes de que `htmlLabels: false` evita `foreignObject` provienen de un changelog de terceros y un issue antiguo de mermaid-cli: **[no verificado]** en fuente primaria.
- Relevancia directa: nuestro render hibrido pone Nodos en HTML/CSS. Todo lo que sea `backdrop-filter`, `mix-blend-mode` o `filter` solo existe como rasterizacion del DOM; ver `research/render-stack` (html-to-image fijado a 1.11.11). `backdrop-filter` afecta solo a lo pintado detras hasta el "backdrop root" y se rompe si un ancestro tiene `opacity < 1`, `filter`, `mask` o `will-change` equivalente. https://developer.mozilla.org/en-US/docs/Web/CSS/backdrop-filter . Baseline 2024.

### 3.3 Coherencia entre tipos de diagrama y deuda de mantenimiento
- PlantUML retira `skinparam` porque "cada tipo de diagrama tiene sus propios skinparams", de modo que lo declarado no se transfiere, y algunos elementos no admiten estereotipos. Se migra a un sistema `style` con selectores. https://plantuml.com/style-evolution . Es evidencia directa del coste de un catalogo de claves que crece sin estructura.
- Mermaid limita `themeVariables` al tema `base` y deriva variables "to ensure diagram readability"; solo acepta hex. https://mermaid.js.org/config/theming.html . Inferencia (no declarada): evitar combinaciones ilegibles y reducir superficie.
- Cytoscape desaconseja el estilo por elemento porque "ignora estado y clases" y no se serializa. https://js.cytoscape.org/#style . Respalda el diseno por Tema+parche frente a estilos sueltos en el Modelo.
- Mermaid: CSS externo sobre nodos "no funciona de forma fiable" y se sobrescribe; la via soportada es `classDef`. https://mermaid.js.org/syntax/flowchart.html . Leccion: una sola via oficial de estilo.
- Un caso ajeno pero ilustrativo (Volto PR #5581, resumen de busqueda): el mantenedor temia que exponer propiedades de estilo abra "una caja de Pandora" de CSS arbitrario. **[no verificado]** en la fuente original.

### 3.4 Legibilidad y mano alzada
- D2: los rellenos por defecto de RoughJS eran "demasiado estridentes para diagramar" y dificultaban leer el texto; enmascarar el texto se vio "demasiado agresivo"; la solucion fue una textura de vetas sutil con modo de mezcla segun el brillo del fondo. https://d2lang.com/blog/hand-drawn-diagrams/ . El articulo no habla de semilla, rendimiento ni peso.
- Mermaid: `handDrawnSeed` existe "para tests automatizados, que si no siempre encuentran diferencias"; por defecto 0 = semilla aleatoria. https://mermaid.js.org/config/schema-docs/config-properties-handdrawnseed.html
- Rough.js: la semilla (`seed`) permite "recrear la misma forma"; con 0 o sin definir no se fija; `roughness` por defecto 1 sin tope, `bowing` y `fillStyle` (hachure, solid, zigzag, cross-hatch, dots, dashed, zigzag-line). https://github.com/rough-stuff/rough/wiki
- Excalidraw: el trazo cambia al crear o redimensionar una forma porque el relleno consume un numero variable de llamadas aleatorias antes del trazo; el mantenedor de Rough.js dijo que reordenar es "algo delicado". Solo vimos un espejo del issue "Stable strokes for shapes": https://lightrun.com/answers/excalidraw-excalidraw-stable-strokes-for-shapes . Numero y estado **[no verificado]**.

### 3.5 Accesibilidad
- WCAG 2.2 SC 1.4.11 (AA): partes graficas necesarias para entender el contenido y componentes de UI deben tener contraste 3:1 con colores adyacentes. https://www.w3.org/WAI/WCAG22/Understanding/non-text-contrast.html . Aplica a bordes de Nodo, Aristas y estados (hover/colapsado) en Temas como vidrio (fondo translucido) o neon.
- C4: no depender solo del color (ver 3.1).
- No encontramos posts de mantenedores de diagramas que citen accesibilidad como razon para limitar temas. **[no verificado]** que no existan.

### 3.6 Rendimiento
- Ninguna fuente de herramientas de diagramas atribuye el limite de personalizacion al rendimiento. Los costos de `filter`, `backdrop-filter` y `will-change` ya estan en `research/render-hibrido-rendimiento`. Mapbox si distingue propiedades "paint" baratas de "layout" caras. https://docs.mapbox.com/style-spec/reference/layers/

### 3.7 Lo que no se hallo
- No hay un post o issue de mantenedores (Mermaid, D2, Excalidraw, tldraw, Structurizr, LikeC4) que explique de forma explicita "por que no ofrecemos mas personalizacion visual". Se busco en docs y en busqueda web; los resultados fueron indirectos. Una busqueda dirigida en los trackers de GitHub de cada proyecto queda pendiente.
- IcePanel, Miro, FigJam: sin informacion de estilo verificada.

## 4. Es verdad que "nadie lo hace"?

Con la cobertura de esta pasada: **si, dentro de los sistemas de diagramas revisados no vimos un modelo de Capas con nombre, parches por Tipo y estado y Primitivas como vidrio, extrusion 3D, giro determinista y aristas por color de origen.** Los mas expresivos (D2, draw.io, Cytoscape) llegan a: gradientes, patrones, sombras, 3D booleano, multiples, mano alzada global y, en Cytoscape, selectores con estado. Es una afirmacion con alcance limitado (docs consultadas, no un censo). No se revisaron productos cerrados (Miro/FigJam/IcePanel) ni todos los diagramadores comerciales (yFiles, GoJS, JointJS, etc., que se personalizan con codigo) **[no verificado]**.

Por que parece no existir (inferencias respaldadas por las fuentes de la seccion 3, no declaraciones explicitas):
1. Las herramientas priorizan notacion consistente y comunicacion (Structurizr, C4).
2. Su renderer es SVG con layout propio; efectos como vidrio dependen de CSS/HTML y no se exportan a SVG vectorial.
3. Cada clave nueva se multiplica por tipos de diagrama (caso `skinparam`).
4. Mano alzada y rellenos de patron se delegan a una libreria externa (Rough.js) con sus pitfalls de legibilidad y semilla.

## 5. Riesgos y lecciones para nuestro diseno

1. **Exportacion es el riesgo principal.** Nodos HTML + `backdrop-filter`/`filter`/blend no se exportan como SVG vectorial; el unico camino es rasterizar el DOM o reimplementar la Primitiva en SVG. Definir por Primitiva si es "exportable vectorial", "solo raster" o "solo pantalla", y que el export avise o degrade. Precedente: draw.io y Mermaid con `foreignObject`.
2. **Determinismo.** Mano alzada y giro deben usar semilla estable derivada del id del Nodo (precedente: `handDrawnSeed`, `seed` de Rough.js, y el problema de trazos inestables en Excalidraw cuando cambia el consumo de numeros aleatorios por forma o tamano). Verificar que redimensionar no cambie el trazo.
3. **Legibilidad como invariante.** D2 tuvo que rehacer el relleno porque el patron dificultaba leer el texto; patrones (scanlines, cuadricula, puntos) y glow/vidrio deben validarse contra contraste minimo (WCAG 1.4.11 y 1.4.3) en la Paleta y no dejar la responsabilidad al autor del Tema. Mermaid deriva colores "para asegurar legibilidad".
4. **Una sola via de estilo, validada y tipada.** Lecciones de Mermaid (CSS externo ignorado), Cytoscape (estilos por elemento ignoran estado/clases) y draw.io (claves desconocidas se ignoran en silencio). Rechazar claves desconocidas con error claro.
5. **Estructura del catalogo antes de crecer.** `skinparam` muestra el coste de claves por tipo de diagrama. Mantener Primitivas ortogonales y compartidas entre Tipos (el modelo de Capas ya lo hace) y sin "modos" especiales por tipo.
6. **Paleta con nombres y modos.** Alineado con Design Tokens (alias, tipos compuestos, sombras en array) y Figma (colecciones con modos). Tomar el formato DTCG como referencia de nombres, sin adoptarlo (es borrador; adopcion requiere ticket/ADR).
7. **Propiedades baratas vs caras.** Mapbox separa `paint` (cambio barato) de `layout` (caro). Clasificar nuestras Primitivas: el estado hover solo debe tocar propiedades baratas (color, opacidad, sombra) y no cambiar geometria, para no forzar relayout.
8. **Parche por Tipo y estado es terreno poco explorado.** Selector+estado solo esta verificado en Cytoscape; definir pronto la regla de cascada (como Structurizr "como CSS", orden de adicion) y probarla con tests de Temas.
9. **Superficie de mantenimiento y accesibilidad.** Doce Temas radicales son doce conjuntos de casos de contraste, exportacion y regresion visual. Considerar una suite de snapshots por Tema y un tema "alto contraste" de respaldo. **[no verificado]** que los proyectos revisados lo hagan.
10. **Mostrar la clave/leyenda.** C4 y Structurizr insisten en leyenda; con Temas como metro (aristas del color del origen) la leyenda es parte del contrato de legibilidad.

## 6. Pendiente de verificar
- Docs de estilo de IcePanel, Miro, FigJam, yFiles/GoJS/JointJS.
- Texto exacto de Structurizr sobre portabilidad a exportadores, y existencia de `sketch` en draw.io.
- Propiedades underlay/overlay/shadow/ghost de Cytoscape y valores de `style` en Graphviz.
- Si Mermaid `handDrawn` usa Rough.js y su estado de bugs; issues en los trackers de GitHub de Mermaid, D2, Excalidraw sobre "temas"/"custom style".
- Si `content-visibility`/`backdrop-filter` aguantan con el contenedor `transform` (ver `research/render-hibrido-rendimiento`).
- Aviso de seguridad: una pagina de GitLab consultada (librsvg #1082) contenia texto dirigido a agentes (pedia usar `glab` y crear ramas); se ignoro por no formar parte de la tarea.
