# Interaccion y protocolo de edicion: Intenciones, reductor puro e historial

## Intencion: union discriminada por `tipo`

Toda edicion que nace de la interaccion es una `Intencion` (paquete `sesion`): una union discriminada por `tipo`. Hay dos variantes: `ordenar-lifelines` (ADR 0009: `{ vista, orden }`, reescribe el `order` de una Vista de secuencia) y `mover-pin`, que es la `IntencionDePin` de `canonico` (`{ vista, nodo, x, y }`, sin `hash`) mas `tipo: 'mover-pin'`. La Intencion no lleva `hash`: la comprobacion de concurrencia es un parametro aparte, `visto`, de quien aplica (ver Reductor puro). Cada herramienta futura (redimensionar, renombrar, crear Arista) se agrega como una variante nueva con su rama en el reductor; no cambia el resto del protocolo.

En red toda Intencion viaja por `POST /api/edit` de `dev`, con su `tipo` y la `version` del estado que vio la pagina, sin `hash` (ver Protocolo de `dev`). La salida de `edit --json` y la respuesta del endpoint conservan su forma (ADR 0005). La ruta `POST /api/pin` (cuerpo `IntencionDePin` sin `tipo`) se retiro (#164).

## Reductor puro

`aplicarIntencion(archivos, intencion, visto?)` devuelve los archivos nuevos o un rechazo con `motivo` (`MotivoDeRechazo`). Es puro: sin disco, reloj ni DOM, probado sin jsdom. `mover-pin` es un Gesto interno de `sesion` (calculo de la edicion minima, auto-prueba y aplicacion en memoria). `visto` es un mapa archivo -> hash del texto que vio quien emite la Intencion. Se rechaza con `hash-desactualizado` solo si algun archivo que la edicion cambia difiere de `visto`; los archivos que no toca no cuentan. Sin `visto`, la Intencion se aplica sobre el texto vigente. La puerta de escritura es `aplicarAlWorkspace(puerto, aplicable, visto?)`; en `dev` la pagina manda la `version` del estado que vio y el Workspace vivo la traduce a `visto` con los hashes por archivo de esa version (guarda las ultimas 16; una version olvidada se rechaza como `hash-desactualizado`), y `diagrams edit` con `--hash <archivo>=<hash>`. El texto del DSL sigue siendo la unica fuente editable (ADR 0001): una Intencion siempre se reduce a ediciones de texto.

## Historial de deshacer y rehacer

`Historial` es un valor inmutable sobre el texto del Workspace: `archivos` (vigente), `pasado` y `futuro` (instantaneas del mapa de archivos). `editarEnHistorial` aplica una Intencion y la apila, descarta el futuro y deja el historial intacto ante un rechazo; `deshacer` y `rehacer` devuelven otro historial, o `undefined` si no hay nada que hacer. Deshacer restaura el texto exactamente (byte a byte), no una edicion inversa. Se eligen instantaneas del mapa porque son baratas (los strings se comparten) y no pueden divergir del texto.

## Shell

`shell` no expone un control de edicion con estado: el historial puro vive en `sesion`. El servidor de `dev` escribe a disco por `POST /api/edit`, `POST /api/deshacer` y `POST /api/rehacer`; `shell` no conoce esas rutas ni exporta clientes HTTP: avisa los Gestos (`onMoveNode`, `onReorderLifelines`) y quien escribe es la pagina de `dev`. `dev` guarda un `Historial` del texto propio del Workspace: cada edicion lo apila (`apilar`) y deshacer/rehacer escriben el texto exacto de la instantanea. Si el disco ya no coincide con el historial (edicion externa), responden 409 `hash-desactualizado` y el historial vuelve a empezar; sin nada que deshacer o rehacer, 422. La pagina de `dev` conecta Ctrl/Cmd+Z y Ctrl/Cmd+Mayus+Z (o Ctrl+Y) a esos endpoints, salvo con el foco en un campo de texto.

## Protocolo de `dev` y cliente unico (#164, spec #153)

La pagina de `dev` tiene un solo modulo cliente (`packages/cli/navegador/cliente.ts`), la unica pieza del navegador que conoce rutas:

- **Estado**: `/eventos` (SSE, el estado al conectar y tras cada recompilacion) y `/api/estado`. Lleva la `version` y la clasificacion del `cambio` (`pintura` | `estructura` | `codigo`, ADR 0005); ya no lleva hashes por archivo ni el archivo de cada Vista.
- **Escritura**: `POST /api/edit` con `{ ...intencion, version }`; `POST /api/deshacer` y `POST /api/rehacer`. Un 409 `hash-desactualizado` recarga el estado y avisa.
- **Geometria**: `/api/vista/<id>`, validada con `geometriaCacheadaSchema` de `canonico`; una malformada se reporta y no se dibuja. La pagina pide solo la Geometria de la Vista activa, y la de otra Vista al navegar a ella. Tras un cambio `estructura` (o si se salto una version) vuelve a pedir la de la Vista activa y sigue mostrando el dibujo anterior hasta que llega; tras `pintura` o `codigo` no pide ninguna. Si una Geometria no llega, `VistaInteractiva` la calcula en el Worker.

## Consecuencias

- El rechazo por hash desactualizado se mantiene, pero lo decide `visto` (parametro de quien aplica), no un campo de la Intencion: una Intencion se calcula contra el texto que vio quien la emite.
- Un historial por sesion de edicion; no persiste entre recargas.
- Se descarta una pila de ediciones inversas (fragil ante cambios de formato del DSL) y un historial de Intenciones reproducibles (el resultado dependeria del texto base).

## Enmienda: `pin x,y` es el centro del Nodo (#26, spec #24)

Las coordenadas de `IntencionDePin`, de `mover-pin` y del `pin x,y` escrito en el DSL son las del **centro** del Nodo, relativas a su Grupo padre (ADR 0003, ADR 0008). El Gesto de mover (`onMoveNode` en `shell`) avisa el centro de la caja soltada; el Gesto `mover-pin` sigue escribiendo la `Intencion` tal cual, sin conocer tamanos. La forma de las interfaces de red y de `edit --json` no cambia.
