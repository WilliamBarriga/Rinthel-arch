# Galeria de Temas de ejemplo

Los 14 Temas del prototipo hibrido (ADR 0008) como un Workspace: un `.dg` por Tema, un Modelo comun (`modelo.dg`) y una Vista por Tema (`vistas.dg`). Todo lo que cambia entre Vistas sale del Tema.

```
node packages/cli/dist/bin.js dev --workspace examples/temas/galeria
```

Cambia de Vista para comparar. El Modelo cubre todos los Tipos, un Grupo abierto (`plataforma`) y uno colapsado (`persistencia`), Aristas con y sin etiqueta, Atributos y un Nodo por estado (grupo `estados`: pasa el raton, selecciona, navega con teclado).

## Contenido

Temas: `soft-card`, `glass-chip`, `neobrutalist`, `blueprint`, `claro-suave`, `crt-terminal`, `synthwave`, `editorial`, `bauhaus`, `sticky-notes`, `keycaps`, `metro-map`, `pcb`, `pixel-art`. La primera linea de cada archivo, `// Contraste: ...`, lista los Tipos con warning de contraste deliberado (`ninguno` si no hay); una prueba exige que esos sean los unicos warnings de cada Tema (sin `W_THEME_COLOR_ONLY` ni otros).

`fuentes/` trae Caveat, Press Start 2P y JetBrains Mono en `woff2` (licencia OFL en `LICENCIA-OFL.txt`), auto-hospedadas, sin CDN. Los Temas las nombran en `fonts`; el visor aun no declara el `@font-face` desde el Workspace, asi que sin ello se ve el fallback.

## Limites del catalogo actual

Estos Temas aproximan el prototipo con las Primitivas que existen hoy: sin bloque propio de Grupo ni de fondo de pagina, sin desplazamiento de Capa ni offsets negativos. (Los decimales con cero a la izquierda, como `0.05`, ya se leen bien en el DSL.)
