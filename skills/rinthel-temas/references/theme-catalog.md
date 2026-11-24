# Theme catalog reference

The closed vocabulary of Theme values. A name outside it is an error; `validate` suggests the closest one. A number is written `min to max (default)`; out of range is an error, never clamped. Colors are always Palette names. "Metrics" says whether the Primitive can change the box or the Slots (by default it only paints).

## Primitives

Every Node or Group Layer (except `code`) also accepts, without the Primitive declaring them: `offset x y` (two values, stored as `offset-x`/`offset-y`; negatives allowed) and `grow`. They only paint: no Metrics change and no relayout, and a state patch may change them with `transition`.

| Common property | Range |
| --- | --- |
| `offset-x` | -200 to 200 |
| `offset-y` | -200 to 200 |
| `grow` | -100 to 100 |

And `zone` (`all`, `header`, `body`; default `all`): which part of the box the Layer paints. `header` is the zone of the Slots before `attrs` (without `attrs` it equals `all`), `body` the zone of `attrs`. Paint only, laid out apart from the box: a state patch does not change it.

### Shape family

| Primitive | Placement | Properties | Metrics |
| --- | --- | --- | --- |
| `rect` | node-layer | `radius` 0 to 100 (0) | no |
| `pill` | node-layer | - | no |
| `cut` | node-layer | `cut` 1 to 100 (8) | no |
| `circle` | node-layer | - | yes |

### Fill family

| Primitive | Placement | Properties | Metrics |
| --- | --- | --- | --- |
| `solid` | node-layer, page-layer | `color` Palette color | no |
| `gradient` | node-layer, page-layer | `from` Palette color; `to` Palette color; `angle` 0 to 360 (180) | no |
| `radial` | node-layer, page-layer | `from` Palette color; `to` Palette color; `x` -100 to 200 (50); `y` -100 to 200 (50) | no |
| `disc` | node-layer, page-layer | `color` Palette color; `radius` 1 to 2000 (8); `x` -2000 to 2000 (50); `y` -2000 to 2000 (50); `unit` percent|px (percent) | no |
| `grid` | node-layer, page-layer | `color` Palette color; `size` 2 to 200 (16); `width` 1 to 8 (1) | no |
| `lines` | node-layer, page-layer | `color` Palette color; `size` 2 to 200 (8); `width` 1 to 8 (1); `angle` 0 to 180 (45) | no |
| `dots` | node-layer, page-layer | `color` Palette color; `size` 4 to 200 (12); `radius` 1 to 50 (2) | no |
| `noise` | node-layer, page-layer | `frequency` 0.1 to 2 (0.8); `opacity` 0 to 1 (0.15); `color` Palette color (optional) | no |

### Border family

| Primitive | Placement | Properties | Metrics |
| --- | --- | --- | --- |
| `border` | node-layer | `color` Palette color; `width` 1 to 16 (1) | no |
| `dashed` | node-layer | `color` Palette color; `width` 1 to 16 (1) | no |
| `dotted` | node-layer | `color` Palette color; `width` 1 to 16 (1) | no |
| `outline` | node-layer | `color` Palette color; `width` 1 to 16 (1); `offset` -16 to 16 (2) | no |

### Shadow family

| Primitive | Placement | Properties | Metrics |
| --- | --- | --- | --- |
| `shadow` | node-layer | `color` Palette color; `x` -200 to 200 (0); `y` -200 to 200 (4); `blur` 0 to 200 (0); `spread` -100 to 100 (0); `inset` 0 to 1 (0) | no |

### Glow family

| Primitive | Placement | Properties | Metrics |
| --- | --- | --- | --- |
| `glow` | node-layer | `color` Palette color; `radius` 1 to 100 (12); `spread` 0 to 32 (0) | no |

### Glass family

| Primitive | Placement | Properties | Metrics |
| --- | --- | --- | --- |
| `glass` | node-layer | `blur` 0 to 64 (12); `saturate` 0 to 300 (100) | no |

### Filter family

| Primitive | Placement | Properties | Metrics |
| --- | --- | --- | --- |
| `sketch` | node-layer | `roughness` 0 to 20 (2); `frequency` 0.001 to 0.5 (0.03) | no |

### Decoration family

| Primitive | Placement | Properties | Metrics |
| --- | --- | --- | --- |
| `tilt` | node-layer | `degrees` 0 to 3 (1) | no |
| `tape` | node-layer | `color` Palette color; `width` 8 to 200 (48); `height` 4 to 60 (16); `angle` -15 to 15 (optional) | no |
| `stripe` | node-layer | `color` Palette color; `side` left|right|top|bottom (left); `width` 1 to 200 (4) | no |
| `pins` | node-layer | `color` Palette color; `width` 1 to 40 (4); `step` 2 to 100 (11); `length` 1 to 40 (6); `margin` 0 to 200 (10) | no |
| `fold` | node-layer | `color` Palette color; `size` 4 to 60 (14); `shadow` Palette color (optional) | no |
| `ring` | node-layer | `color` Palette color; `width` 1 to 16 (2); `offset` 0 to 32 (4) | no |

### Stroke family

| Primitive | Placement | Properties | Metrics |
| --- | --- | --- | --- |
| `line` | edge-layer | `color` Palette color; `width` 0.5 to 24 (1.5); `style` solid|dashed|dotted|pixel (solid); `corner` sharp|chamfer|round (sharp); `cut` 1 to 32 (6); `radius` 1 to 64 (8); `cap` butt|round|square (optional); `roughness` 0 to 20 (optional); `frequency` 0.001 to 0.5 (optional) | no |

### Marker family

| Primitive | Placement | Properties | Metrics |
| --- | --- | --- | --- |
| `arrow` | marker | `color` Palette color (optional); `size` 2 to 32 (8) | no |
| `dot` | marker | `color` Palette color (optional); `size` 2 to 32 (8) | no |
| `diamond` | marker | `color` Palette color (optional); `size` 2 to 32 (8) | no |
| `square` | marker | `color` Palette color (optional); `size` 2 to 32 (8) | no |
| `bar` | marker | `color` Palette color (optional); `size` 2 to 32 (8) | no |
| `via` | marker | `color` Palette color (optional); `size` 2 to 32 (8) | no |
| `hollow` | marker | `color` Palette color (optional); `size` 2 to 32 (8) | no |
| `chevron` | marker | `color` Palette color (optional); `size` 2 to 32 (8) | no |
| `one` | marker | `color` Palette color (optional); `size` 2 to 32 (8) | no |
| `zero-one` | marker | `color` Palette color (optional); `size` 2 to 32 (8) | no |
| `many` | marker | `color` Palette color (optional); `size` 2 to 32 (8) | no |
| `zero-many` | marker | `color` Palette color (optional); `size` 2 to 32 (8) | no |
| `cross` | marker | `color` Palette color (optional); `size` 2 to 32 (8) | no |

### Text family

| Primitive | Placement | Properties | Metrics |
| --- | --- | --- | --- |
| `text` | slot-text | `weight` 100 to 900 (400); `color` Palette color (optional); `style` normal|italic (normal); `transform` none|uppercase (none); `font` body|mono (optional); `alpha` 0 to 1 (optional); `text-align` start|center|end (optional); `size` 0.4 to 3 (optional); `leading` 1 to 5 (optional); `tracking` 0 to 1 (0); `fill` Palette color (optional); `border` Palette color (optional); `border-width` 0 to 8 (optional); `radius` 0 to 50 (0); `pad` 0 to 32 (0); `dot` Palette color (optional); `prefix` text up to 8 characters (optional); `glow` Palette color (optional) | yes |
| `chip` | slot-text | `weight` 100 to 900 (700); `color` Palette color (optional); `fill` Palette color (optional); `border` Palette color (optional); `border-width` 0 to 8 (optional); `radius` 0 to 50 (50); `size` 0.4 to 3 (optional); `font` body|mono (optional) | yes |
| `icon` | slot-text | `variant` plain|box|dot (plain); `side` 6 to 96 (16); `radius` 0 to 50 (6); `fill` Palette color (optional); `ring` Palette color (optional); `border` Palette color (optional); `border-width` 0 to 8 (optional); `color` Palette color (optional); `glyph` 6 to 96 (optional) | yes |
| `label` | label | `scale` 0.5 to 2 (0.85); `pad` 0 to 32 (4); `pad-y` 0 to 16 (optional); `radius` 0 to 50 (0); `fill` Palette color (optional); `border` Palette color (optional); `border-width` 0.5 to 8 (optional); `color` Palette color (optional); `weight` 100 to 900 (optional); `font` body|mono (optional); `shadow` Palette color (optional); `rotate` -15 to 15 (optional); `style` normal|italic (optional) | yes |

### Code family

| Primitive | Placement | Properties | Metrics |
| --- | --- | --- | --- |
| `code` | node-layer | `component` Component name; free parameters (number or text) | no |


## Slots

| Slot | Style Primitive |
| --- | --- |
| `icon` | `icon` |
| `title`, `badge`, `desc`, `footer`, `attrs` | `text` |
| `counter` | `chip` |

## ER table row (`row`)

Theme block that styles the rows of an `er` View. `height` (12 to 120) and the `size` of `name`, `type` and `key` (a multiple of the Theme text size, as in Slots) change the measured size; the rest only paints.

| Element | Content |
| --- | --- |
| `layer`, `use` | Layer stack of each row (Node Primitives) |
| `alternate { ... }` | Patch for odd rows |
| `key pk\|fk\|uk { ... }` | Patch for rows with that key mark, in that order |
| `optional { ... }` | Patch for optional Attributes, after the keys |
| `state hover\|selected\|... { ... }` | Row state patch (paint only) over the stack of its variant; the shell emits `hover` and `selected` |
| `name { ... }`, `type { ... }` | Text style with the `text` Primitive |
| `key { ... }` | Text style with the `chip` Primitive (the chip of each key mark) |

## Sequence elements

Theme blocks for a `sequence` View; without them the core derives them from `edge` and `node`. Each accepts `layer`, `use` and `state`; Metrics are the sequence gaps (px).

| Block | Layers | Markers | Styles | Patches | Metrics |
| --- | --- | --- | --- | --- | --- |
| `lifeline` | strokes | `end` | - | - | `gap` 40 to 600 (160) |
| `activation` | Node | - | - | - | `width` 4 to 40 (10) |
| `message` | strokes | `start`, `end` | `label` (`label`) | `kind <type>`: sync, async, reply, create, destroy | `gap` 12 to 120 (32); `loop-width` 12 to 120 (36); `create-offset` -40 to 40 (0) |
| `fragment` | Node | - | `operator` (`label`), `guard` (`text`), `divider` (`line`) | `op <operator>`: opt, loop, break, critical, alt, par, ref | `padding` 0 to 64 (16); `padding-y` 2 to 40 (10) |
| `note` | Node | - | `text` (`text`) | - | - |

The `identifying { ... }` patch of the `edge` block changes the stroke of identifying Edges in an ER View.

## Motions

| Motion | Intensity | Easing | Duration (ms) |
| --- | --- | --- | --- |
| `stream` | no | linear | 2000 |
| `pulse` | yes | ease-in-out | 1200 |
| `breathe` | yes | ease-in-out | 3000 |
| `spin` | no | linear | 2000 |
| `aura` | yes | ease-in-out | 2000 |

Easings: `linear`, `ease`, `ease-in`, `ease-out`, `ease-in-out`.

## Enter and exit effects

`fade`, `zoom`, `slide`.

## Keyframe-animatable properties

| Property | Range |
| --- | --- |
| `opacity` | 0 to 1 |
| `scale` | 0 to 4 |
| `rotate` | -360 to 360 |
| `shift-x` | -200 to 200 |
| `shift-y` | -200 to 200 |
| `blur` | 0 to 32 |
