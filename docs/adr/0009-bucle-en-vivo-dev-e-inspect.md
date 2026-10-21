# Bucle en vivo (`dev`) y consulta del Modelo (`inspect`) para trabajo humano, agente o conjunto

El DSL de texto en git es el unico punto de coordinacion entre quien edita (humano, agente o ambos); el sistema no agrega bloqueos ni estado compartido.

## `diagrams dev --workspace <ruta>`

Comando de `cli` con un servidor HTTP de Node sin dependencias nuevas, que escucha solo en `127.0.0.1`. Sirve el shell empaquetado y la geometria por Vista; los cambios llegan al navegador por Server-Sent Events (el flujo es de un solo sentido). Observa el Workspace, recompila con debounce de ~150 ms y empuja la Vista y los issues. La pantalla muestra la Vista (elegida por el hash de URL) y un panel de issues clicables (`archivo:linea`). Si dos autores tocan el mismo `.dg`, gana la ultima escritura; la reconciliacion es de git. Se descarta WebSocket (no hace falta canal de ida) y cualquier bloqueo de edicion.

## `diagrams inspect`

Subcomandos de solo lectura: `buscar <texto>`, `nodo <id>`, `vista <id>`. Texto legible por defecto; `--json` imprime un objeto con su propio `contractVersion`, independiente del de `validate` (ADR 0008). Cada resultado trae id cualificado, tipo y `archivo:linea` del Ubicador.

## Skill para agentes

`diagrams skill` documenta `inspect` y `dev`; el bucle pasa a inspect, editar, validate.

## Fuera de alcance

La edicion estructurada del DSL (aplicar `fix`, mover Pins desde el shell, formateador) queda aparcada: es la unica capacidad que escribe en disco y roza el ADR 0008 (`validate --fix` descartado). Decidido en el ADR 0010.
