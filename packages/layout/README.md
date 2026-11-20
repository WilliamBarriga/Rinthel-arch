# layout
Calcula la Geometria de una Vista (ELK para architecture, flow y er; algoritmo propio para sequence) y aplica los Pins.

## Que hace
- `layoutView` da la caja de cada Nodo visible y la ruta ortogonal de cada Arista de una `VistaResuelta`.
- `layoutView` elige por `vista.type`: ELK en capas para grafos; en `sequence`, `layoutSecuencia` (interno, `src/secuencia.ts`) coloca Lifelines (columnas) y Mensajes (filas) sin ELK. La Geometria es una union por `kind` (`grafo` o `secuencia`). Los tipos de Geometria no se declaran aqui: salen del esquema de `canonico` (`geometriaSchema`) y se importan de `canonico`.
- `layoutConMetricas` es `layoutView` sobre Metricas ya resueltas, sin el Tema: lo corre el Worker (`shell`), que no empaqueta el esquema del Tema. `render` debe dibujar con las mismas Metricas.
- `claveDeLayout` y `claveDeEstructura` dicen cuando relayoutar; `aplicarPinsAGeometria` aplica Pins sin ELK; `indiceDeGeometria` entrega cajas absolutas, el padre de cada Nodo y las raices.

## Que NO hace
- No define las Metricas ni la colocacion de Slots: las lee de `tema`.
- No dibuja ni maneja el Worker del visor: eso es de `render` y `shell`.
- No guarda la geometria en disco: eso es de `cli`.

## Depende de
`canonico` y `tema`. Dependencia externa: `elkjs`.

## Archivo de entrada
`packages/layout/src/index.ts` (la cabecera documenta invariantes y modos de error).

## ADR relacionado
`docs/adr/0003-layout-elk-geometria-cacheada.md`.

## Probar
`pnpm --filter layout test`
