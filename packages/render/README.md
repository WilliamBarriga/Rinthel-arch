# render

Componente React `<Diagram>` que dibuja una Vista resuelta con su Geometria y el Estilo de un Tema.

## Que hace

- Dibuja Grupos (HTML), Aristas (SVG) y Nodos (HTML) en tres capas bajo un contenedor con una camara de pan/zoom.
- `resolverEstilo` convierte un Tema en el `Estilo` que leen los pintores; `hojaDeFuentes` emite la hoja de estilo determinista.
- Pinta los Estados visuales (`seleccionado`, `hover`, `fantasma`, `en-ruta`, `atenuado`, `foco`), el nivel de detalle y la visibilidad de los Pasos.
- Anima con CSS nativo y respeta reduced-motion.
- Acepta codigo del Workspace solo por la prop `componentes` (`ComponentesDeTema`).

## Que NO hace

- No calcula posiciones ni rutas: eso es de `layout`.
- No define el contenido ni valida un Tema: eso es de `tema`.
- No resuelve Vistas ni interpreta Pasos (`resolveView`, `revealAt`): eso es de `canonico`.
- No guarda estado de seleccion, hover ni camara, ni calcula `en-ruta`, `atenuado` o `foco`: eso es de `shell`.
- No toca disco, reloj ni red: es nucleo puro.

## Depende de

`canonico`, `layout` y `tema` (`docs/CODING.md`, "Direccion de dependencias"). Dependencia externa: peer `react` 18 o 19.

## Archivo de entrada

`packages/render/src/index.ts` (la cabecera documenta props, invariantes y modos de error).

## ADR relacionado

`docs/adr/0008-sistema-de-temas-expresivo.md` (render hibrido, Estilo y animacion) y `docs/adr/0002-render-tema-y-revelado.md` (contrato puro y color por Paleta).

## Probar

`pnpm --filter render test`
