# Galeria de Temas de ejemplo

Los 14 Temas del prototipo hibrido (ADR 0008) como un Workspace: un `.dg` por Tema, un Modelo comun (`modelo.dg`) y una Vista por Tema (`vistas.dg`). Todo lo que cambia entre Vistas sale del Tema.

```
node packages/cli/dist/bin.js dev --workspace examples/temas/galeria
```

Cambia de Vista para comparar. El Modelo cubre todos los Tipos, un Grupo abierto (`plataforma`) y uno colapsado (`persistencia`), Aristas con y sin etiqueta, Atributos y un Nodo por estado (grupo `estados`: pasa el raton, selecciona, navega con teclado).

## Comparar con el prototipo

Cada Tema tiene una Vista de referencia, `<tema>-referencia`, que equivale a la Vista `abierto` del prototipo aprobado (rama `prototype/render-hibrido`): mismos Nodos, Grupos abiertos (`render`, `sesion`, `layout`), Grupos colapsados y Aristas. Su Modelo vive en `referencia.dg`, bajo el Grupo `referencia`, y las Vistas de cobertura lo excluyen.

```
pnpm build                          # una vez; el script usa el CLI construido
pnpm capturas soft-card             # un Tema: Vista de referencia contra la Vista `abierto` del prototipo
pnpm capturas --todos               # los 14 Temas
pnpm capturas soft-card cobertura   # solo la galeria, Modelo de cobertura
```

El script extrae el prototipo a un directorio temporal (cache por commit), levanta `dev` sobre esta galeria, captura ambos con Chromium (espera las fuentes y la senal `data-layout="listo"` del shell) y sirve una pagina de comparacion lado a lado. Imprime `http://localhost:<puerto>/salida/`; el servidor sigue vivo y el siguiente `pnpm capturas` reemplaza al anterior. La salida va a `$CAPTURAS_DIR` (por defecto `/tmp/rinthel-capturas`, fuera del repo). Chromium sale de `$CHROMIUM_PATH` o de la cache de Playwright. No corre en `pnpm test`.

## Contenido

Temas: `soft-card`, `glass-chip`, `neobrutalist`, `blueprint`, `claro-suave`, `crt-terminal`, `synthwave`, `editorial`, `bauhaus`, `sticky-notes`, `keycaps`, `metro-map`, `pcb`, `pixel-art`. La primera linea de cada archivo, `// Contraste: ...`, lista los Tipos con warning de contraste deliberado (`ninguno` si no hay); una prueba exige que esos sean los unicos warnings de cada Tema (sin `W_THEME_COLOR_ONLY` ni otros).

`fuentes/` trae Caveat, Press Start 2P y JetBrains Mono en `woff2` (licencia OFL en `LICENCIA-OFL.txt`), auto-hospedadas, sin CDN. Los Temas las nombran en `fonts`; el visor aun no declara el `@font-face` desde el Workspace, asi que sin ello se ve el fallback.

## Limites del catalogo actual

Estos Temas aproximan el prototipo con las Primitivas que existen hoy: sin bloque propio de Grupo ni de fondo de pagina. (Los decimales con cero a la izquierda, como `0.05`, ya se leen bien en el DSL.)
