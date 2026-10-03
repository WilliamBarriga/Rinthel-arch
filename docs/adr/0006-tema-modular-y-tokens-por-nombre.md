# Tema modular, color solo por nombre de paleta

El Tema se declara en el DSL (bloque `theme`, en cualquier archivo del Workspace, fusionados como `specification`) y compila a la Fuente canonica; `render` recibe el objeto plano ya resuelto (ADR 0003), sin logica de herencia. Se compone con partes con nombre (`palette`, `fonts`, `tokens`) que un tema referencia, y con `extends` de un solo padre para variantes (claro/oscuro, alto contraste). Un tema es un solo modo. El nucleo trae un Tema neutro por defecto; la paleta Rinthel es solo un ejemplo.

Un color se escribe unicamente por nombre de Paleta, en Tipos de nodo (`specification`) y en overrides de Vista; el valor literal (hex) vive solo dentro del Tema. Cascada: Tema, Tipo de nodo, override de la Vista. Se descarta permitir hex en el Modelo: un cambio de Tema dejaria de recolorear todo.

## Seleccion y alcance

- Tema global por `--theme <nombre>`; una Vista puede declarar `theme` y anularlo.
- Carpetas de temas adicionales por `--theme-path`, fusionadas antes del Workspace (el Workspace gana). Paquetes npm de temas, despues.
- Errores con codigo estable y archivo/linea: color de Paleta desconocido, ciclo de `extends`, nombre de tema duplicado.

## Relayout

El Tema no cambia el tamano de Nodos salvo por las fuentes, que se miden en el layout (ADR 0004): un cambio de fuente o tamano de texto relayouta; paleta e iconos no. El shell recarga al guardar el archivo de tema sin recompilar el Modelo.

## Iconos

El nucleo trae un set pequeno de iconos genericos y acepta SVG del Workspace, incrustados en el export (autocontenido). Un icono se resuelve a SVG inline por un puerto del catalogo, de modo que un set de marcas opcional se enchufa sin tocar el nucleo; su eleccion queda en el research de iconos de marcas.
