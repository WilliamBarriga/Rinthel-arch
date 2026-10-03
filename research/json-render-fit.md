# json-render como Fuente canonica? (t05)

Pregunta: json-render (catalogo + spec JSON + renderer) como formato canonico de diagramas, o esquema propio (Zod/JSON Schema)?

Fuentes: codigo local `/rinthel-disk/json-renderer` (HEAD c2600d7, `@json-render/core` 0.21.0, Apache-2.0, origen https://github.com/vercel-labs/json-render); notas `/rinthel-disk/json-render-learning/NOTES.md`; docs https://json-render.dev/docs/catalog . Rutas abajo relativas a `json-renderer/packages/`.

## Veredicto

**No adoptar json-render como Fuente canonica. Si reusar sus ideas/piezas sueltas** (SpecStream, forma `catalog.prompt()`/`jsonSchema()`, patron validate+autofix). Esquema propio en Zod, con grafo como ciudadano de primera. Razon central: el spec de json-render es un **arbol UI**, no un grafo/modelo.

## Hallazgos

### 1. Forma del spec = arbol plano de elementos UI
- `Spec = { root, elements: Record<key, UIElement>, state? }`; `UIElement = { type, props, children?: string[], slots?, visible?, on?, repeat?, watch? }` (`core/src/types.ts` ~L55-175).
- Relaciones = solo padre->hijo (`children`/`slots`). No hay aristas con tipo, ni refs entre nodos arbitrarios, ni Modelo separado de Vista. Un Modelo compartido por varias Vistas no se expresa nativo.
- `validateSpec` (`core/src/spec-validator.ts`) solo chequea integridad estructural UI: root, `missing_child`, `visible`/`on`/`repeat` mal ubicados, huerfanos opcionales. Sin validacion de aristas/refs cruzadas/ciclos de grafo. (`core/src/experimental-composition-tree.ts` L73 exige arbol sin ciclos ni hijos compartidos: confirma modelo arbol.)
- Para grafo habria que modelar aristas como elementos (`type: "Edge"`, props `from`/`to` string) -> refs sin validar por el schema; validacion de refs seria codigo propio igualmente.

### 2. Catalogo + validacion
- `defineCatalog(schema, {components:{props: zod, slots, description, example}, actions})` -> `catalog.validate()`, `zodSchema()`, `jsonSchema({strict})`, `prompt()` (`core/src/schema.ts`). Props validadas con Zod: buen encaje para componentes custom (nodo, grupo, icono de marca).
- `defineSchema` permite spec propio (`remotion/src/schema.ts` lo hace con `composition/tracks/clips`, no arbol). Se puede reusar la maquinaria de catalogo/prompt con spec de grafo. Pero el DSL interno (`s.object/record/ref/propsOf/map`) es un mini-lenguaje propio de json-render, no Zod directo.
- Limitacion documentada: `jsonSchema({strict:true})` emite `record` (mapas de clave dinamica, como `elements`) como objeto vacio opaco (`core/src/schema.ts` L112-125, L1547-1564). Un modelo `nodes: Record<id,...>` pierde validacion en JSON Schema estricto (salida estructurada LLM). Con esquema propio se elige `array` de nodos con `id`.

### 3. Streaming
- SpecStream: JSONL de JSON Patch (`add /elements/x`, `/clips/-`): `parseSpecStreamLine`, `applySpecPatch`, `compileSpecStream`, `createSpecStreamCompiler` (`core/src/types.ts` ~L572-870). Variante YAML (`yaml/README.md`: patch RFC 6902, merge RFC 7396, diff).
- Independiente de la forma del spec (patches sobre cualquier objeto; Remotion lo usa con `/clips/-`) -> **reusable para agentes que escriben diagramas incrementalmente**. Renderer React tolera specs incompletos (`react/src/streaming-render.test.tsx`).
- No requiere adoptar el spec: la idea (RFC 6902 sobre nuestro JSON) es copiable, o depender solo de `@json-render/core` para ello.

### 4. Renderer
- `@json-render/react` renderiza arbol de componentes React via registry (`react/src/renderer.tsx`). Nuestro render es grafo con layout (auto-layout jerarquico, pins, zoom/pan): nodos posicionados + aristas SVG. El renderer de json-render no aporta layout ni aristas; seria solo contenedor. Hay renderers para three-fiber, remotion, pdf, email, etc.; ninguno de grafos/diagramas (busqueda de xyflow/mermaid/diagram: sin hits relevantes).
- Extras que no necesitamos: `state`/`$state`, `visible`, `on`/acciones, `repeat`, forms, directives. Superficie grande orientada a apps interactivas; riesgo de acoplar nuestro formato a su evolucion (0.x).

### 5. Encaje con requisitos del mapa
| Requisito | json-render | Esquema propio |
|---|---|---|
| Modelo unico, N Vistas | no nativo (spec = 1 arbol) | Modelo + Vistas como entidades |
| Aristas/referencias validadas | no (props sueltas) | refinements Zod (refs a ids) |
| Drill-down | grupos via children ok; vistas enlazadas no | explicito |
| Pins/layout | props libres | campos tipados |
| Validable por esquema | si (Zod + JSON Schema, limite record) | si |
| Streaming por agentes | si (SpecStream) | copiar patron / reusar core |
| Componentes custom | si, bien | registry propio, mismo patron |
| Compilar desde DSL | cualquier cosa -> spec | idem |
| Video/slides | `@json-render/remotion` existe (no verificado vs OpenMotion, ver NOTES.md) | exportar a TimelineSpec despues |

## Recomendacion para decisiones siguientes
1. Fuente canonica: esquema propio en Zod (`Modelo{entities, relations}`, `Vista{type, selection, layout, pins}`), JSON Schema derivado; arrays con `id` en vez de records para salida estructurada estricta.
2. Tomar prestado de json-render: patron catalogo (Zod props + description + example -> prompt), `validateSpec`/`autoFixSpec`/`formatSpecIssues` como modelo del bucle de correccion de agentes (`core/src/spec-validator.ts` L384, L527), y SpecStream/JSON Patch para streaming.
3. Capa adaptadora (Vista -> spec json-render) solo si se quiere reusar renderers de otros targets (p. ej. remotion); no necesaria hoy.
4. Costo del camino propio: reimplementar validacion de refs y utilidades de patch (bajo).

## No verificado
- Docs web: solo se leyo https://json-render.dev/docs/catalog; `/docs/schemas` y `/docs/registry` no (codigo local como fuente primaria).
- Comportamiento del renderer ante ciclos en `children` (solo hay guarda `visiting` en el calculo de firmas, `react/src/renderer.tsx` ~L325).
- Encaje real con OpenMotion/slides-rinthel.
