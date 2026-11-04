# layout

Calcula la Geometria de una Vista con ELK y aplica los Pins.

## Que hace

- `layoutView` recibe una `VistaResuelta` y un Tema y devuelve la caja de cada Nodo visible y la ruta ortogonal de cada Arista.
- `claveDeLayout` y `claveDeEstructura` dicen cuando hace falta relayoutar.
- `aplicarPinsAGeometria` aplica los Pins sin volver a ejecutar ELK.
- `indiceDeGeometria` entrega cajas absolutas, el padre de cada Nodo y las raices.

## Que NO hace

- No define las Metricas ni la colocacion de Slots: las lee de `tema`.
- No dibuja: eso es de `render`.
- No guarda la geometria en disco: eso es de `cli`.
- No maneja el Worker del visor: eso es de `shell`.

## Depende de

`canonico` y `tema`. Dependencia externa: `elkjs`.

## Archivo de entrada

`packages/layout/src/index.ts` (la cabecera documenta invariantes y modos de error).

## ADR relacionado

`docs/adr/0003-layout-elk-geometria-cacheada.md`.

## Probar

`pnpm --filter layout test`
