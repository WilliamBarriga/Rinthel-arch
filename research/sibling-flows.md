# Sibling flows: slides-rinthel, video-openmotion, json-renderer

Ticket: t04. Sources are local repos (read directly, not modified). Paths are relative to `/rinthel-disk/`. Date: 2026-10-03.

## TL;DR

- Los tres consumen React como "codigo/spec -> DOM"; ninguno tiene hoy nocion de diagrama. Un componente `<Diagram>` React puro encaja en los tres, con distinto grado de friccion.
- Slides: pagina = componente React 1920x1080 fijo; el diagrama debe ser estatico/autocontenido, con reveal via `<Steps>`. Regla dura "no anadir dependencias" -> hay que resolver como se instala el paquete.
- Video: el tiempo es funcion del frame (`useCurrentFrame`); el diagrama debe aceptar una prop de progreso/frame y ser determinista (sin rAF/CSS transitions/estado temporal interno).
- json-render: catalogo Zod + spec plano (`root` + `elements`) + registry; un diagrama encaja como un componente de catalogo o como un schema propio (`defineSchema`). Exige React 19 y Zod 4, mientras slides y openmotion usan React 18.
- Implicacion: nucleo React puro, sin reloj propio, con control externo de paso/progreso y tamano; nada de hover/zoom como unico canal de informacion.

## 1. slides-rinthel (open-slide)

### Estructura
- Workspace pnpm; deps: `@open-slide/core ^1.17.1` (instalado 1.19.1), `react ^18.3.1`, `vite ^5` (`slides-rinthel/package.json`; version instalada en `slides-rinthel/node_modules/@open-slide/core/package.json`).
- Una slide = `slides/<kebab-id>/index.tsx` + `assets/` opcional. `export default` = array no vacio de componentes `Page` sin props; `export const meta: SlideMeta`; `export const design: DesignSystem` opcional (`slides-rinthel/.agents/skills/slide-authoring/SKILL.md`, "File contract").
- Temas: markdown en `themes/<id>.md` (+ `.demo.tsx`): `tema-cyberpunk|dark|free|light`. `tema-cyberpunk.md` copia la paleta canonica de `otro repo` (bg `#0d0221`, text `#7cfcff`, accent `#ea00d9`).
- Assets globales via alias `@assets/...` (`assets/`), locales via import relativo.

### Reglas duras (AGENTS.md + skill slide-authoring)
- No tocar `package.json`, `open-slide.config.ts` ni otras slides. No anadir dependencias: solo `react`, `@open-slide/core`, web APIs.
- Una slide es un solo `index.tsx`: prohibidos `.tsx/.ts` hermanos y `components/`. Helpers van dentro del `index.tsx`.
- Canvas fijo 1920x1080; px absolutos; sin scroll (lo que desborda se recorta); padding 100-160 px; cuerpo >= 28 px.
- Elementos repetidos: componente explicito por instancia, no `array.map` (el inspector edita el JSX fuente; un `map` es una sola ubicacion).
- `open-slide.config.ts` solo expone `base, slidesDir, themesDir, assetsDir, port, allowedHosts, locale, build` (`node_modules/@open-slide/core/dist/config-CDHB8Oow.d.ts`). No hay hook para alias de Vite ni plugins.

### Dev loop y build
- `pnpm dev` = `open-slide dev` (Vite, hot reload, rail de miniaturas, `F` fullscreen); `pnpm build` = bundle estatico; `pnpm preview`; `sync:skills` actualiza skills gestionadas por el core (`README.md`, `package.json`).
- Inspector (`@slide-comment`) y panel Design editan el fuente por AST: el `design` const tiene restricciones de formato (`references/design-system.md`).

### Primitivas relevantes
- `<Steps>/<Step>`: reveal por pasos; `Step` debe ser hijo directo de `Steps`; saltar via overview muestra todo revelado (`references/steps.md`). La skill recomienda mostrar un diagrama entero salvo que el orden sea el punto.
- `SlideTransition` y `MorphElement` (mismo `id` en dos paginas, geometria determinista en px, sin `transform` en el nodo, `useIsActivePage()`) (`references/morph.md`).
- `useSlidePageNumber()`, `ImagePlaceholder`.
- `slides/propuesta/index.tsx` usa `<Steps>`; no hay SVG de diagrama en los decks actuales.

### Puntos de integracion para un componente de diagrama
1. Componente importado en `index.tsx`: `<Diagram model view width height />` dimensionado en px, sin `vw/rem`, sin scroll interno.
2. Reveal: aceptar `step`/`revealed` (ids o indices). Como `Step` solo difiere hijos directos, la API de pasos debe ser composicional (sub-componentes por grupo) o controlada. No verificado si el core exporta un hook del step actual (no aparece en la skill; no se leyo `src/app`).
3. Tema: mapear tokens `var(--osd-*)` / paleta del tema al tema del diagrama (objeto de tema o CSS variables).
4. Morph overview -> detalle: viable si los nodos tienen geometria determinista en px (misma exigencia que layout con pins). Util para drill-down.
5. Via sin dependencia: exportar SVG estatico e importarlo como asset (`import img from './assets/x.svg'`); pierde interactividad (zoom/pan no tiene sentido en play mode).
- Friccion: la regla "sin deps / un solo archivo" choca con consumir un paquete `rinthel-arch`; requiere decision de Tarkark (dep de workspace permitida, vendorizar, o SVG como asset).

## 2. video-openmotion (OpenMotion)

### Estructura
- Monorepo pnpm+turbo: `packages/{core,components,renderer,cli,encoder}`, `examples/showcase`, `projects/{demo-template,proyecto-video}` (`video-openmotion/AGENTS.md`, `package.json`).
- Un proyecto de video = app Vite+React 18 (`projects/proyecto-video`): `src/App.tsx` define `CompositionProvider config={{width,height,fps,durationInFrames}}` + `<Sequence from durationInFrames>` por escena; una `Scene*.tsx` por escena; `components/` compartidos (`CyberpunkUI.tsx`, `CyberpunkBackground.tsx`). Alias de Vite a `packages/core/src/index.tsx` (`vite.config.ts`).
- `proyecto-video` ya es arquitectura animada: 7 escenas x 180 frames a 30 fps, 1280x720, flechas/puntos hechos a mano con `<svg>`, `<path>`, `strokeDasharray` e `interpolate` (`SceneServices.tsx`, `SceneClient.tsx`, `components/CyberpunkUI.tsx`). Cajas posicionadas con porcentajes de `width/height` hardcodeados: justo lo que un diagrama declarativo reemplazaria.

### Modelo de tiempo y render
- `useCurrentFrame()` es local a la `Sequence`; `interpolate`, `spring`, `Easing`; `delayRender/continueRender` para esperas asincronas (`packages/core/src/index.tsx`).
- Render: `open-motion render -u <url> -o out.mp4 --duration <frames> --width --height --fps` captura con Playwright/Chromium headless frame a frame y luego ffmpeg (`packages/renderer/src/index.ts`, AGENTS.md). Por frame inyecta `window.__OPEN_MOTION_FRAME__` y dispara `open-motion-frame-update`; espera `__OPEN_MOTION_READY__` y `__OPEN_MOTION_DELAY_RENDER_COUNT__ === 0`.
- Time hijacking (`getTimeHijackScript`): sustituye `Date`, `performance.now`, `requestAnimationFrame` por versiones fijadas al frame. Consecuencia: rAF, `setInterval`, CSS transitions/animations o transiciones de d3 no son deterministas en render; todo movimiento debe ser funcion pura del frame.
- Salidas: mp4, webm (transparente), gif, webp. Trampas de entorno (AGENTS.md): `NODE_ENV=development` al instalar, ffmpeg en `/data/home/ffmpeg/bin`, proyectos usan npm (no pnpm), construir paquetes en orden core -> encoder -> renderer -> cli, dev server via `pi-processes`.

### Puntos de integracion para un componente de diagrama
1. Prop `progress` o `frame` (0..1 o frame) en vez de reloj interno; la escena calcula `interpolate`/`spring` y lo pasa. Revelado paso a paso = lista ordenada de pasos + progreso -> opacidad / `strokeDashoffset`.
2. Layout sincrono y determinista (posiciones precomputadas en el modelo/pins); un layout async (p.ej. ELK) debe resolverse antes o envolverse en `delayRender/continueRender`.
3. Camara: zoom/pan como transformacion controlada (`viewBox`/`transform` en funcion del frame) para recorrer un diagrama gigante; un `Sequence` por escena = un paso de drill-down.
4. Tamano: pixeles de `useVideoConfig()` (hoy 1280x720, no 1920x1080); el componente escala por props.
5. React 18.3 en openmotion: el nucleo debe soportar React 18.
6. Hoy ningun video consume spec; es consumidor futuro segun `map.md`.

## 3. json-renderer (json-render, Vercel Labs)

### Estructura
- Monorepo pnpm+turbo, Apache-2.0; paquetes `@json-render/*` con misma version (`packages/core/package.json`); ~35 paquetes: `core`, `react`, `vue`, `svelte`, `solid`, `shadcn`, `remotion`, `image`, `react-pdf`, `react-email`, `ink`, `react-three-fiber`, `mcp`, `yaml`, devtools, adaptadores de estado (`README.md`). Skills por paquete en `skills/*/SKILL.md`. `AGENTS.md` es de contribucion al repo, no de uso. `json-render-learning/MISSION.md` fija v0.21.0.
- Peer deps: `@json-render/react` requiere React ^19.2.3; `core` zod ^4; `remotion` requiere `remotion ^4` (no OpenMotion) (`packages/*/package.json`).

### Modelo (catalogo -> spec -> registry)
- `defineCatalog(schema, { components: { X: { props: z.object(...), description, slots? } }, actions })`; `catalog.prompt()` genera el prompt para el agente. Schema de `@json-render/react`: spec plano `{ root, elements: { key: { type, props, children, slots?, visible?, repeat? } } }` (`packages/react/src/schema.ts`).
- `defineRegistry(catalog, { components })` + `<Renderer spec registry />` (`packages/react/src/renderer.tsx`).
- Props dinamicas: `$state`, `$bindState`, `$bindItem`, `$cond`, `$template`, `$computed`; `visible` y `repeat` (`skills/core/SKILL.md`).
- Validacion: `validateSpec`, `autoFixSpec`, `formatSpecIssues` (`packages/core/src/spec-validator.ts`; issues como missing_root, missing_child, orphaned_element). Streaming: SpecStream JSONL con patches (`createSpecStreamCompiler`). El bucle agente -> validacion -> correccion ya esta soportado.
- `defineSchema` permite schemas propios: el de remotion define `composition/tracks/clips`, no `root/elements` (`packages/remotion/src/schema.ts`).

### Otros renderers (referencia)
- `@json-render/image`: spec -> SVG/PNG con Satori (`renderToSvg`, `renderToPng`, resvg opcional) (`packages/image/README.md`). Satori soporta un subconjunto de CSS; si admite SVG anidado no se verifico.
- `@json-render/remotion`: `TimelineSpec` (composition, tracks, clips con `from/durationInFrames/motion/transitions`) para Remotion. Fit con OpenMotion no verificado (igual en `json-render-learning/NOTES.md`).

### Puntos de integracion para un componente de diagrama
1. Componente de catalogo `Diagram`: `props: z.object({ source, view, ... })`. Pro: reutiliza `catalog.prompt()`, streaming, devtools. Contra: la Fuente canonica entera viaja en un prop; Zod 4 para describirla.
2. Schema propio via `defineSchema`: `entities`, `relations`, `views` como spec (en vez de `elements`); permite streaming por patches de entidades/relaciones y validador propio. Mas trabajo, pero encaja con "un modelo, varias vistas".
3. Si la Fuente canonica se define como esquema Zod 4, sirve a la vez para validacion, JSON Schema para agentes y para el catalogo de json-render. Decidir en el ticket de Fuente canonica.
4. Entidades como elementos del spec plano son naturales (referencias por clave), pero las aristas no tienen equivalente nativo (`children` es arbol).
- Friccion: React 19 vs 18 de los otros dos; json-render no es dependencia de los demas repos hoy.

## 4. json-render-learning (contexto)
- Mision: evaluar json-render para pithagoras (React 18, Vite, Tailwind 3, react-router 7) (`MISSION.md`).
- `NOTES.md` (2026-09-27): idea de aplicar json-render a open-motion y open-slide, hoy "el agente escribe codigo, no un spec"; fuera de mision; sin verificar fit del schema de remotion con OpenMotion. Preferencia de Tarkark: ejercicios que dibujan el resultado.

## 5. Comparacion

| Aspecto | open-slide | OpenMotion | json-render |
|---|---|---|---|
| Unidad | `Page` en `index.tsx` | `Scene` en `Sequence` | `element` en spec plano |
| Canvas | 1920x1080 fijo | `useVideoConfig()` (hoy 1280x720) | libre (DOM) |
| Tiempo | pasos manuales (`Steps`) | frame, determinista | estado/streaming |
| Autoria agente | edita TSX | edita TSX | emite spec JSON/JSONL |
| React | 18.3 | 18.3 | 19.2+ |
| Dev | `open-slide dev` (Vite) | Vite + CLI Playwright | app propia / Next |
| Salida | HTML estatico | mp4/webm/gif/webp | UI / SVG,PNG (image) |
| Deps nuevas | prohibidas por regla | npm en proyectos | zod 4 |

## 6. Requisitos que se derivan para `rinthel-arch`
1. Nucleo React puro sin reloj propio; props: `model/view`, `width/height` en px, `theme`, `step|progress`, `camera` (viewBox). Sin hover/tooltips como unico canal.
2. Layout determinista y sincrono (o precomputado en la fuente con pins), para video y para morph de slides.
3. Compatible con React 18 y 19; sin dependencia de Next/Tailwind.
4. Export SVG/PNG estatico como via de menor friccion (slides sin deps; video como frame; json-render image).
5. Fuente canonica idealmente en Zod 4 para compartir validacion y catalogo con json-render.
6. Tematizacion por tokens (paleta de `themes/tema-cyberpunk.md`, CSS vars `--osd-*`).

## 7. Preguntas abiertas / no verificado
- Como entregar el paquete a slides-rinthel respetando "no deps / un solo index.tsx".
- Si `@open-slide/core` exporta un hook del step actual (no leido `src/app`).
- Si Satori (`@json-render/image`) renderiza SVG anidado.
- Fit de `@json-render/remotion` con OpenMotion.
- No se ejecuto ningun repo; todo es lectura de fuente/docs locales.
