# Demo estatica y export HTML autocontenido

Ticket: #214 (mapa #211, "Rinthel-arch atractivo"). Fecha: 2026-11-24.

Pregunta: que hace falta para producir un sitio estatico navegable de un Workspace (Vistas, Temas, Pasos, sin servidor de `dev`) a partir de `render` y `estudio`: que partes dependen hoy del servidor, tamano del bundle, si cabe en un solo HTML autocontenido para mandar a cualquiera, y como publicar la demo en GitHub Pages sin GitHub Actions.

## Conclusion

- **Si cabe en un solo HTML autocontenido**, y el ADR 0003 ya lo habia previsto ("El HTML exportado lleva ambos: el Worker como texto que la pagina arranca via Blob, o ejecuta en el hilo principal si el navegador no deja crear el Worker"). Para el ejemplo `examples/rinthel-arch` (29 Vistas, 14 Temas, 10 familias de fuentes) el archivo saldria de unos **4.7-7 MB sin comprimir** y unos **2-2.5 MB con gzip**; el grueso son fuentes y ELK, no nuestro codigo.
- **Lo que depende del servidor es solo el transporte**: `navegador/cliente.ts` es la unica pieza con rutas y `Estudio` recibe `fetch` y `eventos` inyectados. Vistas, Pasos, drill-down, `link`, colapso, Seleccion y zoom semantico corren ya en el cliente (`shell` + `canonico`). Lo que de verdad necesita `dev` (Node + `sesion`) es: editar, deshacer/rehacer, Historial, feed del agente, Diferencias, `inspect` (Detalle, Buscador, salto a codigo), `fix` de issues y la Geometria con `?tema=` de la galeria.
- **ELK tiene que ir dentro** (~440 KB gzip). Sin ELK solo se ve el estado por defecto de cada Vista con su Tema declarado; colapsar o expandir un Grupo, cambiar de Tema y, sobre todo, **cualquier Tema con fuentes propias** relayoutan: `useGeometria` (`packages/shell/src/geometria.ts:99`) descarta la Geometria del `build` en cuanto hay medidas reales de texto, y las hay siempre que el visor recibe `fontFiles` + `fontUrl`. La Geometria de `build` sirve como primer dibujo solo para Temas sin fuentes de archivo.
- **Recomendacion**: un comando `diagrams export --workspace <ruta> --out <archivo.html>` en `cli` (unico paquete que lee el disco) que escribe un HTML con todo inline: CSS, un JS de visor IIFE sin `splitting`, el Worker de layout como texto (Blob, con respaldo en hilo principal), y un `<script type="application/json">` con la Fuente canonica, iconos, Geometrias del `build`, fuentes como `data:` URL y, si hay, el bundle de Componentes con codigo. Del lado del navegador, una entrada nueva en `estudio` (`navegador/estatico.tsx`) de solo lectura: o un visor minimo (`VistaInteractiva` con `chrome` + indice de Vistas + selector de Tema; medido en 144 KB gzip sin zod, 237 KB con zod) o el marco del estudio con un `ClienteDeDev` de solo lectura sobre los datos embebidos (~290 KB gzip de carga inicial hoy, sin el editor). Lo segundo luce mas en una demo de lanzamiento; lo primero es el export "para mandar a cualquiera". Elegir en el ticket de spec (#223).
- **GitHub Pages sin workflow propio: rama `gh-pages` huerfana empujada desde local**, con `.nojekyll`, fuente de publicacion "Deploy from a branch" `gh-pages` / `(root)`. El sitio es el mismo HTML exportado como `index.html` (uno por ejemplo si se quiere galeria). Se descarta `docs/` en `main`: mezclaria artefactos derivados con las guias y Pages renderizaria los `.md` con Jekyll. Matiz: segun la documentacion de GitHub, incluso publicando desde una rama "your GitHub Pages site will always be deployed with a GitHub Actions workflow run"; es el flujo gestionado por GitHub (`pages-build-deployment`), no un archivo en `.github/workflows/`, asi que no choca con la regla "no agregar workflows", pero conviene que la decision lo diga en voz alta.

## Contexto del repo (verificado en codigo)

### Que toca al servidor de `dev`

- Rutas (`packages/canonico/src/dev.ts:19`, `RUTAS_DE_DEV`): `/api/estado`, `/eventos` (SSE), `/api/archivos`, `/api/archivo/`, `/api/edit`, `/api/deshacer`, `/api/rehacer`, `/api/historial/saltar`, `/api/confiar`, `/api/codigo`, `/componentes.js`, `/api/inspect/`, `/api/vista/`, `/fuentes/`. Eventos SSE: `estado`, `actividad`, `diferencia`, `historial` (`EVENTOS_DE_DEV`, linea 251).
- `packages/estudio/navegador/cliente.ts` es la unica pieza que conoce esas rutas y nunca lanza. `Estudio` (`navegador/estudio.tsx:27`) recibe `fetch`, `eventos`, `hash`, `layout` y `confirmar` por props: un modo estatico puede inyectar un `fetch` que responda los `GET` desde datos embebidos y un `eventos` que no emita nada, igual que hace `devEnMemoria` en las pruebas. Las rutas son absolutas (`/api/...`, `/_estudio/worker.js` en `dev.tsx:22`, `/fuentes/...` via `urlDeFuente` en `lienzo/lienzo.tsx:60`): servidas bajo un subpath de Pages (`/Rinthel-arch/`) se romperian; un HTML unico sin `fetch` lo evita.
- Uso del cliente por feature (grep de `cliente.*` en `navegador/`):

| Feature | Necesita | En estatico |
|---|---|---|
| Lienzo, Pasos, colapso, `link`, migas | `estado` (Fuente canonica, iconos, fuentes) y Geometria por Vista | Embebido; relayout con ELK local |
| Indice de Vistas | `estado.vistas` | Embebido |
| Galeria de Temas (previsualizar) | `geometria(vista, { tema })` del servidor; si no llega en 4 s la calcula el Worker (`cliente.ts`, `PLAZO_DE_GEOMETRIA_MS`) | Directo al Worker local |
| Detalle, Buscador, abrir codigo | `inspeccionar` (`sesion`, Node) | Fuera, o `inspect` precalculado (costoso: uno por Nodo) |
| Editor, `fix`, Escritura, deshacer/rehacer, Historial | `POST` y `archivo(s)` | Fuera (solo lectura) |
| Agente, Diferencias | SSE `actividad`, `diferencia` | Fuera |
| Componentes con codigo | `codigo`, `confiar`, `bundleDeComponentes` | Embebido: quien exporta es el autor; el bundle ya lo compila `cli/src/codigo.ts` |

- Los Gestos ya se apagan solos cuando `motivoSinGestos` no es `undefined` (`marco/proveedores.tsx:81`, `lienzo/lienzo.tsx:66`); un modo de solo lectura puede reutilizar ese corte.
- `packages/sesion` (Langium, compilacion) no entra al navegador (ADR 0004, enmienda #201): el estatico no puede compilar `.dg`; parte de la Fuente canonica ya compilada.

### Que produce `build` hoy

- `diagrams build` escribe `<ruta>/.diagrams/canonico.json` y `geometria/<vista>.json` (`{ view, theme, layoutKey, geometry }`) con el Tema declarado de cada Vista y medidas estimadas por caracter (el CLI no mide; ADR 0008, "Texto").
- La Fuente canonica incluye `themes` (`fuenteCanonicaSchema`, `packages/canonico/src/esquema.ts:310`): cambiar de Tema en el cliente no necesita nada mas que la Fuente.
- `VistaInteractiva` acepta `cachedGeometries` por Vista (`packages/shell/src/vista-interactiva.tsx:76`), pero solo como semilla del estado por defecto y solo si la clave de layout coincide y no hay medidas reales (`shell/src/geometria.ts:99`). Con `fontFiles` + `fontUrl` el visor mide con `medirEnVisor` y la semilla se ignora: relayout con ELK al abrir cada Vista.

### Medicion del bundle (esbuild del repo, `pnpm build` en este worktree, gzip -9)

Build actual de `estudio` (`packages/estudio/dist/estudio/`):

| Archivo | Bytes | gzip |
|---|---|---|
| `pagina.js` (entrada) | 458 228 | 149 455 |
| `trozos/chunk-QASWNNOH.js` (compartido, React y otros, carga inicial) | 543 130 | 123 023 |
| `trozos/panel-de-codigo-*.js` (editor, bajo demanda) | 393 294 | 128 420 |
| `trozos/elk.bundled-*.js` (emitido por el `import()` de `layout`; la pagina usa el Worker) | 1 459 376 | 439 664 |
| `worker.js` (ELK + `layout`, IIFE, sin zod) | 1 593 605 | 482 455 |
| `estilo.css` | 15 891 | 3 723 |

Visor minimo de prueba (entrada temporal, no commiteada: `VistaInteractiva` + `react-dom/client` + `fuenteCanonicaSchema.parse`, IIFE minificado con las opciones `COMUNES` de `src/construir.ts`):

| Variante | Bytes | gzip | Mayores aportes |
|---|---|---|---|
| Con zod (valida la Fuente al cargar) | 904 304 | 236 783 | zod 444 K, react-dom 205 K, `tema` 59 K, `render` 47 K, `canonico` 32 K, `shell` 30 K, d3 ~45 K |
| Zod sustituido por `worker/zod-inerte.ts` | 449 707 | 143 859 | igual sin zod |

ELK no entra al visor minimo (el `import()` de `layout.ts:68` queda fuera por tree shaking); va aparte en el Worker.

Datos del ejemplo `examples/rinthel-arch` tras `diagrams build`:

| Dato | Bytes | Comprimido |
|---|---|---|
| `canonico.json` | 510 965 | |
| 29 `geometria/*.json` | ~1 854 000 | |
| Ambos | 2 365 010 | 170 302 (gzip) |
| `temas/fuentes/*.woff2` (20 archivos, 8 familias) | ~480 000 | base64: 686 752 |
| `fuentes/DejaVu Sans*.ttf` (2 archivos) | 1 102 860 | base64: 1 470 480; base64+gzip: 720 779 |

Estimacion del HTML unico de ese ejemplo: visor 0.45-0.9 MB + Worker 1.6 MB + datos 0.5-2.4 MB (las Geometrias son opcionales si ELK va dentro) + fuentes 2.2 MB en base64 = **4.7-7.1 MB**; con gzip (Pages lo sirve comprimido) **~2-2.5 MB**. Palancas: pasar DejaVu de TTF a WOFF2 o subconjunto, embeber solo los Temas y fuentes que usan las Vistas exportadas, omitir Geometrias si ELK va dentro, quitar zod del visor (la Fuente ya la valido `build`).

### Autocontenido: que funciona sin servidor

- `file://` no deja hacer `fetch` de archivos vecinos en los navegadores, asi que todo tiene que ir inline; con datos en `<script type="application/json">` y fuentes como `data:` URL no hace falta ningun `fetch`.
- Worker desde Blob: es el mecanismo que ya usa `dev.tsx` (`fetch` de `worker.js` y `URL.createObjectURL(new Blob(...))`); en el HTML unico el texto del Worker viene del propio documento. **No verificado** que Chromium y Firefox permitan `new Worker(blob:)` desde una pagina `file://` (los navegadores de Playwright no estaban instalados en esta maquina). El respaldo del ADR 0003 (ELK en el hilo principal, que `elk.bundled.js` soporta sin `workerUrl`) cubre el caso; es lo que hace el visor de referencia (`/tmp/ext-floorplan/.../assets/viewer.html`, MIT), que inserta `vendor/elk.bundled.js` en el placeholder `<!--__ELK_SCRIPT__-->` y llama `new ELK()` en la pagina.
- Fuentes: ADR 0008 ("Fuentes") exige fuentes auto-hospedadas y embebibles (OFL lo permite) y sin CDN; `fontUrl` es una funcion `ruta -> URL` (`vista-interactiva.tsx`), asi que devolver una `data:` URL no cambia el contrato. No verificado que `document.fonts.load` con `data:` URL bajo `file://` mida igual que servido por HTTP.
- ADR 0008 linea 13 deja "el SVG estatico, PNG y el export en general" fuera porque el sistema asume pantalla. Un HTML interactivo sigue siendo pantalla, pero el ticket de spec deberia enmendar esa frase para que "export HTML" no lea como contradiccion.

## GitHub Pages sin workflow propio

Fuentes: GitHub Docs, "Configuring a publishing source for your GitHub Pages site", "GitHub Pages limits", "What is GitHub Pages?", "About GitHub Pages and Jekyll" y la REST API de Pages (consultadas 2026-11-24).

- Fuente de publicacion "Deploy from a branch": cualquier rama; carpeta `/` (raiz) o `/docs` de esa rama. Nada mas.
- Aun asi, "Your GitHub Pages site will always be deployed with a GitHub Actions workflow run". Con una rama publicada, ese run lo gestiona GitHub; el repo no lleva archivo de workflow. Para salidas ya construidas, la doc indica que suelen llevar un `.nojekyll` y entonces el run "skips the build and only deploys".
- Jekyll, si corre, no publica archivos ni carpetas que empiezan por `_`, `.` o `#`: el prefijo `/_estudio/` de `dev` no podria reusarse tal cual sin `.nojekyll`.
- Limites: sitio publicado de hasta 1 GB, repositorio fuente recomendado de hasta 1 GB, despliegue con timeout de 10 minutos, 100 GB/mes de ancho de banda (blando), 10 builds por hora (blando). Un HTML de 7 MB queda muy lejos.
- URL del sitio de proyecto: `https://<owner>.github.io/<repositorio>/` (aqui `https://williambarriga.github.io/Rinthel-arch/`). El repo es publico y hoy no tiene Pages (`gh api repos/WilliamBarriga/Rinthel-arch` -> `has_pages: false`) ni rama `gh-pages`.
- Activarlo sin UI: `POST /repos/{owner}/{repo}/pages` con `build_type: legacy` (construido por GitHub al empujar a la rama) y `source: { branch: "gh-pages", path: "/" }` (`path` admite `/` o `/docs`); `POST /repos/{owner}/{repo}/pages/builds` fuerza una publicacion sin commit nuevo. `build_type: workflow` es el modo con workflow propio y queda descartado.

Opciones comparadas:

| Opcion | Pros | Contras |
|---|---|---|
| Rama huerfana `gh-pages`, raiz, empujada desde local (script `pnpm demo:publicar`: `build` + `export` a un `git worktree` de `gh-pages`, commit y push) | `main` no lleva artefactos; historial de la demo separado; `.nojekyll` en la raiz; repetible por cualquiera con permiso de push | Un paso manual mas en el lanzamiento; el script toca git (debe dejar `main` intacto) |
| Carpeta `docs/` en `main` | Sin rama extra | `docs/` ya son las guias en Markdown, que Pages renderizaria con Jekyll; versionar un HTML de varios MB derivado contradice "derivado: no se versiona" de `build`; cada regeneracion ensucia `main` |
| Repo aparte (`<owner>.github.io` u otro) | Aislado del todo | Otro repo que mantener; la demo deja de vivir junto al codigo |

Recomendado: rama huerfana `gh-pages`. Pendiente de verificar al hacerlo: que el run gestionado por GitHub funcione con Actions desactivado a nivel de repo si alguna vez se desactivara (la doc no lo dice).

## Lo que haria falta (para la spec)

1. `cli`: `export` (nombre a decidir) que compila como `build`, reune Fuente canonica, iconos, Geometrias, fuentes usadas por los Temas de las Vistas exportadas (como `data:`) y el bundle de Componentes, y escribe un HTML unico. Opciones probables: `--views`, `--theme` (como `build`), `--sin-geometrias`.
2. `estudio`: una segunda entrada de navegador de solo lectura y un paso en `construirEstudio` (o un `construirVisor`) que la empaquete como IIFE sin `splitting` y con el Worker como texto. Si reutiliza el marco: un `ClienteDeDev` (o `fetch` inyectado) de solo lectura y el registro de pestanas filtrado (Vistas, Temas, leyenda; sin Codigo, Historial, Agente ni `fix`).
3. `shell`: nada obligatorio. Opcional: dejar que una Geometria precalculada con medidas reales sirva de semilla (hoy imposible porque `build` no mide), o una opcion para declarar `@font-face` sin medir.
4. Pruebas: el contrato de solo lectura contra los datos embebidos; una punta a punta en Chromium que abra el HTML por `file://` (verifica Worker Blob y fuentes `data:`).
5. Docs: guia de `export` y del script de publicacion; enmienda a ADR 0008 linea 13 y nota en ADR 0003 (el export ya esta previsto ahi).

## No verificado

- `new Worker(blob:)` y `document.fonts.load` con `data:` URL en paginas `file://` de Chromium y Firefox.
- Tamano exacto de una entrada de estudio de solo lectura sin editor (estimado entre el visor minimo, 144-237 KB gzip, y la carga inicial actual, ~276 KB gzip de `pagina.js` + trozo compartido).
- Comportamiento del run gestionado de Pages si Actions estuviera desactivado en el repo.
