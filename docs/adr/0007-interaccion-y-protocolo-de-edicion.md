# Interaccion y protocolo de edicion: Intenciones, reductor puro e historial

## Intencion: union discriminada por `tipo`

Toda edicion que nace de la interaccion es una `Intencion` (paquete `sesion`): una union discriminada por `tipo`. Hoy hay una variante, `mover-pin`, que es la `IntencionDePin` de `canonico` (`{ vista, nodo, x, y, hash }`) mas `tipo: 'mover-pin'`. Cada herramienta futura (redimensionar, renombrar, crear Arista) se agrega como una variante nueva con su rama en el reductor; no cambia el resto del protocolo.

La interfaz de red no cambia: el cuerpo de `POST /api/pin` sigue siendo `IntencionDePin` sin `tipo`, y la salida de `edit --json` y la respuesta del endpoint conservan su forma (ADR 0005). `tipo` es vocabulario interno del cliente y de `sesion`.

## Reductor puro

`aplicarIntencion(archivos, intencion)` devuelve los archivos nuevos o un rechazo con `motivo` (`MotivoDeRechazo`). Es puro: sin disco, reloj ni DOM, probado sin jsdom. `mover-pin` reutiliza `editarPin` como juntura (calculo de la edicion minima, auto-prueba y aplicacion en memoria). El texto del DSL sigue siendo la unica fuente editable (ADR 0001): una Intencion siempre se reduce a ediciones de texto.

## Historial de deshacer y rehacer

`Historial` es un valor inmutable sobre el texto del Workspace: `archivos` (vigente), `pasado` y `futuro` (instantaneas del mapa de archivos). `editarEnHistorial` aplica una Intencion y la apila, descarta el futuro y deja el historial intacto ante un rechazo; `deshacer` y `rehacer` devuelven otro historial, o `undefined` si no hay nada que hacer. Deshacer restaura el texto exactamente (byte a byte), no una edicion inversa. Se eligen instantaneas del mapa porque son baratas (los strings se comparten) y no pueden divergir del texto.

## Shell

`shell` expone `crearControlDeEdicion(archivos)` con `aplicar`, `deshacer`, `rehacer`, `puedeDeshacer` y `puedeRehacer`; es el adaptador con estado sobre el historial puro de `sesion`. El servidor de `dev` escribe a disco por `POST /api/pin`, `POST /api/edit`, `POST /api/deshacer` y `POST /api/rehacer`. `dev` guarda un `Historial` del texto propio del Workspace: cada edicion lo apila (`apilar`) y deshacer/rehacer escriben el texto exacto de la instantanea. Si el disco ya no coincide con el historial (edicion externa), responden 409 `hash-desactualizado` y el historial vuelve a empezar; sin nada que deshacer o rehacer, 422. La pagina de `dev` conecta Ctrl/Cmd+Z y Ctrl/Cmd+Mayus+Z (o Ctrl+Y) a esos endpoints, salvo con el foco en un campo de texto. `crearControlDeEdicion` sigue siendo el adaptador en memoria de `shell` para consumidores que tengan el texto en el cliente.

## Consecuencias

- El rechazo por hash desactualizado se mantiene: una Intencion se calcula contra el texto que vio quien la emite.
- Un historial por sesion de edicion; no persiste entre recargas.
- Se descarta una pila de ediciones inversas (fragil ante cambios de formato del DSL) y un historial de Intenciones reproducibles (el resultado dependeria del texto base).

## Enmienda: `pin x,y` es el centro del Nodo (#26, spec #24)

Las coordenadas de `IntencionDePin`, de `mover-pin` y del `pin x,y` escrito en el DSL son las del **centro** del Nodo, relativas a su Grupo padre (ADR 0003, ADR 0008). El Gesto de mover (`onMoveNode` en `shell`) avisa el centro de la caja soltada; `editarPin` sigue escribiendo la `Intencion` tal cual, sin conocer tamanos. La forma de las interfaces de red y de `edit --json` no cambia.
