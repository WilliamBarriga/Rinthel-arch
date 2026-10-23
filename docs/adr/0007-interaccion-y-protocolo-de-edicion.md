# Interaccion y protocolo de edicion: Intenciones, reductor puro e historial

## Intencion: union discriminada por `tipo`

Toda edicion que nace de la interaccion es una `Intencion` (paquete `sesion`): una union discriminada por `tipo`. Hoy hay una variante, `mover-pin`, que es la `IntencionDePin` de `canonico` (`{ vista, nodo, x, y, hash }`) mas `tipo: 'mover-pin'`. Cada herramienta futura (redimensionar, renombrar, crear Arista) se agrega como una variante nueva con su rama en el reductor; no cambia el resto del protocolo.

La interfaz de red no cambia: el cuerpo de `POST /api/pin` sigue siendo `IntencionDePin` sin `tipo`, y la salida de `edit --json` y la respuesta del endpoint conservan su forma (ADR 0005). `tipo` es vocabulario interno del cliente y de `sesion`.

## Reductor puro

`aplicarIntencion(archivos, intencion)` devuelve los archivos nuevos o un rechazo con `motivo` (`MotivoDeRechazo`). Es puro: sin disco, reloj ni DOM, probado sin jsdom. `mover-pin` reutiliza `editarPin` como juntura (calculo de la edicion minima, auto-prueba y aplicacion en memoria). El texto del DSL sigue siendo la unica fuente editable (ADR 0001): una Intencion siempre se reduce a ediciones de texto.

## Historial de deshacer y rehacer

`Historial` es un valor inmutable sobre el texto del Workspace: `archivos` (vigente), `pasado` y `futuro` (instantaneas del mapa de archivos). `editarEnHistorial` aplica una Intencion y la apila, descarta el futuro y deja el historial intacto ante un rechazo; `deshacer` y `rehacer` devuelven otro historial, o `undefined` si no hay nada que hacer. Deshacer restaura el texto exactamente (byte a byte), no una edicion inversa. Se eligen instantaneas del mapa porque son baratas (los strings se comparten) y no pueden divergir del texto.

## Shell

`shell` expone `crearControlDeEdicion(archivos)` con `aplicar`, `deshacer`, `rehacer`, `puedeDeshacer` y `puedeRehacer`; es el adaptador con estado sobre el historial puro de `sesion`. El servidor de `dev` mantiene `POST /api/pin` como unica escritura a disco; llevar deshacer/rehacer al disco de `dev` (escribir el texto restaurado con el hash vigente) queda para el ticket que conecte los atajos de teclado.

## Consecuencias

- El rechazo por hash desactualizado se mantiene: una Intencion se calcula contra el texto que vio quien la emite.
- Un historial por sesion de edicion; no persiste entre recargas.
- Se descarta una pila de ediciones inversas (fragil ante cambios de formato del DSL) y un historial de Intenciones reproducibles (el resultado dependeria del texto base).
