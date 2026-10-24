# Referencia del catalogo de Temas

Generado por `pnpm docs:catalogo` desde el catalogo de `packages/tema`; no editar a mano. El contrato esta en `docs/adr/0008-sistema-de-temas-expresivo.md`.

Un numero se escribe como `minimo a maximo (defecto)`; fuera de rango es un error, nunca se recorta. Los colores son siempre nombres de Paleta. "Metricas" dice si la Primitiva puede cambiar la caja o los Slots (por defecto solo pinta).

## Primitivas

Toda Capa de Nodo o Grupo (salvo `code`) acepta ademas, sin que la Primitiva las declare: `offset x y` (se escribe con dos valores y se guarda como `offset-x`/`offset-y`; admite negativos) y `grow`. Solo pintan: no cambian las Metricas ni provocan relayout, y un parche de estado puede cambiarlas con `transition`.

| Propiedad comun | Rango |
| --- | --- |
| `offset-x` | -200 a 200 |
| `offset-y` | -200 a 200 |
| `grow` | -100 a 100 |

### Familia forma

| Primitiva | Ubicacion | Propiedades | Metricas |
| --- | --- | --- | --- |
| `rect` | capa-nodo | `radius` 0 a 100 (0) | no |
| `pill` | capa-nodo | - | no |
| `cut` | capa-nodo | `cut` 1 a 100 (8) | no |
| `circle` | capa-nodo | - | si |

### Familia relleno

| Primitiva | Ubicacion | Propiedades | Metricas |
| --- | --- | --- | --- |
| `solid` | capa-nodo, capa-pagina | `color` color de Paleta | no |
| `gradient` | capa-nodo, capa-pagina | `from` color de Paleta; `to` color de Paleta; `angle` 0 a 360 (180) | no |
| `radial` | capa-nodo, capa-pagina | `from` color de Paleta; `to` color de Paleta; `x` 0 a 100 (50); `y` 0 a 100 (50) | no |
| `disc` | capa-nodo, capa-pagina | `color` color de Paleta; `radius` 1 a 2000 (8); `x` -2000 a 2000 (50); `y` -2000 a 2000 (50); `unit` percent|px (percent) | no |
| `grid` | capa-nodo, capa-pagina | `color` color de Paleta; `size` 2 a 200 (16); `width` 1 a 8 (1) | no |
| `lines` | capa-nodo, capa-pagina | `color` color de Paleta; `size` 2 a 200 (8); `width` 1 a 8 (1); `angle` 0 a 180 (45) | no |
| `dots` | capa-nodo, capa-pagina | `color` color de Paleta; `size` 4 a 200 (12); `radius` 1 a 50 (2) | no |
| `noise` | capa-nodo, capa-pagina | `frequency` 0.1 a 2 (0.8); `opacity` 0 a 1 (0.15) | no |

### Familia borde

| Primitiva | Ubicacion | Propiedades | Metricas |
| --- | --- | --- | --- |
| `border` | capa-nodo | `color` color de Paleta; `width` 1 a 16 (1) | no |
| `dashed` | capa-nodo | `color` color de Paleta; `width` 1 a 16 (1) | no |
| `dotted` | capa-nodo | `color` color de Paleta; `width` 1 a 16 (1) | no |
| `outline` | capa-nodo | `color` color de Paleta; `width` 1 a 16 (1); `offset` -16 a 16 (2) | no |

### Familia sombra

| Primitiva | Ubicacion | Propiedades | Metricas |
| --- | --- | --- | --- |
| `shadow` | capa-nodo | `color` color de Paleta; `x` -200 a 200 (0); `y` -200 a 200 (4); `blur` 0 a 200 (0); `spread` -100 a 100 (0); `inset` 0 a 1 (0) | no |

### Familia glow

| Primitiva | Ubicacion | Propiedades | Metricas |
| --- | --- | --- | --- |
| `glow` | capa-nodo | `color` color de Paleta; `radius` 1 a 100 (12); `spread` 0 a 32 (0) | no |

### Familia vidrio

| Primitiva | Ubicacion | Propiedades | Metricas |
| --- | --- | --- | --- |
| `glass` | capa-nodo | `blur` 0 a 64 (12); `saturate` 0 a 300 (100) | no |

### Familia filtro

| Primitiva | Ubicacion | Propiedades | Metricas |
| --- | --- | --- | --- |
| `sketch` | capa-nodo | `roughness` 0 a 20 (2); `frequency` 0.001 a 0.5 (0.03) | no |

### Familia decoracion

| Primitiva | Ubicacion | Propiedades | Metricas |
| --- | --- | --- | --- |
| `tilt` | capa-nodo | `degrees` 0 a 3 (1) | no |
| `tape` | capa-nodo | `color` color de Paleta; `width` 8 a 200 (48); `height` 4 a 60 (16); `angle` -15 a 15 (opcional) | no |
| `pins` | capa-nodo | `color` color de Paleta; `width` 1 a 40 (4); `step` 2 a 100 (11); `length` 1 a 40 (6); `margin` 0 a 200 (10) | no |
| `fold` | capa-nodo | `color` color de Paleta; `size` 4 a 60 (14); `shadow` color de Paleta (opcional) | no |
| `ring` | capa-nodo | `color` color de Paleta; `width` 1 a 16 (2); `offset` 0 a 32 (4) | no |

### Familia trazo

| Primitiva | Ubicacion | Propiedades | Metricas |
| --- | --- | --- | --- |
| `line` | capa-arista | `color` color de Paleta; `width` 0.5 a 24 (1.5); `style` solid|dashed|dotted|pixel (solid); `corner` sharp|chamfer|round (sharp); `cut` 1 a 32 (6); `radius` 1 a 64 (8); `roughness` 0 a 20 (0); `frequency` 0.001 a 0.5 (0.03) | no |

### Familia marcador

| Primitiva | Ubicacion | Propiedades | Metricas |
| --- | --- | --- | --- |
| `arrow` | marcador | `color` color de Paleta (opcional); `size` 2 a 32 (8) | no |
| `dot` | marcador | `color` color de Paleta (opcional); `size` 2 a 32 (8) | no |
| `diamond` | marcador | `color` color de Paleta (opcional); `size` 2 a 32 (8) | no |
| `square` | marcador | `color` color de Paleta (opcional); `size` 2 a 32 (8) | no |
| `bar` | marcador | `color` color de Paleta (opcional); `size` 2 a 32 (8) | no |
| `via` | marcador | `color` color de Paleta (opcional); `size` 2 a 32 (8) | no |
| `hollow` | marcador | `color` color de Paleta (opcional); `size` 2 a 32 (8) | no |
| `chevron` | marcador | `color` color de Paleta (opcional); `size` 2 a 32 (8) | no |

### Familia texto

| Primitiva | Ubicacion | Propiedades | Metricas |
| --- | --- | --- | --- |
| `text` | texto-slot | `weight` 100 a 900 (400); `color` color de Paleta (opcional); `style` normal|italic (normal); `transform` none|uppercase (none); `font` body|mono (opcional); `alpha` 0 a 1 (opcional); `text-align` start|center|end (opcional); `size` 0.4 a 3 (opcional); `leading` 1 a 5 (opcional); `tracking` 0 a 1 (0); `fill` color de Paleta (opcional); `border` color de Paleta (opcional); `border-width` 0 a 8 (opcional); `radius` 0 a 50 (0); `pad` 0 a 32 (0); `dot` color de Paleta (opcional) | si |
| `chip` | texto-slot | `weight` 100 a 900 (700); `color` color de Paleta (opcional); `fill` color de Paleta (opcional); `border` color de Paleta (opcional); `border-width` 0 a 8 (opcional); `radius` 0 a 50 (50); `size` 0.4 a 3 (opcional); `font` body|mono (opcional) | si |
| `icon` | texto-slot | `variant` plain|box|dot (plain); `side` 6 a 96 (16); `radius` 0 a 50 (6); `fill` color de Paleta (opcional); `ring` color de Paleta (opcional); `border` color de Paleta (opcional); `border-width` 0 a 8 (opcional); `color` color de Paleta (opcional) | si |
| `label` | etiqueta | `scale` 0.5 a 2 (0.85); `pad` 0 a 32 (4); `pad-y` 0 a 16 (opcional); `radius` 0 a 50 (0); `fill` color de Paleta (opcional); `border` color de Paleta (opcional); `border-width` 0.5 a 8 (opcional); `color` color de Paleta (opcional); `weight` 100 a 900 (opcional); `font` body|mono (opcional); `shadow` color de Paleta (opcional); `rotate` -15 a 15 (opcional) | si |

### Familia codigo

| Primitiva | Ubicacion | Propiedades | Metricas |
| --- | --- | --- | --- |
| `code` | capa-nodo | `component` nombre de Componente; parametros libres (numero o texto) | no |

## Slots

| Slot | Estilo |
| --- | --- |
| `icon` | `icon` |
| `title` | `text` |
| `badge` | `text` |
| `desc` | `text` |
| `footer` | `text` |
| `attrs` | `text` |
| `counter` | `chip` |

## Movimientos

| Movimiento | Intensidad | Easing | Duracion (ms) |
| --- | --- | --- | --- |
| `flujo` | no | linear | 2000 |
| `pulso` | si | ease-in-out | 1200 |
| `respiracion` | si | ease-in-out | 3000 |
| `giro` | no | linear | 2000 |
| `aura` | si | ease-in-out | 2000 |

Easings: `linear`, `ease`, `ease-in`, `ease-out`, `ease-in-out`.

## Efectos de entrada y salida

| Efecto |
| --- |
| `fundido` |
| `escala` |
| `deslizar` |

## Propiedades animables con keyframes

| Propiedad | Rango |
| --- | --- |
| `opacity` | 0 a 1 |
| `scale` | 0 a 4 |
| `rotate` | -360 a 360 |
| `shift-x` | -200 a 200 |
| `shift-y` | -200 a 200 |
| `blur` | 0 a 32 |
