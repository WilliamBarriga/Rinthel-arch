# Render: contrato puro, color por Paleta y pasos de revelado

Reescrito por el ADR 0008 (Sistema de Temas expresivo). Del original sobreviven el contrato puro del render, el color solo por nombre de Paleta, los iconos y los Pasos de revelado. El render hibrido (HTML/CSS para Nodos y Grupos, SVG para Aristas), el modelo de Temas, el relayout y la animacion estan en el ADR 0008. Los codigos de error de Tema de este ADR (herencia, duplicados) pasan al ADR 0008.

## Render puro, shell interactivo aparte

El render es una funcion pura de geometria y Estilo resuelto a una vista React, sin reloj externo ni estado propio de datos. El pan/zoom, el colapso y la seleccion viven en un shell interactivo separado que controla las mismas props. Se descarta React Flow como renderer: ELK ya entrega posiciones, puertos y rutas de aristas, y React Flow solo aportaria pan/zoom y culling. tldraw queda descartado por licencia de produccion.

### Contrato del componente

Props: `geometry` (salida del layout de una Vista), `width` y `height` en px, el Tema ya resuelto, `visibility: (id) => number` para Nodos y Aristas (0 oculto, 1 revelado; ver la decision de `visibility` en Pasos de revelado), `camera`/`viewBox` controlado, `onToggle` y `onSelect`. Sin dependencia de Next, Tailwind ni json-render; peer React 18 y 19.

- **Colapso por `view`, no por `expanded`**: el estado de colapso vive en la Vista resuelta (`resolveView(fuente, id, { expanded, collapsed })`), que decide que Nodos existen y con que Aristas elevadas. Duplicarlo en una prop daria dos fuentes de verdad. `onToggle(id)` solo avisa de que se pulso el control de un Grupo (que se dibuja si hay `onToggle`); quien controla el estado vuelve a resolver la Vista y a calcular el layout.
- El culling con miles de Nodos se resuelve con colapso y filtrado por viewport en el shell.
- El paquete `render` es independiente de cualquier consumidor (slides, video, web): este repo no depende de ellos ni los referencia en codigo. Como se integra en un repo consumidor lo decide ese repo.

## Color solo por nombre de Paleta

El Tema se declara en el DSL (bloque `theme`, en cualquier archivo del Workspace) y compila a la Fuente canonica; `render` recibe el objeto ya resuelto, sin logica de herencia. Un color se escribe unicamente por nombre de Paleta, en Tipos de nodo (`specification`), en Temas y en overrides de Vista; el valor literal (hex) vive solo dentro del bloque `palette` del Tema. Se descarta permitir hex en el Modelo: un cambio de Tema dejaria de recolorear todo. Error con codigo estable y archivo/linea: color de Paleta desconocido.

La seleccion de Tema (`--theme`, `--theme-path`, `theme` en la Vista, Tema por defecto) y el resto del modelo de Temas estan en el ADR 0008.

### Iconos

El nucleo trae un set pequeno de iconos genericos y acepta SVG del Workspace. Un icono se resuelve a SVG inline por un puerto del catalogo, de modo que un set de marcas opcional se enchufa sin tocar el nucleo; su eleccion queda en el research de iconos de marcas.

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
- Una funcion pura `revealAt(view, position: number)` convierte un paso en el `visibility(id)` del contrato de render: da siempre 0 o 1 y una fraccion cuenta como su parte entera. Los consumidores no reimplementan la logica.
- Sin `steps`, todo esta revelado. Un Grupo colapsado cuenta como visible si algun hijo esta revelado.
- El shell ofrece anterior/siguiente; el paso actual vive en el hash de URL, como el drill-down.
- Los codigos de error de validacion cubren pasos con ids o selectores inexistentes.
- Un Paso solo dispara la animacion `enter` de lo recien revelado (ADR 0008); sigue sin cambiar posicion.

### Decision: la visibilidad continua `0..1` se elimina del revelado (ticket de animacion)

Un Paso solo cambia que esta revelado; no tiene mecanismo de animacion propio (ADR 0008): lo recien revelado dispara el `enter` del Tema y lo que se oculta, su `exit`, ambos en CSS nativo. Por eso:

- `revealAt` ya no interpola: devuelve 0 o 1 y una posicion fraccionaria aplica el paso entero anterior. El fundido entre pasos es del Tema (`enter`/`exit`, con `stagger`), no de un numero continuo.
- El render distingue oculto (`visibility` 0, atributo `data-oculto`, sin clics) de visible; la entrada es la animacion `enter` del elemento que deja de estar oculto, y la salida la transicion `exit` hacia `data-oculto`. Sin `enter`/`exit` en el Tema el cambio es instantaneo. La prop opcional `nuevos` de `Diagram` acota el `stagger` a lo recien revelado.
- El tipo `Visibilidad` sigue devolviendo `number` y el render sigue pintando una opacidad intermedia si la recibe: no rompe a la shell, cuyo morph de layout (animacion de layout, que el ADR 0008 deja al codigo y no a lo declarativo) la usa para fundir Nodos que aparecen al cambiar de Vista. Nada del flujo de Pasos ni del DSL produce ya valores intermedios.
