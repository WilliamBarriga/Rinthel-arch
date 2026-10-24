# Sistema de Temas expresivo: Capas declarativas, render hibrido y animacion

Contexto: el modelo anterior (formas fijas cerradas, ADR 0002 y 0006) solo permitia variar valores dentro de unas pocas formas. El prototipo de estetica (variantes A-G) y el del render hibrido (14 Temas: vidrio, Bauhaus, post-its, teclas 3D, metro, PCB, pixel...) mostraron que cambiar solo el Tema puede dar disenos radicalmente distintos si el Tema describe el dibujo como datos y no como una eleccion entre formas fijas. Este ADR reemplaza ese modelo. Reescribe el ADR 0002 (queda solo con lo que no cambia) y absorbe y borra el ADR 0006. Las decisiones salen del mapa "Sistema de Temas expresivo" y sus tickets; el detalle de cada una vive en el ticket citado. La implementacion queda fuera.

## Render hibrido: HTML/CSS para Nodos y Grupos, SVG para Aristas

Nodos y Grupos se dibujan como HTML/CSS (vidrio con `backdrop-filter` real, sombras, filtros, texto del navegador); las Aristas, en una capa SVG. Todo vive bajo un solo contenedor con un unico `transform` de pan/zoom, de modo que la alineacion es exacta a cualquier zoom (prototipo, ticket "Prototipo: render hibrido").

- El orden Grupo < Arista < Nodo exige tres capas planas en coordenadas absolutas del lienzo, no divs anidados: la Geometria da cajas relativas al Grupo padre y Aristas en coordenadas del lienzo, y el render convierte a absolutas.
- Rendimiento: `contain: layout style` por Nodo y el colapso por Vista como palanca principal. Sin techo oficial de Nodos; estimacion a validar de 300-500 Nodos HTML con detalle completo a la vez. El costo de `backdrop-filter` y `box-shadow` no tiene cifras primarias (research `render-hibrido-rendimiento`).
- Canvas/WebGL queda descartado por overkill.
- El render sigue siendo una funcion pura de geometria y Estilo resuelto: sin reloj externo; la animacion corre en el navegador (CSS y WAAPI). Los contratos de `visibility` y colapso por `view` del ADR 0002 se mantienen.
- El SVG estatico, PNG y el export en general quedan fuera: el sistema asume solo pantalla y no hay marca de exportabilidad por Primitiva.

## Modelo de capas: Capas, Primitivas y Slots

Cada elemento (Nodo, Arista, Grupo y fondo de pagina) es una pila ordenada de **Capas** con nombre. Una Capa es una instancia de una **Primitiva**, tomada de un catalogo cerrado; el DSL nunca lleva CSS crudo.

- **Familias** (once): forma, relleno, borde/trazo, sombra, glow, vidrio, filtro (mano alzada), decoracion, marcador de Arista, estilo de texto de Slot y codigo. Cada Primitiva pertenece a una sola. Ejemplos del catalogo inicial: formas rect, pastilla, esquina cortada y circulo; rellenos solido, gradiente, patrones (cuadricula, lineas, disco) y ruido; sombras multiples, `inset` y `spread` (blur 0 da sombra dura); trazos de Arista continuo, discontinuo, punteado y pixel, esquina `chaflan`, marcadores incluido `via`. Los nombres exactos y rangos viven en el esquema del catalogo (ver abajo), no en este ADR.
- **Contenido en Slots**: nombres fijos `icon`, `title`, `desc`, `badge`, `footer`, `attrs`, `counter`, con un mini-layout declarativo (fila/columna, alineacion, gap). El Tema decide cuales se muestran, donde y con que estilo; el orden del bloque es el orden visual y un Slot no listado no se pinta. No hay posicion libre en px.
- **Orden respecto al contenido**: cada Capa va bajo el contenido (defecto) o sobre el (`over`).
- **Grupo**: bloque `group` con la misma pila de Capas, `type` y `state` que `node`, mas la cabecera (un arbol de Slots del mini-layout: `slots row gap 6 { icon title }`), el `padding` de la zona de hijos (1, 2 o 4 valores) y `state collapsed`, el parche del Grupo cerrado, que se comporta como un Nodo hoja (puede cambiar Slots y caja; los demas parches de estado y de Tipo del Grupo no tocan las Metricas). El alto de la cabecera mas el padding dan el padding superior de la entrada de Grupo abierto de la tabla de Metricas, y la cabecera fija el ancho minimo del Grupo: los hijos nunca la solapan. El estilo `text` del titulo admite `size`, `tracking`, `alpha`, `transform` y chip (`fill`, `border`, `radius`, `pad`, `dot`). Un Tema sin `group` resuelve un Grupo sobrio derivado de sus tokens, nunca las Capas del Nodo. `COLOR` se pinta como la variable del color de cada Nodo o Grupo, y los parches por Tipo y por estado se pintan igual para Nodos y Grupos (selectores `.rd-nodo`, `.rd-grupo`, `.rd-colapsado` con `data-tipo` y `data-estados`).
- **Arista**: modelo propio mas pequeno: pila de trazos (un segundo trazo ancho y translucido da el glow), marcadores de origen y fin del catalogo, y etiqueta que reutiliza el modelo de caja del Nodo. El enrutado sigue siendo de ELK y no depende del Tema.
- **Sin formas fijas**: cada Tema describe su dibujo con Capas.
- **Valores**: el color es siempre un nombre de Paleta (ADR 0002) con modificadores (alfa, `mix`, los especiales `COLOR` y `ORIGEN`); sin hex fuera de `palette`. Los numeros son literales o `$token` con nombre, sin aritmetica.

### Cascada y parches

La variacion se expresa como parches por nombre de Capa, nunca por indice. Orden de la cascada, donde el ultimo gana: Tema base, Tipo de nodo, estado, override de la Vista. Un parche cambia una Capa existente, la anade (con `before` o `after`) o la quita (`none`). Estados: `hover`, `seleccionado`, `fantasma`, `en-ruta`, `atenuado` y `foco`. Las condiciones se limitan a Tipo de nodo, estado, Grupo/colapsado y presencia de contenido (hay descripcion, hay Atributos); sin expresiones ni lectura de datos arbitrarios del Modelo.

Un Tema por Vista; dentro de la Vista la forma varia por Tipo de nodo, Arista y Grupo. Mezclar Temas completos dentro de una Vista queda descartado: la variacion interna se cubre con parches por Tipo, `extends` y `part`/`use`. Excepcion explicita: el Tema `alto-contraste` reemplaza al de la Vista solo en el visor.

## Sintaxis DSL del bloque `theme`

Mismas convenciones que el DSL actual: llaves, sin comas, propiedades `clave valor` en una linea y sub-bloque solo cuando el valor compuesto no cabe en una. Palabras clave en ingles; el espanol queda para docs y terminos del dominio. Criterio rector: que un humano lo lea con facilidad primero, y luego un agente.

```
theme soft-card {
  palette { ink #1f2937  paper #ffffff  accent #3b82f6 }
  tokens { gap 8  radius 10 }

  node {
    layer base   { shape rect radius $radius  fill paper }
    layer border { stroke ink/0.15 width 1 }
    layer accent after base { bar left width 4 fill accent }
    slots column gap $gap pad 12 {
      title { size 14  weight 600  color ink }
      desc  { size 12  color ink/0.7 }
    }
    type service { layer accent { fill mix(accent, paper, 0.3) } }
    state hover  { layer border { stroke accent } transition 120ms ease-out }
    state selected { layer accent { motion pulse 1.2s ease-in-out intensity 0.4 } }
  }

  edge {
    layer line { stroke ORIGEN width 1.5 }
    end arrow
  }
}
```

- **Un verbo de Capa**: `layer <nombre>` define, cambia o anade segun exista o no en el nivel de abajo de la cascada. Anadir exige `before`/`after`; quitar es `layer <nombre> none`; anadir sin ubicacion es error.
- **Composicion**: `extends` de un solo padre con semantica de parche; `part <nombre> { ... }` es un parche reutilizable sin Tema, que se incluye con `use <parte>` dentro de un elemento. Sin herencia multiple.
- **Nombres unicos** en todo el Workspace: `theme` o `part` repetido es error de duplicado, nunca fusion. Retocar un Tema ajeno se hace con `extends`.
- **Sin compatibilidad** con el formato viejo: `nodeStyles`, `edgeStyles`, los `tokens` de Tema y los Temas actuales desaparecen. Ejemplos y fixtures se reescriben al formato de Capas.
- La gramatica Langium concreta y los nombres finales de propiedades se fijan al implementar, usando los `const T` del prototipo hibrido (rama del prototipo) como casos de prueba.

## Ampliacion y validacion del catalogo

- **Fuente unica**: un solo esquema tipado del catalogo (en el paquete de DSL/tema); de el se derivan la validacion, los mensajes, `inspect` y la tabla de referencia de docs. Sin listas paralelas.
- **Ampliacion**: una familia nueva requiere un ADR. Una Primitiva o propiedad nueva dentro de una familia es un issue y un cambio al catalogo, sin ADR. Debe (1) no poder componerse con las existentes, (2) ser determinista, (3) declarar si afecta a las Metricas (defecto: solo pintura) y (4) aparecer en al menos un Tema de ejemplo como caso de prueba. Amplia el mantenedor; el autor de un Tema usa la via de escape en codigo.
- **Validacion estricta**, con codigo estable y posicion, todos los errores juntos y mensaje en espanol con las claves validas y la mas cercana ("quisiste decir ..."). Son errores: propiedad desconocida, `before`/`after` a una Capa inexistente, parche a una Capa inexistente sin ubicacion, color fuera de la Paleta, `$token` no declarado, valor fuera de rango o de tipo (nunca se recorta en silencio; el giro tiene tope de 3 grados), parche de estado que toca Metricas.
- **Determinismo** (mano alzada, giro, ruido): semilla FNV-1a de 32 bits del id del elemento mezclado con el nombre de la Capa; PRNG sembrado una vez por Capa, independiente del tamano de la caja y del orden de render (redimensionar o colapsar no cambia el trazo); la Vista no entra en la semilla. `seed N` opcional en el Tema para "tirar de nuevo". El filtro de mano alzada usa la semilla como entero de `feTurbulence`. Las Aristas derivan su identidad de `origen->destino` mas un indice entre Aristas identicas, sin tocar el DSL.

## Metricas y Estilo resuelto

Se conserva del ADR 0006 el principio de que layout y render leen las mismas Metricas, de modo que lo reservado y lo dibujado no pueden divergir; la clave de cache de layout se calcula sobre ellas (ADR 0003) y `resolverEstilo` sigue pura y determinista. Se reescribe el resto.

- **Que afecta al layout**: solo la caja y los Slots (padding, gap, tamano de Slot, ancho minimo). Las Capas pintadas (sombra, glow, decoracion, mano alzada) pueden sobresalir sin reservar espacio. Los Slots que anaden ancho (contador de Grupo colapsado, `prefijo` del titulo) entran en las Metricas; cada Tema fija su factor de ancho de texto (fuente pixel).
- **Tabla de Metricas**: `metricasDe(tema)` pasa de un objeto unico a una tabla de entradas por elemento: Nodo por Tipo de nodo (cascada Tema base, Tipo), Grupo abierto, Grupo colapsado y etiqueta de Arista. Un Tipo que el Tema no menciona usa la entrada base; un Tipo declarado y no usado se ignora; cajas distintas por Tipo en una Vista son normales.
- **Que se mide**: el texto de cada Slot; la caja minima que exige la forma (regla declarada por Primitiva: ancho, alto, proporcion; el circulo pide un cuadrado que contenga el contenido); y los Slots condicionales. Las Capas pintadas no se miden. De las Aristas cuenta solo la caja de la etiqueta.
- **Estados**: solo el estado base y el colapsado de un Grupo pueden cambiar la caja. Un parche de estado (`hover`, `seleccionado`, `fantasma`, `en-ruta`, `atenuado`, `foco`) que toque padding, gap, tamano o visibilidad de un Slot es error de `validate`. Hover nunca relayouta.
- **Texto**: la estimacion por caracter sigue como base (el layout corre sin DOM). La medicion real es un adaptador de `metricasDe`: el visor mide tras cargar las fuentes y entrega las medidas al layout como entrada; el CLI sigue con la estimacion.
- **Relayout**: un cambio de Tema relayouta solo si cambia la clave de estructura (Metricas por elemento, origen de las medidas, fuentes). Un cambio solo de Capas pintadas o animacion no relayouta ni invalida la Geometria vigente; un Tema completo distinto con Metricas identicas reutiliza la cache.
- **Estilo resuelto**: es el resultado de aplicar la cascada (Tema base, Tipo, estado, override de la Vista) a las pilas de Capas. Tiene dos mitades: las **Metricas** (las lee el layout) y la **pintura** (las Capas, las lee el render). El render solo lee el Estilo resuelto y funciona como interprete de Primitivas; los pintores por parte del ADR 0006 desaparecen.
- **Pin**: pasa a anclar el **centro** del Nodo (antes, la esquina superior izquierda), para que un Nodo que cambia de tamano con el Tema crezca alrededor de su Pin sin moverse ni invalidarlo. Cambia la semantica de `pin` en layout, DSL y edicion (ADR 0003 y 0007) y los Pins existentes se migran.

## Fuentes

- Las fuentes son archivos del Workspace, auto-hospedados e incrustados (la licencia OFL permite embeber). Un CDN queda fuera del nucleo; las fuentes del sistema solo valen como fallback declarado, porque `system-ui` y los genericos varian por plataforma y no son deterministas.
- El visor mide solo tras `await document.fonts.load(<font>, <texto>)` (`ready` y `check` no bastan).
- harfbuzzjs (MIT) es candidato a evaluar para medir avances de glifo en Node/Worker; antes de adoptarlo hace falta su research y decision propios.
- La clave de cache de layout incluye el hash del archivo de fuente y el nivel de medicion (estimado o medido). No verificado: igualdad de `measureText` entre motores (research `fuentes-tema`).

## Animacion declarativa

- **Movimientos**: la animacion continua se declara como Movimientos de un catalogo cerrado con nombre (`flujo`, `pulso`, `respiracion`, `giro`, `aura`...) y parametros (duracion, easing, intensidad, retardo). Es propiedad de una Capa y puede atarse a un estado. Se amplia como las Primitivas. Salida de emergencia declarativa: `keyframes` minimos sobre una propiedad de Capa; mas alla, la via de escape en codigo.
- **Reacciones**: no son un concepto aparte; son transiciones automaticas entre parches de estado. El Tema declara `transition` (duracion, easing) por Capa o estado.
- **Entrada y salida**: `enter`/`exit` por elemento con efectos de catalogo (`fundido`, `escala`, `deslizar`, `dibujar-trazo` para Aristas) y `stagger` declarativo. Un Paso de revelado (ADR 0002) no tiene mecanismo propio: solo dispara la `enter` de lo recien revelado.
- **Foco de ruta**: `en-ruta` y `atenuado` son estados mas de la cascada. Quien calcula la ruta es el renderizador o la interaccion; el Tema solo decide como se ve.
- **Que se anima**: solo propiedades pintadas o componibles (opacidad, color, transform, desplazamiento y longitud de trazo, blur, glow). Nada que afecte a las Metricas: la animacion nunca provoca relayout. Los cambios de posicion (colapso de Grupo, cambio de Vista) no se animan en lo declarativo: cambio instantaneo, con fundido para lo que aparece o desaparece; la animacion de layout es del codigo.
- **Mecanismo**: el Tema compila a CSS nativo (keyframes y transiciones) para lo continuo y los estados, y a WAAPI para secuencias coordinadas (entrada, salida, escalonado, Pasos). Sin dependencia en el nucleo. Motion (MIT) solo como extension opcional de la via en codigo; GSAP queda descartado por licencia (research `animacion-efectos`).
- **`prefers-reduced-motion`**: politica automatica en un unico punto del nucleo. Los Movimientos continuos quedan en su fotograma estatico; entrada, salida y transiciones se reducen a un fundido corto o cambio instantaneo. El Tema puede declarar `reduced still|fade|instant` por animacion pero no desactivar la politica. El visor ofrece ademas un interruptor manual independiente de la preferencia del sistema.
- **Sintaxis** (primer corte, solo Nodo): dentro de una Capa, `motion <nombre> [duracion] [easing] [intensity N] [delay D] [reduced still]`, `motion none` (quita el heredado) o `keyframes <propiedad> [duracion] [easing] { <porcentaje> <valor> ... }`; en `node`, `transition D [easing]`, `enter <efecto> ...`, `exit <efecto> ...` y `stagger D`; `transition` tambien dentro de un `state`. Duraciones `120ms` o `1.2s`; easings `linear`, `ease`, `ease-in`, `ease-out`, `ease-in-out`. El catalogo (`tema`) fija nombres, defectos y rangos; un valor fuera de rango es error, nunca se recorta. Propiedades de `keyframes`: `opacity`, `scale`, `rotate`, `shift-x`, `shift-y`, `blur`.
- **Realizacion**: todo compila a CSS nativo (`@keyframes`, `animation`, `transition`, propiedades individuales `scale`/`rotate`/`translate`); un Movimiento atado a un estado corre bajo el selector `[data-estados~="<estado>"]`. `enter` es una `animation` sobre lo visible (con `stagger` por `--rd-n`) y `exit` una `transition` hacia el atributo `data-oculto`; WAAPI no hace falta mientras el escalonado sea declarativo. `dibujar-trazo` llega con el modelo de Arista.
- **reduced-motion**: una sola funcion del render genera la politica, con la media query del sistema y el atributo manual `data-reduced-motion="on|off"` del contenedor (prop `reducedMotion` de `Diagram`). Los Movimientos y `keyframes` solo admiten `reduced still`; `transition`, `enter` y `exit` admiten `fade` (defecto, 100 ms) o `instant`.
- A verificar en implementacion: rendimiento de muchas Aristas con flujo continuo.

## Via de escape en codigo

- **Donde vive**: modulos `.tsx`/`.ts` dentro del Workspace, junto al `.dg` del Tema y versionados con el. Paquete npm como fuente posible mas adelante, sin cambiar el contrato.
- **Carga**: `sesion` sigue pura y nunca importa codigo. Un adaptador (`cli`/`dev`) compila el `.tsx` y lo registra en el render por nombre. El DSL lo referencia por nombre declarado, nunca por ruta libre.
- **Alcance**: el componente es una **Capa** mas de la pila, via la Primitiva `code <Componente>` (con parches, orden `over` y estados como cualquier Capa); no reemplaza el elemento entero y no puede cambiar su tamano ni afectar a las Metricas.
- **Props**: objeto de solo lectura y serializable: caja ya calculada, estado actual, color de Paleta resuelto, `id` del elemento (semilla determinista), parametros declarados en el Tema y datos acotados (Tipo, titulo, presencia de contenido). Sin el Modelo completo ni callbacks hacia el Modelo.
- **Validacion**: un Tema con codigo queda marcado en `inspect` y `validate` (`temaConCodigo` y lista de componentes). `validate` emite un warning y solo comprueba la interfaz (el componente existe, sus parametros coinciden con el esquema que exporta, el id no choca). La parte declarativa se valida con la misma rigurosidad que cualquier Tema.
- **Confianza**: el codigo corre con los privilegios del navegador y de `dev`, sin sandbox. El Workspace se trata como codigo de confianza: `dev` avisa la primera vez que carga un Tema con codigo y abrir un Workspace ajeno exige confirmacion explicita. El sandbox (iframe/worker) queda fuera.
- **Agente**: `edit` e `inspect` operan sobre el DSL del Tema, no sobre el `.tsx`; el agente edita el `.tsx` con sus herramientas normales. Un error de compilacion es un issue de `validate` (`file`/`line`, codigo estable) y `dev` conserva el ultimo dibujo bueno.
- **Implementacion (ticket #42)**: la Capa se escribe `layer aura code over { component Aurora  hue 3 }`; `component` es obligatoria y las demas propiedades son los parametros declarados (numero o texto tal cual; un parche de estado puede cambiarlos). Un componente es un export con nombre en mayuscula de un `.tsx` del Workspace. El adaptador (`cli/src/codigo.ts`) los compila con esbuild sin ejecutarlos: da los nombres al registro de `sesion` (`OpcionesDeSesion.componentes`) y un bundle CommonJS que `dev` sirve en `/componentes.js`. `render` recibe el registro por la prop `componentes` de `Diagram` y monta cada Capa en un contenedor de tamano fijo igual a la caja (`data-codigo`), con un limite de error por Capa. Codigos: `W_THEME_WITH_CODE` (warning), `E_THEME_COMPONENT_MISSING`, `E_THEME_COMPONENT_PARAMS` (solo si el registro declara parametros; el CLI estatico no los conoce porque no ejecuta el `.tsx`), `E_THEME_COMPONENT_DUPLICATE` y `E_THEME_CODE_COMPILE` (con `file`/`line` del error). `dev` no sirve el codigo hasta que el usuario confirma en el navegador (`POST /api/confiar`) o arranca con `--trust-code`; si un `.tsx` deja de compilar, conserva la ultima version buena de ese archivo.

## Accesibilidad

- **Contraste**: advertencia (nunca bloquea el render), calculada por `validate` sobre colores de Paleta, por Tipo y por estado (base, `en-ruta`, `atenuado`). Umbrales: 4.5:1 para texto (3:1 si es grande) y 3:1 para partes graficas.
- **`alto-contraste`**: Tema propio del nucleo, no un parche. Lo activa un interruptor del visor o `prefers-contrast: more`; reemplaza el Tema de la Vista solo en el visor, sin tocar el Workspace.
- **Foco y teclado**: Nodos y Grupos son focalizables en orden de declaracion del Modelo; Enter o Espacio colapsa o abre un Grupo; las flechas saltan por Aristas al Nodo vecino. `foco` es un estado de la cascada. El nucleo garantiza un anillo minimo: el Tema lo restiliza pero no lo quita (`none` se ignora con warning). Politica unica en el nucleo, como reduced-motion.
- **Solo color**: `validate` emite el warning `solo-color` cuando dos Tipos de una Vista se distinguen unicamente por color de Paleta; el visor puede mostrar siempre una leyenda derivada del Tema (Tipo, forma, color) y la activa sola en ese caso.
- **Contenido accesible**: el nombre accesible de Nodos, Grupos y Aristas sale del Modelo (etiqueta, Tipo, origen/destino); el Tema no puede ocultarlo ni cambiarlo. El SVG de Aristas es decorativo (`aria-hidden`) y la relacion se anuncia en los Nodos ("va a" / "viene de").

## Temas de ejemplo y Tema por defecto

- Los 14 Temas del prototipo (`soft-card`, `glass-chip`, `neobrutalist`, `blueprint`, `crt-terminal`, `synthwave`, `editorial`, `bauhaus`, `sticky-notes`, `keycaps`, `metro-map`, `pcb`, `pixel-art` y el claro suave) viven en `examples/temas/`, un `.dg` cada uno, con un Workspace de galeria y un Modelo propio y agnostico que cubre todos los Tipos, Grupo abierto y colapsado, Aristas con y sin etiqueta y un Nodo por estado. Cubren las once familias. Los ejemplos que necesitan fuente propia incluyen el archivo OFL en `examples/temas/fuentes/`; nada de CDN.
- Tema por defecto: **`neutral`**, incorporado en el nucleo, claro, escrito en el mismo DSL que cualquier Tema como modelo de referencia, con fuentes del sistema, sin Capas `code`, solo Primitivas simples (sin vidrio ni mano alzada), animacion minima (`hover`, `en-ruta`) y cero warnings. Lo acompanan `neutral-dark` (un Tema es un solo modo) y `alto-contraste`: tres incorporados. Una Vista sin Tema usa `neutral`.
- Aceptacion: todo ejemplo valida sin errores; los tres incorporados, sin warnings; los demas pueden conservar warnings de contraste deliberados, listados en un comentario al inicio del archivo, sin sintaxis de supresion. Las pruebas son estructurales (cargan, resuelven, validan; Estilo resuelto determinista; Metricas solo cambian con la clave de estructura), sin capturas de pixeles; la revision visual la hace una persona en la galeria.

## Consecuencias

- Las formas fijas del modelo anterior se reemplazan por Capas; el Estilo resuelto y las Metricas se redefinen (ver arriba y `CONTEXT.md`). Los ADR 0003 (Pin al centro, clave de cache con fuentes y origen de medidas) y 0007 (semantica de `pin`) se ajustan al implementar.
- Vocabulario nuevo en `CONTEXT.md`: Capa, Primitiva, Familia, Slot, Movimiento, Parte de Tema, Componente de Tema y Tema por defecto.
- El contrato del CLI para Temas (`inspect tema`, `validate`, recarga de `dev`) esta en la enmienda del ADR 0005; `edit` no cambia.
- Fuera de alcance: la integracion con slides, video u otros consumidores, y mezclar Temas completos dentro de una Vista.
