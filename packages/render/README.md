# render

Componente React `<Diagram>` que dibuja una Vista resuelta con su Geometria y el Estilo de un Tema.

## Que hace
- Dibuja Grupos (HTML), Aristas (SVG) y Nodos (HTML) en tres capas bajo una camara de pan/zoom.
- `resolverEstilo` convierte un Tema en el `Estilo` de los pintores; `hojaDeFuentes` emite la hoja determinista.
- Pinta Estados visuales, nivel de detalle y Pasos, anima con CSS (respeta reduced-motion) y acepta codigo solo por la prop `componentes`.

## Que NO hace
- No calcula posiciones ni valida Temas: eso es de `layout` y `tema`.
- No resuelve Vistas ni interpreta Pasos: eso es de `canonico`; el estado de seleccion y camara es de `shell`.
- No toca disco, reloj ni red: es nucleo puro.

## Depende de
`canonico`, `layout` y `tema` (`docs/CODING.md`, "Direccion de dependencias"). Dependencia externa: peer `react` 18 o 19.

## Archivo de entrada
`packages/render/src/index.ts` (la cabecera documenta props, invariantes y modos de error).

## ADR relacionado
`docs/adr/0008-sistema-de-temas-expresivo.md` (render hibrido, Estilo y animacion) y `docs/adr/0002-render-tema-y-revelado.md` (contrato puro y color por Paleta).

## Probar
`pnpm --filter render test`
