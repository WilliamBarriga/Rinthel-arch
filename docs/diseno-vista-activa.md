# Diseno: forma final de `VistaActiva` (ticket #102, spec #91)

Complementa el ADR 0007. Describe como queda el shell tras la limpieza; no cambia comportamiento observable ni la interfaz publica salvo dos adiciones opcionales (`tuning`, `clock`) y el retiro del alias `IntencionDePinEnviada`.

## Estado de partida

`VistaActiva` (en `packages/shell/src/vista-interactiva.tsx`) sigue siendo el adaptador entre d3-zoom/DOM y el nucleo (`interaccion.ts`, `colapso.ts`, `geometria.ts`). El nucleo de intenciones e historial (#100) vive en `sesion` y `control-de-edicion.ts`, fuera de `VistaActiva`. Lo que queda dentro del componente: camara d3, arrastre de Nodos, seleccion, colapso con morph, pasos y navegacion por hooks.

## Un mecanismo para props controlados: `useControlado`

`controlado.ts` exporta `useControlado<T>(controlado, inicial, alCambiar) -> [vigente, fijar]`.

- `vigente` es `controlado` si el padre lo da; si no, el valor propio.
- `fijar(nuevo)` guarda el valor propio solo en modo no controlado, avisa `alCambiar` siempre, y en modo controlado re-renderiza para que d3 reconcilie un cambio que el padre ignoro.
- `fijar` lee refs, no su cierre: es seguro desde efectos y callbacks de larga vida (zoom de d3, `alLlegar` de `useGeometria`).

Usos: estado de colapso (`state`/`onStateChange`), camara (`camera`/`onCameraChange`, con `undefined` propio hasta el primer movimiento y el encuadre como respaldo), Paso (`step`/`onStepChange`) y ruta de navegacion (`path`/`onPathChange` + `onViewChange`). La seleccion no lo usa: su prop es un id (`string | null`) y su estado propio es una `Seleccion` con tipo de elemento; son representaciones distintas, no el mismo valor.

## Responsabilidades por archivo

- `colapso.ts`: Grupos. `buscarNodo`, `contarNodosVisibles`, `alternarGrupo`, tope `MAX_NODOS_VISIBLES`. Puro, sin camara ni animacion.
- `camara.ts`: camara. `encuadrar`, conversiones `aCamara`/`aTransform` con d3-zoom, `compensarCamara`.
- `morph.ts`: animacion. `interpolarGeometria`, `visibilidadDeMorph` (puras) y `useMorph`.
- `configuracion.ts`: `AjustesDeInteraccion` y `AJUSTES_POR_DEFECTO`.
- `controlado.ts`: el hook anterior.

## Configuracion en vez de constantes

Umbral de arrastre (3 px), tolerancia de acierto de Aristas (4 px), escala minima (0.05) y maxima (16) y margen de encuadre (24) pasan a `AjustesDeInteraccion`. `VistaInteractiva` acepta `tuning?: Partial<AjustesDeInteraccion>`; los valores por defecto reproducen los anteriores.

## Reloj como dependencia de `useMorph`

`useMorph(duracionMs, reloj?)` recibe un `RelojDeCuadros = (cuadro: (ahoraMs) => void) => () => void` (pide un cuadro, devuelve su cancelacion). El valor por defecto es el adaptador de `requestAnimationFrame` (`relojDelNavegador`); sin el, o con duracion 0, no hay animacion, como antes. `VistaInteractiva` lo expone como `clock?`. Las pruebas inyectan un reloj que avanzan a mano, sin stubs globales.

## Alias retirado

`IntencionDePinEnviada` (alias de `IntencionDePin`) se elimina de `enviar-pin.ts` y de `index.ts`. Nadie en el repo lo usa; `IntencionDePin` sigue reexportada desde `shell`.

## Hooks de arrastre y seleccion (ticket #109)

`VistaActiva` delega dos responsabilidades en hooks, sin cambiar comportamiento:

- `arrastre.ts`: `useArrastre` (gesto de raton de Nodos bajo `dev`, posicion provisional `desplazado`, bandera `arrastrando` para ignorar el clic posterior) e `idDeNodoBajo`.
- `seleccion.ts`: `useSeleccion` (Seleccion controlada por id o propia, `estados` para el render y `pulsar`).

## Fuera de alcance

Recortar el comentario de `index.ts` que duplica el JSDoc de los props no se hace aqui.
