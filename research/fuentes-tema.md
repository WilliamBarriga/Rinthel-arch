# Research: fuentes del Tema, carga y medicion (ticket #17)

Fecha de consulta: 2026-10-23. Mapa #7 (Sistema de Temas expresivo). Fuentes primarias (MDN, specs W3C, FAQ de la OFL, npm, repos). Lo no verificado se marca **[no verificado]**.

## Pregunta

Como carga un Tema sus fuentes (self-hosted vs CDN vs sistema), con que licencias y costo de dependencia, y que implica para la medicion del layout (#14: estimacion por caracter + adaptador de medicion real en el visor): fallback metrics, FOUT/FOIT, carga antes de medir, determinismo entre maquinas.

## Estado actual del repo (contexto)

- ADR 0004: las fuentes las declara el Tema y se incrustan; el CLI incrusta `<Familia>.woff2|woff|ttf|otf` del Workspace como `@font-face` con data URI (`packages/cli/src/fuentes.ts`, `packages/render`). resvg solo carga `.ttf/.otf` desde archivo; una familia sin archivo cae a fuentes del sistema y el PNG deja de ser identico entre maquinas.
- ADR 0006 / `packages/layout/src/metricas.ts`: el ancho se estima por caracter (`factorDeAncho` 0.55 proporcional, 0.6 mono) y el layout corre sin DOM (Node y Worker). La estimacion no depende de la fuente real, por eso es determinista, y por eso es imprecisa.
- ADR 0003: la clave de layout incluye fuentes y Metricas; cambiar fuente relayouta.

## Recomendacion

1. **Fuente por defecto: archivos de fuente en el Workspace, auto-hospedados e incrustados** (lo que ya hace el CLI). Es la unica via que da export autocontenido, offline y bytes identicos entre maquinas. Para obtenerlos, los paquetes `@fontsource/*` y `@fontsource-variable/*` sirven como *origen de copia* (el usuario copia el `.woff2` al Workspace); no hace falta que el nucleo dependa de ellos.
2. **CDN (Google Fonts API, etc.) no es soportado por el nucleo.** Rompe el export autocontenido y el offline, anade una peticion de terceros y un punto de fallo; en el visor el nucleo no tiene por que prohibirlo (un Tema puede declarar `@import` solo en la via "con codigo"), pero el export no lo incluiria.
3. **Fuentes del sistema solo como fallback declarado** (`sans-serif`, `monospace`, `ui-monospace`). `system-ui` y los genericos resuelven a fuentes distintas por plataforma, asi que el layout medido y el PNG dejan de ser portables. `validate` deberia avisar (warning) cuando la fuente del cuerpo no tiene archivo en el Workspace.
4. **Medicion en dos niveles, ambos sin DOM en el nucleo:**
   - Nivel 0 (hoy): estimacion por caracter. Determinista, sin carga de fuentes. Es el valor por defecto y el que usa el CLI.
   - Nivel 1 (adaptador del visor): medir con `canvas.measureText` (o Pretext) **despues** de `await document.fonts.load(<font>, <texto>)` para cada familia/peso del Tema. Si falla o no esta lista, usar Nivel 0 sin bloquear.
   - Nivel 2 (candidato a evaluar, ver abajo): medir en JS puro leyendo los avances de glifo del archivo de fuente con harfbuzzjs/fontkit. Es la unica opcion con medicion real que corre en Node/Worker y es determinista entre maquinas dado el mismo archivo.
5. **Clave de cache de layout**: debe incluir, por familia usada, un identificador del contenido del archivo (hash) y no solo el nombre, y el nivel de medicion usado. Si el adaptador del visor pasa de Nivel 0 a Nivel 1, es un cambio de clave (relayout), no un parche silencioso.
6. **Fallback metrics**: para el visor, declarar un `@font-face` de fallback con `size-adjust` y overrides de ascenso/descenso reduce el salto al cambiar de fallback a fuente real; como el Tema auto-hospeda y espera la carga antes de medir, es una optimizacion opcional, no requisito.

## Carga: comportamiento verificado

### font-display (FOUT/FOIT)

Fuente: [MDN `font-display`](https://developer.mozilla.org/en-US/docs/Web/CSS/@font-face/font-display) (Baseline, ampliamente disponible desde enero 2020).

| Valor | Periodo de bloqueo | Periodo de intercambio | Efecto |
|---|---|---|---|
| `auto` (inicial) | lo define el navegador | lo define el navegador | estrategia del navegador |
| `block` | corto | infinito | texto invisible (FOIT) y luego la fuente real |
| `swap` | extremadamente corto | infinito | fallback casi inmediato y luego intercambio (FOUT) |
| `fallback` | extremadamente corto | corto | fallback; intercambia solo si carga a tiempo |
| `optional` | extremadamente corto | ninguno | usa la fuente solo si ya esta en cache o llega casi al instante |

MDN no da duraciones numericas ("corto", "extremadamente corto"). Firefox las controla con prefs (`gfx.downloadable_fonts.fallback_delay` y `..._short`).

Implicacion: con `swap` el Nodo se mide y pinta primero con el fallback y la caja cambia al llegar la fuente real: es exactamente el desajuste que el layout no debe sufrir. Con `block` no hay desajuste visual de forma, pero el texto es invisible un instante. Para Temas de diagramas se prefiere `block` o `swap` mas "no medir hasta que cargue"; **`optional` es inadecuado** (la fuente puede no usarse nunca, y el Tema deja de ser fiel). En el HTML exportado con data URI la fuente esta en el propio archivo, asi que la ventana de FOUT es minima [no verificado: no hay cifras primarias; los data URI se decodifican localmente].

### API de carga (CSS Font Loading)

Fuentes: [W3C CSS Font Loading Level 3](https://www.w3.org/TR/css-font-loading-3/) (Working Draft, 6 abril 2023, no CR), MDN [`FontFaceSet.load`](https://developer.mozilla.org/en-US/docs/Web/API/FontFaceSet/load) y [`ready`](https://developer.mozilla.org/en-US/docs/Web/API/FontFaceSet/ready) (Baseline, ampliamente disponibles desde enero 2020; disponibles tambien en Workers via `WorkerGlobalScope.fonts`).

- `document.fonts.load(font, text)` inicia la descarga de las caras que coincidan y resuelve con un array de `FontFace`; rechaza si alguna falla. `text` filtra caras por `unicode-range` pero "no comprueba la cobertura de glifos individuales"; por defecto es un espacio.
- `document.fonts.ready` se resuelve cuando el documento termino de cargar fuentes y el layout no necesita mas cargas; la spec dice que solo se cumple (nunca rechaza) y que puede pasar por varias iteraciones (fallback). Tambien se resuelve de inmediato si no hay cargas pendientes.
- `document.fonts.check(font, text)` es sincrono, no inicia cargas y devuelve `true` si las caras estan cargadas o son fuentes del sistema. **Trampa documentada por la spec**: devuelve `true` si ninguna cara cubre el texto o si la familia no existe, asi que no sirve para confirmar que una fuente esta lista.
- La spec (seccion 1) dice que la mayoria de agentes no descargan una cara que nada usa en la pagina: por eso `ready` solo no basta para medir con canvas; hay que llamar a `load()` con la cadena `font` exacta (peso, estilo, tamano, familia) antes de medir.

### Medicion con canvas

[MDN `measureText`](https://developer.mozilla.org/en-US/docs/Web/API/CanvasRenderingContext2D/measureText) devuelve un `TextMetrics`; la pagina solo documenta `width`. Que `measureText` use un fallback si la cara no esta cargada es comportamiento general conocido pero **no figura en esa pagina [no verificado en fuente primaria]**; la practica segura es `await document.fonts.load()` antes.

## Fuentes: licencias y costo de dependencia

### OFL 1.1 (casi todo el catalogo libre)

Fuente: [FAQ de la OFL (v1.1-update7)](https://openfontlicense.org/ofl-faq/).

- Se pueden redistribuir y usar en proyectos, pero **no vender la fuente sola** (1.6); venderla incluida en software es valido (1.4).
- Embeber en un documento, completa o subconjunto, esta permitido y no cambia la licencia del documento (1.12, 1.13). Las webfonts via `@font-face` son distribucion y estan explicitamente permitidas (2.1); la FAQ las distingue del embedding (2.10).
- **SVG y data URI no se tratan en la FAQ**: el export (SVG/HTML con `@font-face` en base64) cae en una zona sin respuesta explicita; por analogia se acerca a embedding. Dejar constancia, no es asesoria legal.
- El texto de la licencia y el copyright deben acompanar a la fuente, salvo cuando va embebida en un documento o empaquetada en un programa (1.10).
- Subsetting o cambio de formato es modificacion: obliga a no usar el Reserved Font Name salvo equivalencia funcional (2.6, 2.7); un WOFF/WOFF2 solo conserva el nombre si los datos son identicos salvo la compresion (2.2.1). Muchas fuentes de Google no declaran RFN, pero hay que mirar cada `OFL.txt`.
- Consecuencia para el sistema: no subsetear ni renombrar fuentes por defecto; incrustar el archivo tal cual; el Workspace guarda el `OFL.txt` junto a la fuente.

### Origenes de los archivos

| Origen | Licencia | Mantenimiento | Tamano | Notas |
|---|---|---|---|---|
| [Fontsource](https://fontsource.org/docs/getting-started/introduction) (`fontsource` 5.3.0; repo con 6236 estrellas, push 2026-10-14) | tooling MIT; cada paquete de fuente `OFL-1.1` en npm (`@fontsource/inter` 5.3.0, publicado 2026-07-19) | activo | `@fontsource/inter` 4.27 MB desempaquetado (todos los pesos y subsets); `@fontsource-variable/inter` 1.91 MB | un paquete npm por fuente; versionado y offline; la propia doc lista auto-hospedaje, bloqueo de version, privacidad y offline como ventajas; ofrece tambien enlaces CDN |
| [google/fonts](https://github.com/google/fonts) | cada directorio de licencia (`ofl/`, ...) indica la de sus archivos; "licensed with permission to redistribute" (README) | activo | `.ttf` variable por familia, p. ej. `ofl/inter/Inter[opsz,wght].ttf` mas `OFL.txt` | origen de los `.ttf` (resvg los necesita) |
| Repo de la fuente (p. ej. [rsms/inter](https://github.com/rsms/inter), OFL-1.1) | la de cada fuente | varia (Inter: ultimo push 2024-11-19) | varia | util para binarios oficiales |
| Google Fonts API (CDN) | las fuentes son OFL/Apache; el servicio tiene sus terminos | n/a | n/a | la pagina "getting started" solo describe el enlace a `fonts.googleapis.com`; **no se pudo leer en fuente primaria que datos registra o si usa cookies [no verificado]** |

Costo de dependencia: el nucleo no necesita depender de ninguna. Fontsource es opcional como origen; adoptarlo como dependencia del nucleo no aporta (el CLI ya lee archivos del Workspace) y aumentaria el tamano de instalacion.

### Fuentes del sistema

[MDN `font-family`](https://developer.mozilla.org/en-US/docs/Web/CSS/font-family): `system-ui` toma "la fuente de interfaz por defecto de la plataforma"; algunos SO no permiten personalizarla y los navegadores si permiten cambiar `sans-serif`; `cursive` en Windows es Comic Sans MS; `monospace` usa por defecto 13px frente a 16px (y `monospace, monospace` lo evita). Es decir: **no hay forma de determinismo con genericos**. Costo cero de descarga, cero de licencia, pero fidelidad entre maquinas solo aproximada.

## Determinismo del layout entre maquinas

- **Estimacion por caracter** (Nivel 0): determinista, pero no mira la fuente; el ancho real puede desbordar o sobrar. El factor 0.55/0.6 es un promedio de latin; no cubre CJK, emoji ni fuentes condensadas/anchas.
- **Medicion en el navegador** (Nivel 1): depende de que `load()` haya terminado y del motor de texto del navegador. Que dos navegadores den el mismo `width` para los mismos bytes de fuente **no esta garantizado por las fuentes revisadas [no verificado]** (hinting, subpixel, kerning por motor). Por eso el resultado medido en el visor no puede ser la geometria "canonica" del CLI sin una regla: o se usa solo en el visor (y se descarta al exportar), o se persiste junto a la clave.
- **Medicion desde el archivo** (Nivel 2): leer avances de glifo y kerning del archivo da el mismo ancho en cualquier maquina para el mismo archivo. Candidatos, todos MIT segun npm:
  - [`harfbuzzjs`](https://github.com/harfbuzz/harfbuzzjs) 1.6.4 (publicado 2026-10-22, WASM de HarfBuzz, ~1.3 MB desempaquetado): shaping real, incluye ligaduras y kerning; corre en Node y navegador.
  - [`fontkit`](https://github.com/foliojs/fontkit) 2.0.4 (publicado 2026-09-30, ~5.6 MB): shaping propio.
  - [`opentype.js`](https://github.com/opentypejs/opentype.js) 2.0.0 (2026-05-06, ~3.6 MB): metricas por glifo, menos shaping.
  - [`@chenglou/pretext`](https://github.com/chenglou/pretext) 1.0.0 (MIT, 2026-10-14): mide con canvas ("usa el motor de fuentes del navegador como ground truth"), sin DOM-reflow; **sigue necesitando canvas y fuente cargada**, asi que es Nivel 1 y no corre en Node plano.
  
  Hay que prototipar antes de adoptar: no se midio la diferencia entre el avance de HarfBuzz y el ancho que pinta cada navegador, ni el costo de arranque del WASM en un Worker **[no verificado]**. Adoptarlo requiere ticket/ADR propio (AGENTS.md).
- **PNG con resvg** ya es determinista solo si el Workspace trae todos los `.ttf/.otf` (ADR 0004).

## Puntos abiertos para la decision

1. Si el nivel de medicion es una propiedad del Tema, de la sesion o del consumidor (CLI siempre Nivel 0, visor opcional Nivel 1).
2. Si Nivel 2 vale su dependencia o basta con 0 + 1.
3. Que hace `validate` con una familia sin archivo: warning (propuesto) o error en modo exportacion.
4. Si el Workspace guarda la licencia de cada fuente (`OFL.txt`) y `inspect` la lista.
5. Verificar con prueba real las dos afirmaciones marcadas [no verificado]: igualdad de `measureText` entre motores para el mismo archivo y el comportamiento de `measureText` con cara aun no cargada.
