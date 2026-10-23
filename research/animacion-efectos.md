# Research: animacion y efectos en navegador, CSS/WAAPI vs librerias (ticket #9)

Fecha: 2026-10-23. Mapa #7 (Sistema de Temas expresivo). Fuentes primarias (MDN, docs oficiales, npm, repos). Lo no verificado se marca **[no verificado]**.

## Pregunta
Comparar CSS/WAAPI nativo con librerias (Motion, GSAP, anime.js, otras) para animacion declarativa de Nodos y Aristas (flujo, pulso, entrada/salida, hover) y efectos: licencia, mantenimiento, tamano, encaje con React 18/19, soporte de `prefers-reduced-motion`.

## Recomendacion
1. **Base: CSS + WAAPI nativos, sin dependencia.** Cubren flujo, pulso, entrada/salida y hover de forma declarativa, son Baseline y el Tema puede emitirlos como CSS/keyframes (encaja con el render hibrido HTML/CSS + SVG).
2. **Reduced-motion**: se resuelve en el nucleo con `@media (prefers-reduced-motion: reduce)` y `matchMedia` para WAAPI; no requiere libreria.
3. **Libreria solo en la via "con codigo"** (componentes React del Tema): **Motion** (MIT, peer React 18/19) si se necesita orquestacion, layout animations o salida con `AnimatePresence`. No como dependencia del nucleo. Adoptarla requiere ticket/ADR propio.
4. **Descartar GSAP** como dependencia del nucleo (licencia propia "no charge", no OSI) y **anime.js** como innecesario (sin integracion React propia). react-spring y auto-animate no aportan sobre las opciones anteriores.

## Resumen

| Opcion | Licencia | Mantenimiento (2026-10-23) | Tamano | React 18/19 | Reduced-motion |
|---|---|---|---|---|---|
| CSS + WAAPI | Estandar web | n/a | 0 KB | Agnostico | `@media` nativo; WAAPI via `matchMedia` |
| Motion (`motion` 14.6.0) | MIT | push 2026-10-23, publicado 2026-10-22, 34k estrellas | `motion` 43 KB; `m`+LazyMotion ~5 KB + 24 KB (`domAnimation`); `useAnimate` mini 3.3 KB, hybrid 23 KB | peer `react ^18 \|\| ^19` | `MotionConfig reducedMotion="user"`, hook `useReducedMotion` |
| GSAP (3.15.0) | "Standard 'no charge' license" (propia) | ultima publicacion 2026-04-13 | `gsap.min.js` 28.3 KB gzip (medido localmente) | `@gsap/react` (`useGSAP`); doc menciona React 18, no React 19 | Sin soporte propio verificado; `gsap.matchMedia()` **[no verificado]** |
| anime.js (`animejs` 4.5.0) | MIT | push 2026-08-21, 74k estrellas | completo 24.5 KB; Animation 5.2, WAAPI 3.5, Timeline 0.55, SVG 0.35, Scope 0.22 | Sin integracion React; `Scope` para media queries/root | Via `Scope` + media queries; sin soporte dedicado documentado |
| react-spring (`@react-spring/web` 10.1.2) | MIT | push 2026-10-23 | 56 KB desempaquetado (npm) | peer `^16.8 .. ^19` | **[no verificado]** |
| auto-animate (0.10.0) | MIT | publicado 2026-07-10 | 59 KB desempaquetado (npm) | agnostico | **[no verificado]** |

Los tamanos no son comparables entre filas (cada fuente mide distinto); sirven como orden de magnitud.

## CSS y WAAPI nativos
- `stroke-dashoffset` es animable (Baseline desde 2017); sirve para dibujar una Arista (`pathLength="100"` + `stroke-dasharray`/`stroke-dashoffset`) y para flujo continuo (guiones que avanzan con `animation: ... linear infinite`). https://developer.mozilla.org/en-US/docs/Web/CSS/stroke-dashoffset
- `offset-path: path()` + animar `offset-distance` mueve un elemento (particula/pulso) a lo largo de una ruta; Baseline "widely available" desde marzo 2022. https://developer.mozilla.org/en-US/docs/Web/CSS/offset-path
- Entrada/salida: `@starting-style` (Baseline 2024, "newly available") da el estado inicial al aparecer desde `display: none`; `transition-behavior: allow-discrete` permite transicionar `display`/`overlay`. Riesgo: navegadores anteriores a agosto 2024. https://developer.mozilla.org/en-US/docs/Web/CSS/@starting-style
- WAAPI: `Element.animate()` devuelve un objeto `Animation`; `KeyframeEffect` describe keyframes y timing; `getAnimations()` lista animaciones activas; `Animation.finished` es una Promise. Da control programatico (pausa, reversa, secuencia por Pasos de revelado) sin libreria. https://developer.mozilla.org/en-US/docs/Web/API/Web_Animations_API (`composite` y tabla de soporte: **[no verificado]** en esa pagina).
- Reduced-motion: `@media (prefers-reduced-motion: reduce)` es Baseline "widely available" desde enero 2020; MDN muestra sustituir movimiento por un fundido. https://developer.mozilla.org/en-US/docs/Web/CSS/@media/prefers-reduced-motion
- Limites: orquestacion compleja (stagger, timelines con dependencias) y animacion de layout (mover Nodos tras un re-layout) se escriben a mano; no hay equivalente nativo a las layout animations de Motion.

## Motion
- Paquete `motion` 14.6.0, MIT, depende de `framer-motion` 14.6.0 y `tslib`; peer deps `react ^18.0.0 || ^19.0.0` (`npm view motion`). Repo https://github.com/motiondivision/motion (MIT, activo).
- API declarativa: `animate`/`initial`, variants con orquestacion (`delayChildren`, `stagger()`), `AnimatePresence` + `exit` para salida, props `whileHover/whileTap/whileFocus/whileInView`, animacion de `offsetDistance` sobre `offset-path`. https://motion.dev/docs/react-animation
- Tamano: componente `motion` 43 KB; `m` con `LazyMotion` ~5 KB inicial + 24 KB (`domAnimation`) o 38 KB (`domMax`); `useAnimate` mini 3.3 KB, hybrid 23 KB. https://motion.dev/docs/react-reduce-bundle-size
- Reduced-motion: `MotionConfig reducedMotion="user"` desactiva animaciones de transform y layout pero mantiene opacidad y color; `"always"`/`"never"` fuerzan; `useReducedMotion` devuelve el booleano. https://motion.dev/docs/react-accessibility
- Encaje: es la unica opcion con modelo declarativo en React (estado -> animacion) comparable al del Tema. Costo: dependencia de runtime en la capa React del Tema y 5-43 KB de bundle.

## GSAP
- npm `gsap` 3.15.0, ultima publicacion 2026-04-13; campo `license`: "Standard 'no charge' license: https://gsap.com/standard-license"; cabeceras del codigo: "Subject to the terms at https://gsap.com/standard-license". Licencia propia, no OSI. El sitio indica "GSAP is now free for everyone, thanks to Webflow's support" (https://gsap.com). No pude leer el texto de las restricciones (la pagina de licencia no devolvio contenido): **[no verificado]** si hay clausulas contra herramientas competidoras.
- React: `@gsap/react` con `useGSAP()` (reemplazo de `useEffect`, revierte con `gsap.context()`, `contextSafe` para handlers). La pagina oficial solo discute React 18 y strict mode; React 19 **[no verificado]**. https://gsap.com/resources/React/
- Implicacion: un proyecto abierto cuyo nucleo dependiera de GSAP heredaria una licencia no OSI. Es imperativo, no declarativo.

## anime.js
- `animejs` 4.5.0, MIT, 74k estrellas, ultimo push 2026-08-21. Modular (subpaths `./svg`, `./scope`, ...). https://github.com/juliangarnier/anime
- Tamano: 24.5 KB completo; Animation 5.2 KB, WAAPI 3.5 KB, Timeline 0.55 KB, SVG 0.35 KB (morph, line drawing, motion paths), Scope 0.22 KB. https://animejs.com/documentation/getting-started/introduction
- Esa pagina no menciona React ni reduced-motion; `peerDependencies` solo `three`/`@types/three`. Es imperativo; aporta poco sobre CSS/WAAPI para este caso.

## Otras
- react-spring `@react-spring/web` 10.1.2: MIT, peer React hasta 19, activo; fisica de resortes, no modelo de keyframes ni flujo de Aristas. https://github.com/pmndrs/react-spring
- `@formkit/auto-animate` 0.10.0: MIT; animaciones de altas/bajas/reordenes de listas; no cubre flujo/pulso/hover. https://github.com/formkit/auto-animate
- Reduced-motion de ambos: **[no verificado]**.

## Notas para el ADR del Tema
- Un Tema declarativo puede compilar a: keyframes CSS (pulso, flujo, hover), WAAPI (Pasos de revelado, secuencias controladas) y `@starting-style` (entrada/salida). Reduced-motion se aplica en un unico punto (media query + `matchMedia`).
- Pendiente de decision (fuera de este research): politica exacta de reduced-motion por tipo de animacion; si Motion se admite en la via "con codigo" como peer opcional y no como dependencia del nucleo.
- Verificar en prototipo: rendimiento de muchas Aristas con `stroke-dashoffset` infinito en SVG (sin cifras oficiales; **[no verificado]**).
