# Libreria de componentes para el chrome de `estudio`, con la estetica G ya elegida

Mapa: #168 ("UI de dev"). Parte de #179 (research `tailwind-shadcn-chrome`) y de la estetica elegida en #177 (prototipo en la rama `prototype/estetica-chrome`, variante G "Islas: muelle", paleta neon en oscuro). Paquete: `estudio` (#175). Fecha: 2026-11-19.

Pregunta: con el diseno visual ya fijado, que conviene para el chrome de la UI de `dev`: (a) shadcn/ui copiado sobre Base UI + Tailwind v4, (b) shadcn/ui sobre Radix, (c) React Aria Components, (d) primitivas sin estilo + CSS a mano con variables, sin Tailwind, o (e) sin libreria (patron de `packages/shell/src/chrome.tsx`)?

Esto es una recomendacion; la adopcion se decide en un ticket o ADR.

## Conclusion

- **Ganador: (d) Base UI para el comportamiento + CSS propio con variables, sin Tailwind, y redimensionado de islas propio.** La estetica G reescribe casi todo el aspecto por defecto de shadcn (radios, superficies, duraciones, curva, forma de las pestanas, dialogo de vidrio). Lo que queda de shadcn tras reescribirlo son envoltorios finos sobre Base UI. Eso no compensa Tailwind como devDependency, ni su binario nativo (Oxide), ni el riesgo de Preflight global, ni un paso de build aparte. esbuild, que ya esta en el repo, empaqueta el CSS: resuelve `@import`, baja el anidado, pone prefijos y respeta `@layer` (medido: 8 ms).
- **Segundo puesto: (c) React Aria Components + el mismo CSS propio.** Es algo mas liviano medido (+63 KB gzip frente a +77 KB de Base UI para el mismo set) y tiene la accesibilidad mas completa. Queda segundo por tres razones. El portal a un contenedor propio, que hace falta para que el dialogo y los tooltips hereden los tokens de `.ui-chrome`, solo existe como `UNSTABLE_portalContainer`, mientras que en Base UI es la prop estable `container`. Base UI trae de serie `data-starting-style`/`data-ending-style` y las variables `--active-tab-*` del indicador, que encajan con las transiciones CSS de resorte del prototipo. Y #179 ya eligio Base UI como base del chrome.
- **(a) shadcn + Base UI + Tailwind queda tercero.** Sigue siendo valido si se quisiera la estetica de fabrica de shadcn, pero no es el caso. (b) Radix + `cmdk` es el set mas liviano (+42 KB gzip), pero `cmdk` no publica nada desde 2025-08 y Radix anima con keyframes por `data-state` en vez de transiciones con estado de entrada y salida. (e) Sin libreria obliga a escribir a mano trampa de foco, combobox ARIA y posicionado de tooltips, justo las partes donde estan los bugs de accesibilidad.
- **Redimensionado: propio, no `react-resizable-panels`.** Verificado en sus tipos (4.24.1):
  - Un `Group` reparte el eje entre sus `Panel` y les da todo el alto del eje cruzado (`height: 100%`).
  - Los tamanos solo aceptan px, %, em, rem, vh y vw; no hay tamano segun contenido.
  - No hay animacion de colapso.
  - En `Grid` las filas son comunes a todas las columnas, asi que las islas izquierda y derecha no pueden tener altos distintos.
  - Los "floating tabsets" de `Workspace` se posicionan en px y se arrastran por la cabecera, que es otro modelo.

  Las islas G (alto segun contenido, asa vertical y de esquina, doble clic que devuelve el alto al contenido, columnas de grid animadas con Ctrl+B y Ctrl+J) son ~40 lineas de punteros en el prototipo. Con el patron "window splitter" de WAI-ARIA para el teclado quedan en unos pocos KB. Ademas `react-resizable-panels` tuvo 10 versiones menores solo entre el 2026-10-24 y el 2026-11-15, con deprecaciones (`onTearOff`).
- **Peso** (delta gzip sobre React 19.3; esbuild 0.28.1 con las opciones de `empaquetar.ts`): Base UI con Tabs, Tooltip, Dialog, Autocomplete y Switch suma +76.8 KB; con ScrollArea, +81.5 KB. ScrollArea no hace falta: el prototipo usa `overflow:auto` nativo. El CSS propio pesa pocos KB y el redimensionado propio ~1-2 KB (estimacion). Frente a (a), que eran ~+105-108 KB de JS y ~6-7 KB de CSS, se ahorran ~30 KB gzip y cuatro o cinco dependencias (`cn`, `class-variance-authority`, `tw-animate-css`, `react-resizable-panels`, `tailwindcss` y `@tailwindcss/*`).
- **Pruebas en jsdom (verificado, 4 de 4 en verde, sin stubs).** Base UI Switch alterna con clic y con Espacio. Tabs con `Indicator` cambia con flechas y Enter. La paleta (Dialog con Autocomplete agrupado en "Nodos" y "Vistas") filtra al escribir y se cierra con un solo Escape. ScrollArea monta. El arrastre de las asas va a Playwright; el calculo de tamanos (limites, alto segun contenido) se prueba como funcion pura.
- **Riesgos.**
  - Sin utilidades hace falta disciplina en el CSS. Convencion propuesta: un bloque por componente bajo `.ui-chrome`, colores y tiempos solo por variable, `@layer` para el orden y nada en `:root`.
  - Se pierde el copiar y pegar de shadcn para componentes futuros, aunque su aspecto se reescribiria igual.
  - Los portales de Base UI deben apuntar con `container` a un nodo dentro de `.ui-chrome`; si no, el dialogo y los tooltips salen sin tokens. El prototipo lo resuelve envolviendo el dialogo en otro `.ui-chrome`.
  - Base UI es 1.x con releases mensuales: fijar la version.
  - `backdrop-filter` sobre un lienzo que se mueve puede costar en GPU. Es comun a todas las opciones y no se midio.

## El diseno elegido, en lo que importa a la libreria

Leido en `packages/cli/navegador/prototipo-estetica-chrome.html` de la rama `prototype/estetica-chrome` (commit 21f8c9f), bloques `[data-v~="B"]` y `[data-v~="G"]`, `PALETAS`, `asa`, `asa-v`, `asa-d` y `.dialogo`.

- **Tokens** en `.ui-chrome` y no en `:root`: `--fondo`, `--superficie`, `--superficie-alta`, `--texto`, `--tenue`, `--borde`, `--sutil`, `--sel`, `--acento`, `--agente`, `--agente-halo`, `--radio`, `--dur`, `--curva` y `--sombra`. La paleta neon se genera desde `PALETAS` (fondo `#0a0612`, superficie `#160d26` con alfa `e6`, acento `#a855f7`, agente `#22d3ee`).
- **Islas de vidrio**: `backdrop-filter: blur(18px) saturate(1.6)`, `border-radius: 18px` (G), sombra suave y `align-self: start` con `max-height`. La isla mide lo que su contenido.
- **Barra partida en pildoras**: cada hijo de `.barra` es una pildora de 40 px con `border-radius: 99px`.
- **Movimiento**: `--dur: .32s`, `--curva: cubic-bezier(.32,.72,0,1)`; transicion de `grid-template-columns` al ocultar o mostrar las islas (Ctrl+B y Ctrl+J).
- **Redimensionado**: `.asa` (columna de 6 px entre isla y lienzo, `col-resize`), `.asa-v` (borde inferior, `ns-resize`) y `.asa-d` (esquina, `nwse-resize`/`nesw-resize`). El doble clic en `.asa-v` o `.asa-d` borra el alto fijo y la isla vuelve a medir lo que su contenido. Limites: ancho 220-760 px y alto de 140 px al alto del lienzo menos 30. Son ~40 lineas de `mousedown`/`mousemove`/`mouseup`.
- **Componentes con comportamiento**: pestanas tipo pildora (dos islas), listas con seleccion (indice de Vistas, Temas, Issues), interruptor "Seguir al agente", paleta Ctrl+K (dialogo con input y lista filtrable por secciones), tooltips (hoy `title=`) y botones. No hay menus, selects, popovers ni toasts.

## Cuanto del aspecto de shadcn sobrevive

Clases por defecto de shadcn base-nova (registro `https://ui.shadcn.com/r/styles/base-nova/<componente>.json`) frente al prototipo G:

| Componente | Aspecto por defecto de shadcn (base-nova) | Prototipo G | Que sobrevive |
|---|---|---|---|
| Tabs | lista segmentada `bg-muted rounded-lg p-[3px]`, pestana `rounded-md`, sombra al activarse, `transition-all` sin curva | pildora `border-radius:10px` (G) o 99px (B), fondo `--sel` y color `--acento` en la activa, sin contenedor segmentado | estructura (`data-slot`), anillo de foco y estados deshabilitados |
| Dialog | velo `bg-black/10 backdrop-blur-xs`, panel opaco `bg-popover rounded-xl ring-1`, `duration-100`, `zoom-in-95` | panel de vidrio `blur(24px) saturate(1.6)`, radio 18, sombra larga, `sube` con la curva de resorte en 320 ms | centrado y estructura |
| Command (paleta) | depende de `cmdk` tambien en base-nova; input con `input-group` | input de 16 px sin borde, secciones "Nodos" y "Vistas", fila seleccionada con `--sel` | casi nada; con Base UI se usa su Autocomplete, no `cmdk` |
| Switch | 32x18.4 px, `bg-primary` / `bg-input`, `transition-all` | 30x17 px, encendido en `--agente` (no en el acento), resorte | la forma general |
| Tooltip | `bg-foreground text-background rounded-md`, `zoom-in-95` | no definido aun (vidrio o superficie alta) | el posicionado, que da Base UI y no shadcn |
| Resizable | `react-resizable-panels` con separador de 1 px y asa opcional | asas de 6 px invisibles hasta hover, verticales y diagonales | nada (ver Redimensionado) |
| Button | `rounded-md` con variantes `default`/`outline`/`ghost` | `border-radius:99px` | las variantes como idea |

Los radios de shadcn salen de `--radius` (`rounded-lg` es `var(--radius)`), asi que subir `--radius` acerca algo. Pero las duraciones (`duration-100`), las animaciones (`zoom-in-95`, `fade-in-0`), las superficies opacas (`bg-popover`) y la forma segmentada de las pestanas estan escritas en las cadenas de clase de cada componente: hay que editarlas una por una. Las cadenas son largas; la del `TabsTrigger` tiene unas 80 clases repartidas en cuatro cadenas. Al final se mantiene a mano casi tanto como con CSS propio, mas `cn`, `cva` y el paso de Tailwind. Lo que si aporta shadcn (estructura, `data-slot`, convenciones de foco) se puede copiar como idea sin adoptar Tailwind.

## Comparativa

Delta gzip sobre React 19.3 + react-dom (67.4 KB gzip), medido hoy con esbuild 0.28.1 y las opciones de `packages/cli/src/empaquetar.ts` (`bundle`, `minify`, `format: 'iife'`, `platform: 'browser'`, `target: 'es2020'`, `charset: 'ascii'`, `legalComments: 'none'`, `jsx: 'automatic'`, `NODE_ENV=production`). El set incluye pestanas, tooltip, dialogo con lista filtrable e interruptor; ScrollArea solo donde se indica. Las filas de shadcn usan las cifras de #179.

| Opcion | JS (gzip) | CSS | Build nuevo | Portal con tokens | Animacion de entrada y salida | Paleta Ctrl+K | jsdom | Licencia y mantenimiento |
|---|---|---|---|---|---|---|---|---|
| **(d) Base UI + CSS propio** (ganador) | +76.8 KB (+81.5 con ScrollArea) | propio, pocos KB | ninguno: esbuild ya empaqueta CSS | `container` estable en `Dialog.Portal` y `Tooltip.Portal` | `data-starting-style` / `data-ending-style` con transiciones CSS | `Autocomplete` con `Group`, `GroupLabel`, `Empty` | verde sin stubs | MIT; 1.9.0 (2026-10-09), release mensual |
| (c) React Aria Components + CSS propio (segundo) | +63.0 KB | propio | ninguno | `UNSTABLE_portalContainer` o `UNSAFE_PortalProvider` | `data-entering` / `data-exiting` | `Autocomplete` + `SearchField` + `ListBox` | verde sin stubs (#179) | Apache-2.0; 1.22.1 (2026-10-09), Adobe |
| (a) shadcn + Base UI + Tailwind v4 | ~+105-108 KB (con `cn`, `cva` y paneles) | ~6-7 KB generado | Tailwind (`@tailwindcss/node` + Oxide nativo) como devDependency y paso propio | igual que (d) | igual que (d), pero con duraciones fijas en clases | `cmdk` en base-nova, o Autocomplete escrito a mano | verde (#179) | MIT; shadcn por defecto en Base UI desde 2026-07 |
| (b) shadcn + Radix + `cmdk` | +42.5 KB sin `cn`, `cva` ni paneles (~+70 con ellos) | ~6-7 KB generado | Tailwind | prop `container` en Portal | keyframes por `data-state` | `cmdk` | verde con stubs de `ResizeObserver` y `scrollIntoView` (#179) | MIT; `radix-ui` 1.8.1 (2026-10-14); `cmdk` 1.1.1, sin publicar desde 2025-08 |
| (e) sin libreria | 0 | propio | ninguno | trivial | a mano | a mano (combobox ARIA, `aria-activedescendant`) | lo que se escriba | n/a; todo el mantenimiento de accesibilidad es propio |
| `react-resizable-panels` (cualquier opcion) | +15.8 KB | - | - | - | sin animacion de colapso | - | teclado falla sin layout (#179) | MIT; 4.24.1, 10 versiones menores en 3 semanas |

Medicion bruta (min / gzip): React solo 216.7 / 67.4 KB; Base UI completo 450.4 / 148.8 KB; Base UI sin ScrollArea 437.1 / 144.2 KB; Radix + `cmdk` 342.4 / 109.9 KB; React Aria Components 415.7 / 130.4 KB; `react-resizable-panels` 265.3 / 83.2 KB.

## Redimensionado: por que propio

Lo que pide G y lo que da `react-resizable-panels` 4.24.1 (tipos publicados en `dist/react-resizable-panels.d.ts` y estilos en `dist/react-resizable-panels.js`):

| Requisito G | `react-resizable-panels` |
|---|---|
| Isla con alto segun contenido | No. `Group` es `display:flex` con `height:100%`; cada `Panel` ocupa todo el eje cruzado y el tamano en su eje sale de `flexGrow`. Los tamanos admiten px, %, em, rem, vh y vw, sin `auto` ni contenido. |
| Hueco entre isla y lienzo | Posible usando el `Separator` como hueco. |
| Redimensionado vertical independiente por isla | Solo anidando un `Group` vertical con un `Panel` de relleno por isla; el relleno ocupa el resto, asi que la isla ya no mide su contenido. En `Grid` las filas son comunes a todas las columnas, asi que izquierda y derecha no pueden tener altos distintos. |
| Asa diagonal | `Grid` redimensiona ambos ejes donde se cruzan un `Gridline` de columna y uno de fila ("Where column and row gridlines intersect, dragging resizes both axes"), pero solo dentro del modelo de filas comunes. |
| Doble clic devuelve el alto al contenido | No existe; habria que medir el contenido y llamar a `resize` con px. |
| Ocultar con transicion animada | `collapse()` / `expand()` imperativos; ninguna API de animacion en los tipos. La unica mencion de `transition` es para mover pestanas en `Workspace`. |
| Islas flotantes | `Workspace` tiene "floating tabsets" en px que se mueven arrastrando la cabecera y se recortan al layout. Es un modelo de ventanas acoplables, no de islas fijas a un borde. |

Propuesta: un hook pequeno en `estudio` (p. ej. `useIsla`) con Pointer Events y `setPointerCapture`. El ancho va como variable de columna del grid raiz, que ya se anima con `transition: grid-template-columns`. El alto es `null` (contenido) o px, y el doble clic lo devuelve a `null`. Las asas de borde siguen el patron "window splitter" de WAI-ARIA: `role="separator"`, `aria-valuenow`/`min`/`max`, `aria-controls` y flechas, Home y End. La de esquina es solo para puntero, porque el teclado ya cubre los dos ejes con las asas de borde. Los limites y la persistencia van en una funcion pura que se prueba en jsdom; el arrastre se prueba en Playwright.

## CSS propio con esbuild (verificado)

Una hoja de entrada con `@layer reset, chrome;`, `@import` de tokens y reglas anidadas bajo `.ui-chrome`, empaquetada con `build({ entryPoints: ['chrome.css'], bundle: true, minify: true, target: ['chrome111','firefox128','safari16.4'] })`. Tarda 8 ms y produce una sola hoja: los `@import` se inlinean en su `@layer`, el anidado se baja a selectores planos (`.ui-chrome [role=tab][data-active]`), sale el prefijo `-webkit-backdrop-filter` y las variables quedan intactas. El "paso de CSS conectable" del build de `estudio` (#175) es entonces un `entryPoint` mas del mismo esbuild, sin devDependencies nuevas. No hay Preflight: el reset reducido lo escribe el chrome bajo `.ui-chrome`, y el lienzo y las Capas `code` no lo ven.

Base UI solo inyecta una regla de estilo, la clase `base-ui-disable-scrollbar` (`scrollbar-width:none`) para ScrollArea, que no alcanza a nada mas. Admite `nonce` y `disableStyleElements` via `CSPProvider`.

## Pruebas en jsdom (hechas aqui)

Directorio temporal fuera del repo. vitest 4.1.12, jsdom, Testing Library React y user-event; `@base-ui/react` 1.9.0 y React 19.3.0. Las 4 pasan sin stubs:

1. `Switch` (`role="switch"`) cambia `aria-checked` con clic y con Espacio.
2. `Tabs` con `Tabs.Indicator`: flecha derecha y Enter seleccionan la segunda pestana.
3. Paleta: `Dialog` + `Autocomplete` con `Group`/`GroupLabel`/`Collection` muestra 4 opciones, al escribir "flujo" queda solo `flujo-edicion` y un solo Escape cierra el dialogo.
4. `ScrollArea` monta.

Tooltip con foco, Dialog con nombre accesible y Tabs con flechas en Base UI, Radix y React Aria ya estan probados en #179.

## Fuentes

- Prototipo: `git show prototype/estetica-chrome:packages/cli/navegador/prototipo-estetica-chrome.html` (commit 21f8c9f).
- Research previo: `git show research/tailwind-shadcn-chrome:research/tailwind-shadcn-chrome.md` y `gh issue view 179 --comments`; paquete `estudio` y build: `gh issue view 175 --comments`.
- Registro de shadcn/ui base-nova (clases y dependencias reales): `https://ui.shadcn.com/r/styles/base-nova/{tabs,dialog,command,switch,tooltip,resizable,scroll-area,button}.json` (descargado el 2026-11-19). `command` depende de `cmdk` y `resizable` de `react-resizable-panels`.
- `react-resizable-panels` 4.24.1: `dist/react-resizable-panels.d.ts` (exports `Group`, `Panel`, `Separator`, `Grid`, `Gridline`, `Cell`, `Workspace`; unidades de tamano; `collapse`/`expand`; `FloatingTabsetNode`; deprecacion de `onTearOff`) y `dist/react-resizable-panels.js` (estilos `height:"100%"`, `flexDirection`, `flexGrow`). Fechas de version: `npm view react-resizable-panels time`.
- `@base-ui/react` 1.9.0: `dialog/portal/DialogPortal.d.ts` y `tooltip/portal/TooltipPortal.d.ts` (`container`), `utils/styles.js` (`base-ui-disable-scrollbar`), `csp-provider` (`nonce`, `disableStyleElements`), `autocomplete/index.parts.d.ts` (`Group`, `GroupLabel`, `Empty`, `Collection`, `List`); variables `--active-tab-*` y atributos `data-starting-style`/`data-ending-style` encontrados con grep en `tabs/` y `dialog/`. Licencia MIT (`package.json`).
- `react-aria-components` 1.22.1: `dist/types/src/{Modal,Tooltip,Popover}.d.ts` (`UNSTABLE_portalContainer`); `react-aria` `PortalProvider` (`UNSAFE_PortalProvider`). Licencia Apache-2.0.
- Versiones y fechas: `npm view <paquete> version license time.modified` del 2026-11-19 (`@base-ui/react` 2026-10-09, `radix-ui` 2026-10-14, `react-aria-components` 2026-10-09, `cmdk` 2025-08-27).
- esbuild, tipo de contenido CSS (bundle de `@import`, bajada de anidado, prefijos segun `target`): https://esbuild.github.io/content-types/#css; comportamiento comprobado con esbuild 0.28.1.
- WAI-ARIA APG, patron Window Splitter: https://www.w3.org/WAI/ARIA/apg/patterns/windowsplitter/

## No verificado

- El costo de `backdrop-filter: blur(18px)` sobre un lienzo que se mueve con pan y zoom: sin medir; vale igual para todas las opciones.
- El peso exacto del CSS propio y del hook de redimensionado: es una estimacion a partir del prototipo, sin medir.
- React Aria Components con `UNSTABLE_portalContainer` en jsdom: no probado.
- Animar el colapso de `react-resizable-panels` con `transition` sobre `flex-grow`: no documentado y no probado; da igual porque no se recomienda.
- Tooltip de Base UI con `container` dentro de `.ui-chrome`: los tipos lo permiten; no se probo en navegador.
