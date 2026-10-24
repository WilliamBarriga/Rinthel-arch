# Galeria de Temas de ejemplo

Los 14 Temas del prototipo hibrido (ADR 0008) como un Workspace: un `.dg` por Tema, un Modelo comun (`modelo.dg`) y una Vista por Tema (`vistas.dg`). Todo lo que cambia entre Vistas sale del Tema.

```
node packages/cli/dist/bin.js dev --workspace examples/temas/galeria
```

Cambia de Vista para comparar. El Modelo cubre todos los Tipos, un Grupo abierto (`plataforma`) y uno colapsado (`persistencia`), Aristas con y sin etiqueta, Atributos y un Nodo por estado (grupo `estados`: pasa el raton, selecciona, navega con teclado).

## Comparar con el prototipo

Cada Tema tiene una Vista de referencia, `<tema>-referencia`, que equivale a la Vista `abierto` del prototipo aprobado (rama `prototype/render-hibrido`): mismos Nodos, Grupos abiertos (`render`, `sesion`, `layout`), Grupos colapsados y Aristas. Su Modelo vive en `referencia.dg`, con los Tipos del prototipo (`paquete`, `modulo`, `artefacto`, mas `actor` y `externo`), bajo el Grupo `referencia`, y las Vistas de cobertura lo excluyen.

```
pnpm build                          # una vez; el script usa el CLI construido
pnpm capturas soft-card             # un Tema: Vista de referencia contra la Vista `abierto` del prototipo
pnpm capturas --todos               # los 14 Temas
pnpm capturas soft-card glass-chip  # varios Temas en una sola pagina
pnpm capturas soft-card cobertura   # solo la galeria, Modelo de cobertura
pnpm capturas --workspace examples/rinthel-arch --vista abierto --prototipo A neutral neutral-dark
                                    # otro Workspace: su Vista con cada Tema (del Workspace o incorporado), junto a una variante del prototipo
```

El script extrae el prototipo a un directorio temporal (cache por commit), levanta `dev` sobre esta galeria, captura ambos con Chromium (espera las fuentes y la senal `data-layout="listo"` del shell) y sirve una pagina de comparacion lado a lado. Imprime `http://localhost:<puerto>/salida/`; el servidor sigue vivo y el siguiente `pnpm capturas` reemplaza al anterior. La salida va a `$CAPTURAS_DIR` (por defecto `/tmp/rinthel-capturas`, fuera del repo). Chromium sale de `$CHROMIUM_PATH` o de la cache de Playwright. No corre en `pnpm test`.

## Contenido

Temas: `soft-card`, `glass-chip`, `neobrutalist`, `blueprint`, `claro-suave`, `crt-terminal`, `synthwave`, `editorial`, `bauhaus`, `sticky-notes`, `keycaps`, `metro-map`, `pcb`, `pixel-art`. La primera linea de cada archivo, `// Contraste: ...`, lista los Tipos con warning de contraste deliberado (`ninguno` si no hay) y, si hace falta, `// Solo color: a/b, ...` los pares de Tipos que el Tema distingue solo por color (`W_THEME_COLOR_ONLY`, como el prototipo en glass-chip y metro-map); una prueba exige que esos sean los unicos warnings de cada Tema, en sus dos Vistas.

## Fuentes

`fuentes/` trae, en `woff2`, todas las familias que usa el prototipo en los 14 Temas, auto-hospedadas y sin CDN (ADR 0008): Caveat (400, 500, 700), Press Start 2P (400), JetBrains Mono (400, 700), Space Mono (400, 700), Outfit (400, 700), Nunito (600, 800) e Inter (400, 500, 600, 800). Georgia, Futura, Helvetica, SF Pro y los demas del prototipo son fuentes del sistema: un Tema las expresa con una familia generica (`serif`, `sans-serif`...) o con `fallback`.

Origen: archivos `latin` de [Fontsource](https://fontsource.org) 5.3.0 (`@fontsource/<familia>`, licencia OFL-1.1), tal cual, sin subsetear ni renombrar la fuente; descargados el 2026-10-23 de `https://cdn.jsdelivr.net/fontsource/fonts/<familia>@latest/latin-<peso>-normal.woff2`, que sirve los mismos archivos del paquete npm. Cada familia trae su licencia, copiada de `@fontsource/<familia>/LICENSE`, en `OFL-<familia>.txt` (copyright de sus autores: Caveat, Press Start 2P, JetBrains Mono, Space Mono, Outfit, Nunito, Inter). Repos de los autores: [googlefonts/caveat](https://github.com/googlefonts/caveat), [JetBrains/JetBrainsMono](https://github.com/JetBrains/JetBrainsMono), [googlefonts/spacemono](https://github.com/googlefonts/spacemono), [Outfitio/Outfit-Fonts](https://github.com/Outfitio/Outfit-Fonts), [googlefonts/nunito](https://github.com/googlefonts/nunito), [rsms/inter](https://github.com/rsms/inter); Press Start 2P es de Cody "CodeMan38" Boisclair (Reserved Font Name "Press Start 2P").

Un Tema las nombra en `fonts` y declara la reserva con `fallback`:

```
fonts { body "Caveat"  mono "Caveat"  fallback "cursive" }
```

El archivo de una familia se encuentra por nombre, con la convencion de Fontsource: `<familia-en-kebab>-<subset>-<peso>-<estilo>.<ext>` (`caveat-latin-700-normal.woff2`; tambien vale `<Familia>.<ext>` como peso 400). Una familia no generica sin archivo en el Workspace es el error `E_THEME_FONT_MISSING`, situado en el Tema, con "quisiste decir". `dev` sirve los archivos en `/fuentes/<ruta>` (solo fuentes del Workspace) y el visor declara el `@font-face` y mide con la fuente ya cargada. Los Temas de la galeria que hoy usan estas fuentes son `sticky-notes` (Caveat), `pixel-art` (Press Start 2P) y `blueprint`, `crt-terminal` y `pcb` (JetBrains Mono); las demas quedan disponibles para #55-#57.

## Limites del catalogo actual

Estos Temas aproximan el prototipo con las Primitivas que existen hoy: sin bloque propio de Grupo. (Los decimales con cero a la izquierda, como `0.05`, ya se leen bien en el DSL.)
