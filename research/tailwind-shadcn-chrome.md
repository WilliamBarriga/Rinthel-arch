# Tailwind y librerias de componentes estilo shadcn/ui para el chrome

Ticket: #179 (mapa #168, "UI de dev"; bloquea a #177, "Estetica del chrome de la UI"). Fecha: 2026-11-19.

Pregunta: encaja Tailwind CSS junto a una libreria de componentes al estilo shadcn/ui (codigo copiado al repo sobre primitivas accesibles) para el chrome de la UI de `dev`? Comparar candidatos y recomendar el que mejor encaje con el build de esbuild, React 19.3, el peso del bundle, los componentes de la disposicion aprobada (#169), los Temas (ADR 0008), la accesibilidad y las pruebas en jsdom.

Esto es una recomendacion; la adopcion se decide en #177.

## Conclusion

- **Ganador: shadcn/ui (codigo copiado) sobre Base UI + Tailwind v4 compilado en build, sin Preflight global.** Base UI (MIT, MUI, 1.0 estable desde 2025-12-11, release mensual, 1.9.0 del 2026-10-09) es la base por defecto de shadcn/ui desde julio de 2026; trae Tabs, Tooltip, Dialog, ScrollArea y Autocomplete propios, de modo que la paleta Ctrl+K no necesita `cmdk`. Paneles redimensionables con `react-resizable-panels` (MIT), que es lo que usa el `resizable` de shadcn.
- **Segundo puesto: shadcn/ui sobre Radix Primitives.** Es el mas liviano medido (+69 KB gzip todo el set frente a +108 KB de Base UI) y el mas probado, pero shadcn movio su defecto a Base UI, Radix tuvo rafagas de mantenimiento espaciadas (ultimo push 2026-10-14) y la paleta depende de `cmdk`, sin release desde 2025-03 y que ademas arrastra `@radix-ui/react-dialog`.
- **Alternativa fuerte: shadcn/ui sobre React Aria Components** (Apache-2.0, Adobe; soportado por shadcn desde julio de 2026 con `--base aria`). Mejor historia de accesibilidad e i18n y +81 KB gzip con `react-resizable-panels`; queda tercera por ser la base menos usada en los ejemplos de shadcn.
- **Peso**: el chrome completo (pestanas, tooltip, dialogo con buscador, scroll, paneles, `cn` + `cva`) suma ~+105-108 KB gzip de JS sobre React con Base UI y ~6-7 KB gzip de CSS para seis componentes de shadcn. Con el visor actual (~240 KB gzip) y CodeMirror 6 (~120 KB gzip) la pagina quedaria en ~470 KB gzip; para una herramienta local en localhost es aceptable.
- **Integracion en el build**: Tailwind v4 no necesita PostCSS ni Vite. `@tailwindcss/node` (`compile`) + `@tailwindcss/oxide` (`Scanner`) generan el CSS en ~30-70 ms desde Node; o el CLI `@tailwindcss/cli`. Como las clases solo salen de `packages/cli/navegador/` (no del Workspace), el CSS puede generarse en el build del paquete (`pnpm build`) y viajar como texto junto al bundle, dejando Tailwind como devDependency y sin binario nativo en el runtime del CLI. No hace falta el plugin de terceros `esbuild-plugin-tailwindcss` (usa PostCSS por dentro).
- **Tokens y aislamiento del lienzo**: el chrome tiene sus propios tokens (los de shadcn: `--background`, `--primary`, `--border`, `--ring`...) declarados en la raiz del chrome, no en `:root`, y no sigue al Tema de la Vista. El lienzo ya esta aislado en una direccion: `render` escopa todas sus reglas bajo una clase de alcance y usa solo variables `--rd-*` y `--trazo`, que no chocan. El riesgo esta en la otra direccion: Preflight de Tailwind es global (`*` con `margin:0; padding:0; border:0 solid; box-sizing:border-box`, `svg{display:block}`, `line-height:1.5` en `html`) y alcanzaria los Nodos HTML del lienzo y las Capas `code` de los Temas; `render` no fija `line-height` en su raiz, asi que la heredaria. Por eso: importar `theme.css` + `utilities.css` sin `preflight.css` y aplicar un reset reducido solo bajo la raiz del chrome.
- **Accesibilidad y jsdom**: Base UI, Radix, React Aria y `cmdk` pasan en jsdom (vitest 4 + Testing Library) las pruebas de teclado de pestanas, apertura y cierre con Escape del dialogo, filtro del buscador y tooltip con foco. `cmdk` y `react-resizable-panels` exigen stubs (`ResizeObserver`, `scrollIntoView`); el redimensionado con teclado de `react-resizable-panels` no funciona en jsdom (sin layout) y queda para Playwright.
- **Motor de estilos**: Tailwind v4 frente a UnoCSS, Panda CSS o CSS a mano: ninguno encaja claramente mejor con esbuild. Los componentes de shadcn usan sintaxis de Tailwind v4 (`@theme inline`, `@custom-variant`, `shadcn/tailwind.css`); con UnoCSS o Panda se pierde el copiar-y-pegar. Si #177 descarta Tailwind, el plan B sin dependencias es el patron actual de `packages/shell/src/chrome.tsx` (variables CSS a mano en un `<style>`), sobre las mismas primitivas sin estilo.

## Contexto del repo (verificado en codigo)

- React del repo: `react` y `react-dom` 19.3.0 en `packages/cli/package.json` y como devDependency de `shell` (peer `^18 || ^19`). esbuild 0.28.1.
- `packages/cli/src/empaquetar.ts`: `build` de esbuild con `bundle`, `minify`, `format: 'iife'`, `target: 'es2020'`, `write: false`; devuelve el JS como texto. No hay loader de CSS.
- `packages/cli/src/dev-shell.ts`: empaqueta `navegador/dev.tsx` (pagina) y `navegador/worker.ts` (layout) al arrancar `dev` (`iniciarDev` llama a `shell()`), es decir en el runtime del CLI, no en su build.
- `packages/cli/src/dev.ts`: la pagina es una plantilla `PAGINA` con un `<style>` minimo (`html,body,#raiz{margin:0;height:100%;overflow:hidden;font-family:system-ui,sans-serif}`) y `<script src="/app.js">`.
- `packages/shell/src/chrome.tsx`: el chrome actual del lienzo (migas, Pasos) inyecta un `<style data-rd-chrome>` con variables `--rd-fondo`, `--rd-texto`, `--rd-borde`, `--rd-acento`, `--rd-fuente`, `--rd-error` derivadas del Estilo del Tema. Es CSS a mano, sin dependencias.
- `packages/render/src/hoja.ts`: cada regla va bajo `.${clase}` de alcance (`alcance = selector.replace(/&/g, ...)`); la raiz fija `font-family`, `font-size`, `color`, `background`, pero no `line-height`. Los Nodos y Grupos son HTML (ADR 0008, render hibrido) y las Aristas SVG.
- Variables CSS que usan `render` y `shell`: solo `--rd-*` y `--trazo` (grep). Ninguna coincide con los tokens de shadcn ni con los `--color-*`, `--spacing`, `--font-*` de `tailwindcss/theme.css`.
- `packages/shell/vitest.config.ts`: `environment: 'jsdom'`, `maxWorkers: 2`. Ningun test de `shell` stubea `ResizeObserver` hoy.

## Tabla comparativa

Pesos: delta gzip sobre React 19.3 + react-dom solo (67.4 KB gzip), medido con esbuild 0.28.1 y las opciones de `empaquetar.ts` (ver Medicion). "Set" = pestanas, tooltip, dialogo con buscador, scroll (si existe) y paneles con `react-resizable-panels`; las filas shadcn incluyen ademas `cn` + `class-variance-authority`.

| Candidato | Licencia | Mantenimiento (2026-11) | Encaje con esbuild | React 19.3 | Peso del set (gzip) | Componentes de #169 | Tokens frente a Temas | Accesibilidad | jsdom |
|---|---|---|---|---|---|---|---|---|---|
| **shadcn/ui + Base UI** (ganador) | MIT (shadcn, Base UI) | Base UI 1.9.0 (2026-10-09), mensual; defecto de shadcn desde 2026-07 | JS puro; CSS por Tailwind compilado aparte | peer `^17 \|\| ^18 \|\| ^19` | +108 KB JS (+76 sin paneles ni `cn`) + ~7 KB CSS | Tabs, Tooltip, Dialog, ScrollArea, Autocomplete/Combobox propios; paneles via `react-resizable-panels` | variables propias en la raiz del chrome | WAI-ARIA, foco gestionado; flechas mueven foco y Enter activa (`activateOnFocus` falso por defecto) | pasa sin stubs |
| **shadcn/ui + Radix** (segundo) | MIT | `radix-ui` 1.8.1; ultimo push 2026-10-14, rafagas espaciadas; soportado por shadcn, no deprecado | igual | peer `^16.8 ... ^19` | +69 KB JS (+37 sin paneles ni `cn`) + ~7 KB CSS | Tabs, Tooltip, Dialog, ScrollArea; paleta con `cmdk` (sin release desde 2025-03) | igual | WAI-ARIA, el mas usado | pasa; `cmdk` pide `ResizeObserver` y `scrollIntoView` |
| shadcn/ui + React Aria Components | Apache-2.0 | 1.22.1 (2026-10), Adobe; base de shadcn desde 2026-07 (`--base aria`) | igual | peer `^16.8 ... ^19` | +81 KB JS (con paneles, sin `cn`) | Tabs, Tooltip, Modal/Dialog, Autocomplete + Menu/ListBox | igual | la mas completa (i18n, teclado, lectores) | pasa sin stubs |
| Ark UI (Zag) | MIT | 5.40.0 (2026-10), Chakra | igual | peer `>=18` | +70 KB JS (con paneles) | Tabs, Tooltip, Dialog, Combobox; tiene Splitter propio | igual; sin registro shadcn oficial | maquinas de estado Zag | no probado |
| Headless UI | MIT | 2.2.10 (2026-04), repo sin push desde 2026-04 | igual | peer `^18 \|\| ^19` | +87 KB JS (con paneles) | Tabs, Dialog, Combobox; sin Tooltip (Popover) | igual | buena en lo que cubre | no probado |
| Radix Themes (referencia) | MIT | 3.3.0; repo sin push desde 2026-04-11 | CSS propio importable por esbuild | ok | +60 KB JS + 80 KB CSS | Tabs, Tooltip, Dialog, ScrollArea; sin paleta | tokens propios `.radix-themes`; estetica fija | la de Radix | no probado |
| Mantine (referencia) | MIT | 9.8.1 (2026-11) | CSS propio (`styles.css`), PostCSS opcional | peer `^19.2` | +86 KB JS + 37 KB CSS | Tabs, Tooltip, Modal, Autocomplete, ScrollArea; Spotlight en `@mantine/spotlight` | tokens `--mantine-*`; estetica propia | buena | no probado |
| HeroUI v3 (referencia) | Apache-2.0 | 3.2.7 (2026-11) | requiere Tailwind v4 como peer | peer `>=19` | no medido (React Aria + estilos) | completo | tokens propios sobre Tailwind | la de React Aria | no probado |
| daisyUI (referencia) | MIT | 5.8.1 (2026-11) | plugin de Tailwind, solo CSS | n/a | solo CSS | clases para tabs, modal, tooltip; sin comportamiento JS | temas daisyUI | la pone el autor (sin foco gestionado ni ARIA) | n/a |

Motores de estilo:

| Motor | Licencia | Encaje con esbuild | Compatibilidad con shadcn | Nota |
|---|---|---|---|---|
| **Tailwind v4** (recomendado) | MIT | API de Node (`@tailwindcss/node` + `@tailwindcss/oxide`) o CLI; sin PostCSS | nativa | Oxide es binario nativo por plataforma con fallback `wasm32-wasi` |
| UnoCSS | MIT (npm) | `createGenerator` en JS puro o `@unocss/cli`; `preset-wind4` imita Tailwind 4 | parcial: no entiende `@theme inline` ni `@custom-variant` de shadcn | no aporta nada que Tailwind no de aqui |
| Panda CSS | MIT | CLI `panda codegen` / `cssgen`; carpeta `styled-system` generada; peer `postcss` | ninguna (Park UI es su equivalente) | mas piezas generadas que mantener |
| CSS a mano con variables | n/a | ya funciona (`chrome.tsx`) | ninguna | plan B si #177 no quiere Tailwind |

## Integracion en el build (propuesta)

1. Hoja de entrada en `packages/cli/navegador/chrome.css` (nombre a decidir):
   ```css
   @layer theme, base, components, utilities;
   @import "tailwindcss/theme.css" layer(theme);
   @import "tailwindcss/utilities.css" layer(utilities) source(none);
   @import "tw-animate-css";
   @import "shadcn/tailwind.css";
   @source "./";
   @theme inline { --color-background: var(--background); /* ... */ }
   .ui-chrome { --background: ...; --foreground: ...; --border: ...; --ring: ...; }
   @layer base { .ui-chrome *, .ui-chrome ::before, .ui-chrome ::after { box-sizing: border-box; border: 0 solid; margin: 0; padding: 0; } }
   ```
   `source(none)` + `@source` limita el escaneo a `navegador/`. Sin `preflight.css` (la doc oficial de Preflight muestra exactamente este patron de imports por capa para desactivarlo).
2. Un script de build (o un paso en `tsup`) llama a `compile` de `@tailwindcss/node` y al `Scanner` de `@tailwindcss/oxide`, minifica con `optimize` y deja el CSS como texto junto al JS (como ya hace `empaquetar` con el IIFE). Medido: 392 candidatos, 6 archivos, 33-38 KB min, 5.7-6.9 KB gzip, 32-66 ms. El CLI oficial produce el mismo resultado en 65 ms (`tailwindcss -i ... -o ... --minify`).
3. `dev.ts` sirve el CSS en `/app.css` o lo inlinea en `PAGINA`.
4. `pnpm test` ya corre `pnpm build` primero; una prueba puede afirmar que el CSS generado no contiene selectores sin alcance de Preflight (`*,:after,:before` fuera de `.ui-chrome`) ni reglas que toquen `.rd-*`.

Por que en build y no al arrancar `dev`: hoy `dev` empaqueta el JS en runtime con esbuild (dependencia de produccion de `cli`). Si el CSS tambien se compilara en runtime, `tailwindcss`, `@tailwindcss/node` y el binario nativo de Oxide pasarian a ser dependencias de produccion del CLI. Las clases del chrome no dependen del Workspace, asi que no hay razon para eso. Que el JS de la pagina tambien pase a build es otra decision, fuera de este ticket.

Dependencias que entrarian (todas MIT salvo `cva`, Apache-2.0): `@base-ui/react`, `react-resizable-panels`, `cn` (o `clsx` + `tailwind-merge`), `class-variance-authority`, `tw-animate-css`, y en devDependencies `tailwindcss`, `@tailwindcss/node`, `@tailwindcss/oxide`. Ojo: `shadcn/tailwind.css` vive en el paquete `shadcn`, que es el CLI completo (ts-morph, babel, postcss, MCP...); conviene copiar sus ~16 KB de CSS (variantes `data-open`, `data-closed`, etc.) al repo en lugar de depender del paquete. `lucide-react` (ISC) solo si se quieren sus iconos.

## Tokens frente a los Temas

- Tres capas de estilo distintas: (a) chrome de la UI (nuevo, tokens de shadcn), (b) chrome del lienzo de `shell` (`chrome.tsx`, derivado del Tema de la Vista con `--rd-*`) y (c) dibujo de `render` (Estilo resuelto del Tema, escopado por clase).
- El chrome de la UI no debe cambiar de aspecto al cambiar de Vista o de Tema: tokens fijos, claro y oscuro por `prefers-color-scheme` o la variante `dark` de shadcn. La galeria de Temas (#169) previsualiza el Tema en el lienzo, no en el chrome.
- Declarar los tokens en `.ui-chrome` y no en `:root`: las variables heredan y `:root` las pondria tambien dentro del lienzo y de las Capas `code`, donde un componente del Workspace podria leerlas por accidente. Los nombres no chocan con `--rd-*` hoy, pero el alcance evita depender de eso.
- Las utilidades de Tailwind son clases globales (`.flex`, `.p-2`); solo afectan a elementos que las llevan. Un componente `code` de un Tema que use, por ejemplo, `className="flex"` recibiria la utilidad del chrome. Mitigacion opcional: `prefix(ui)` en el import de utilidades (clases `ui:flex`); shadcn lo soporta via `tailwind.prefix` en `components.json`, a costa de clases mas largas.
- Preflight, si se importara entero, cambiaria el dibujo: `border:0 solid` vuelve solido el estilo de borde por defecto, `margin/padding:0` y `box-sizing` afectan a Capas `code`, `svg{display:block}` a iconos en linea, y `html{line-height:1.5}` lo heredan los Slots, porque `render` no fija `line-height` en su raiz. Recomendado ademas (ticket aparte, en `render`): fijar `line-height` en la raiz escopada del dibujo para no depender de la pagina anfitriona; vale tambien para slides, video y otros consumidores.

## Medicion

Directorio temporal fuera del repo (`/tmp/tw179`), sin tocar dependencias del repo. esbuild 0.28.1, `bundle`, `minify`, `format: 'iife'`, `platform: 'browser'`, `target: 'es2020'`, `charset: 'ascii'`, `legalComments: 'none'`, `jsx: 'automatic'`, `NODE_ENV=production`; gzip con `zlib.gzipSync` (nivel por defecto). Versiones: react/react-dom 19.3.0, @base-ui/react 1.9.0, radix-ui 1.8.1, cmdk 1.1.1, react-resizable-panels 4.24.1, cn 0.5.2, class-variance-authority 0.7.1, react-aria-components 1.22.1, @ark-ui/react 5.40.0, @headlessui/react 2.2.10, @radix-ui/themes 3.3.0, @mantine/core 9.8.1, tailwindcss 4.3.5.

| Bundle | min | gzip | delta gzip |
|---|---|---|---|
| React + react-dom (base) | 216.8 KB | 67.4 KB | 0 |
| Base UI (Tabs, Tooltip, Dialog, ScrollArea, Autocomplete) + paneles + `cn` + `cva` | 523.6 KB | 175.1 KB | +107.7 |
| Base UI + `cmdk` en vez de Autocomplete (el `command` de shadcn base-nova) | 517.5 KB | 172.7 KB | +105.3 |
| Radix (Tabs, Tooltip, Dialog, ScrollArea) + `cmdk` + paneles + `cn` + `cva` | 414.5 KB | 136.0 KB | +68.6 |
| React Aria Components (Tabs, Tooltip, Modal, Autocomplete, Menu, ListBox) + paneles | 469.1 KB | 148.1 KB | +80.7 |
| Ark UI (Tabs, Tooltip, Dialog, Combobox) + paneles | 436.6 KB | 137.6 KB | +70.2 |
| Headless UI (Tabs, Popover, Dialog, Combobox) + paneles | 491.9 KB | 154.7 KB | +87.3 |
| Radix Themes (JS) + paneles | 401.4 KB | 127.7 KB | +60.3 |
| Radix Themes `styles.css` | 677.5 KB | 79.5 KB | (CSS) |
| Mantine (JS) + paneles | 487.3 KB | 153.0 KB | +85.6 |
| Mantine `styles.css` | 250.6 KB | 36.6 KB | (CSS) |
| Base UI minimo (Tabs, Tooltip, Dialog, Autocomplete) | 434.0 KB | 143.0 KB | +75.6 |
| Radix minimo (Tabs, Tooltip, Dialog) + `cmdk` | 324.3 KB | 104.6 KB | +37.2 |
| solo `react-resizable-panels` | 265.4 KB | 83.2 KB | +15.8 |
| solo `cn` + `cva` | 244.7 KB | 79.0 KB | +11.6 |
| CSS Tailwind de 6 componentes shadcn base-nova, con Preflight | 37.7 KB | 6.9 KB | (CSS) |
| idem, sin Preflight | 33.3 KB | 5.7 KB | (CSS) |

Desglose con `metafile` (min, sin gzip) del set Base UI: `@base-ui/react` 186 KB, `react-resizable-panels` 48 KB, `cn` 27 KB (lleva compilada la logica de `tailwind-merge`), `@base-ui/utils` 17 KB, `@floating-ui/*` 20 KB. El delta exacto en la pagina de `dev` sera algo menor porque React ya esta en el bundle del visor; la cifra base de React se resta arriba. Las entradas usan cada componente una vez; un chrome real anadira codigo propio, no mas libreria (salvo Select, Menu, etc. si se usan).

Pruebas en jsdom (vitest 4.1.12, jsdom 30, Testing Library React 16, user-event 14), las 6 en verde:

- Base UI: flechas en Tabs mueven el foco al siguiente Tab y Enter lo activa; Dialog abre con `role="dialog"` y nombre accesible por `Dialog.Title`; Autocomplete filtra opciones (`role="option"`); Escape cierra; Tooltip aparece con el foco por Tab. Sin stubs.
- Radix + `cmdk`: flechas activan el Tab (activacion automatica); Dialog + `cmdk` filtran y Escape cierra; Tooltip con foco. Necesita stubs de `ResizeObserver` y `Element.prototype.scrollIntoView`.
- React Aria Components: Tabs con flechas y Modal/Dialog con Escape. Sin stubs.
- `react-resizable-panels`: monta con `role="separator"` y `tabindex="0"`, pero mover el separador con teclado lanza "Previous layout not found" porque jsdom no da medidas; esa prueba va a Playwright (ya devDependency de la raiz, research `capturas-visuales`).

## Fuentes

- Tailwind CSS, instalacion con el CLI (v4, `@import "tailwindcss"`, `@tailwindcss/cli`, binario standalone): https://tailwindcss.com/docs/installation/tailwind-cli
- Tailwind CSS, Preflight (reglas y como desactivarlo con imports por capa): https://tailwindcss.com/docs/preflight
- Tailwind CSS, deteccion de clases (`source(none)`, `@source`, `node_modules` excluido): https://tailwindcss.com/docs/detecting-classes-in-source-files
- Tailwind CSS, compatibilidad (Chrome 111, Safari 16.4, Firefox 128; sin preprocesadores; CSS modules desaconsejados): https://tailwindcss.com/docs/compatibility
- API de Node verificada en los tipos publicados: `@tailwindcss/node` 4.3.5 (`compile`, `optimize`, `CompileOptions`) y `@tailwindcss/oxide` 4.3.5 (`Scanner`, binarios opcionales por plataforma y `oxide-wasm32-wasi`).
- shadcn/ui, theming (tokens, `oklch`, `@theme inline`, `.dark`): https://ui.shadcn.com/docs/theming
- shadcn/ui, instalacion manual (`cn`, `tw-animate-css`, `shadcn/tailwind.css`, `components.json` con `style: base-nova`): https://ui.shadcn.com/docs/installation/manual
- shadcn/ui, changelog "Base UI as the Default" (2026-07; Radix no se depreca, `-b radix`): https://ui.shadcn.com/docs/changelog/2026-07-base-ui-default
- shadcn/ui, changelog "React Aria" (2026-07; `init --base aria`): https://ui.shadcn.com/docs/changelog/2026-07-react-aria
- shadcn/ui, registro de componentes base-nova (dependencias e imports reales): `https://ui.shadcn.com/r/styles/base-nova/{command,resizable,tabs,tooltip,dialog,button}.json`; `command` depende de `cmdk` tambien en base-nova.
- Base UI, releases (1.0.0 el 2025-12-11; 1.9.0 el 2026-10-09): https://base-ui.com/react/overview/releases
- Repos y licencias (API de GitHub, 2026-11-19): `radix-ui/primitives` MIT, `mui/base-ui` MIT, `shadcn-ui/ui` MIT, `pacocoursey/cmdk` MIT (ultimo commit de codigo 2025-08, release 2025-03-14), `bvaughn/react-resizable-panels` MIT, `tailwindlabs/tailwindcss` MIT, `adobe/react-spectrum` Apache-2.0, `chakra-ui/ark` MIT, `tailwindlabs/headlessui` MIT, `radix-ui/themes` MIT, `mantinedev/mantine` MIT, `heroui-inc/heroui` Apache-2.0, `saadeghi/daisyui` MIT, `chakra-ui/panda` MIT.
- Versiones, licencias y peerDependencies: `npm view` del 2026-11-19 para cada paquete de la tabla.
- `esbuild-plugin-tailwindcss` 2.2.0 (terceros): depende de `@tailwindcss/postcss`, `postcss`, `autoprefixer` y `postcss-modules` (`npm view ... dependencies`).

## No verificado

- HeroUI v3 y Ark UI en jsdom, y el peso de HeroUI: no medidos.
- El efecto real de `line-height` heredado sobre los Slots del lienzo: deducido de que `hoja.ts` no lo fija; no se probo en navegador.
- Rendimiento de Base UI frente a Radix en listas largas (indice de Vistas): sin cifras; ninguna de las dos virtualiza.
- Si `react-resizable-panels` cubre "ocultar del todo con Ctrl+B / Ctrl+J y dejar una pestana en el borde" (#169) sin codigo propio: tiene `collapsible` y API imperativa de colapsar, pero los atajos y la pestana vertical son trabajo propio en cualquier opcion.
