# Render: nucleo SVG propio, tema modular y pasos de revelado

## Nucleo SVG propio puro, shell interactivo aparte

El render es una funcion pura de geometria y tema a SVG React, sin reloj ni estado propio. El pan/zoom (d3-zoom), el colapso y la seleccion viven en un shell interactivo separado que controla las mismas props. Se descarta React Flow como renderer: ELK ya entrega posiciones, puertos y rutas de aristas, asi que React Flow solo aportaria pan/zoom y culling, su export a imagen es raster (html-to-image fijado a 1.11.11), su ejemplo de colapso es Pro y obligaria a mantener un segundo renderer para export, slides y video. tldraw queda descartado por licencia de produccion. Un solo dibujo sirve a web, slides, video y export SVG/PNG.

### Contrato del componente

Props: `geometry` (salida del layout de una Vista), `width` y `height` en px, `theme` (tokens), `expanded` y `onToggle` (colapso controlado), `visibility: (id) => 0..1` para Nodos y Aristas (slides devuelve 0 o 1 por paso, video un valor interpolado del frame), `camera`/`viewBox` controlado y `onSelect`. Sin dependencia de Next, Tailwind ni json-render; peer React 18 y 19.

### Consecuencias

- El culling con miles de Nodos se resuelve con colapso (Grupos cerrados no se dibujan) y filtrado por viewport en el shell.
- El paquete `render` es independiente de cualquier consumidor (slides, video, web): este repo no depende de ellos ni los referencia en codigo. Como se instala o integra en un repo consumidor lo decide ese repo y queda fuera de este sistema. El export SVG estatico queda como camino secundario.
- Declarar pasos de revelado en la Vista (DSL) es azucar sobre `visibility`; ver la ultima seccion.

### Enmienda: colapso por `view`, no por `expanded`

El componente no recibe `expanded`: el estado de colapso ya vive en la Vista resuelta (`resolveView(fuente, id, { expanded, collapsed })`), que es lo que decide que Nodos existen y con que Aristas elevadas. Duplicarlo en una prop daria dos fuentes de verdad. `onToggle(id)` solo avisa de que se pulso el control de un Grupo (que se dibuja si hay `onToggle`); quien controla el estado vuelve a resolver la Vista y a calcular el layout.

## Tema modular, color solo por nombre de paleta

El Tema se declara en el DSL (bloque `theme`, en cualquier archivo del Workspace, fusionados como `specification`) y compila a la Fuente canonica; `render` recibe el objeto plano ya resuelto (contrato de render, arriba), sin logica de herencia. Se compone con partes con nombre (`palette`, `fonts`, `tokens`) que un tema referencia, y con `extends` de un solo padre para variantes (claro/oscuro, alto contraste). Un tema es un solo modo. El nucleo trae un Tema neutro por defecto; la paleta Rinthel es solo un ejemplo.

Un color se escribe unicamente por nombre de Paleta, en Tipos de nodo (`specification`) y en overrides de Vista; el valor literal (hex) vive solo dentro del Tema. Cascada: Tema, Tipo de nodo, override de la Vista. Se descarta permitir hex en el Modelo: un cambio de Tema dejaria de recolorear todo.

### Seleccion y alcance

- Tema global por `--theme <nombre>`; una Vista puede declarar `theme` y anularlo.
- Carpetas de temas adicionales por `--theme-path`, fusionadas antes del Workspace (el Workspace gana). Paquetes npm de temas, despues.
- Errores con codigo estable y archivo/linea: color de Paleta desconocido, ciclo de `extends`, nombre de tema duplicado.

### Relayout

El Tema no cambia el tamano de Nodos salvo por las fuentes, que se miden en el layout (ADR 0003): un cambio de fuente o tamano de texto relayouta; paleta e iconos no. El shell recarga al guardar el archivo de tema sin recompilar el Modelo.

### Iconos

El nucleo trae un set pequeno de iconos genericos y acepta SVG del Workspace, incrustados en el export (autocontenido). Un icono se resuelve a SVG inline por un puerto del catalogo, de modo que un set de marcas opcional se enchufa sin tocar el nucleo; su eleccion queda en el research de iconos de marcas.

## Pasos de revelado: bloque `steps` en la Vista, azucar sobre `visibility`

Una Vista puede declarar un bloque `steps` con Pasos ordenados. Es acumulativo: cada `step` agrega con `show` lo que se revela (y `hide` opcional lo oculta); lo anterior sigue visible. Nombrar un Nodo revela solo ese Nodo; un Grupo se revela con selector explicito (`a.b.*`, que revela el Grupo `a.b` y sus hijos directos; `a.b.**`, el Grupo y todos sus descendientes). Una Arista se revela sola cuando ambos extremos son visibles, salvo que un paso posterior la nombre (`edge a -> b`) para revelarla despues. Se descarta anotar `#step` en cada elemento: ensucia el Modelo con presentacion y esconde el orden.

```
view overview {
  include rinthel.**
  steps {
    step "Entrada" { show rinthel.api }
    step "Auth"    { show rinthel.api.auth, rinthel.api.auth -> rinthel.db }
  }
}
```

### Consecuencias

- El layout de ELK se calcula una vez con todos los elementos de la Vista; los pasos solo cambian visibilidad, nunca geometria. No hay relayout por paso ni saltos de posicion; el costo es espacio vacio reservado en los primeros pasos.
- Una funcion pura `revealAt(view, position: number)` convierte un paso en el `visibility(id)` del contrato de render: entero da 0/1 (slides), fraccion interpola con fundido (video). Los consumidores no reimplementan la logica.
- Sin `steps`, todo esta revelado. Un Grupo colapsado cuenta como visible si algun hijo esta revelado.
- El shell ofrece anterior/siguiente; el paso actual vive en el hash de URL, como el drill-down.
- Los codigos de error de validacion cubren pasos con ids o selectores inexistentes.
