# Actividad del CLI hacia `dev`: opciones en el codigo

Ticket: #171 (mapa #168 "UI de dev"). Pregunta: cual es la forma mas reutilizable y escalable de que la UI de `dev` vea en tiempo real lo que un agente hace con el CLI `diagrams` (`validate`, `inspect`, `edit`, `build`) desde otro proceso. No decide el contrato: eso es #172.

Fuente primaria: el codigo de `main` en `20c5efe` (tras #153). Las referencias `archivo:linea` son de ese commit. Research previo revisado (`docs/ramas.md`, `git branch -a -l '*research/*'`): ninguna rama trata este tema.

## Conclusion

Recomendacion: **un log de actividad append-only por Workspace (opcion b) como canal canonico**, que escribe el CLI en un unico punto y que `dev` observa por un puerto propio. Se complementa con **diff de Sesiones dentro del Workspace vivo (opcion d)** para resaltar en el lienzo lo que cambio, haya o no CLI de por medio. La opcion (a) (POST al `dev` vivo) queda como transporte de baja latencia que se puede sumar despues sin cambiar el esquema del evento; la (c) (ejecutar a traves de `dev`) se descarta como canal de actividad.

Motivos, en corto:

- El log es el unico canal que funciona igual con `dev` corriendo o no, con varios agentes y con varios `dev`, y que sirve a consumidores distintos de `dev` sin acoplarse a el (cualquiera hace `tail -f`).
- No abre superficie de red nueva: no hay endpoint que proteger.
- Encaja con el reparto actual: `cli` es el unico paquete con I/O (`packages/cli/src/index.ts:4`) y el Workspace vivo ya se prueba con puertos en memoria y reloj falso (`packages/cli/src/workspace-vivo.ts:1-10`, `packages/cli/src/puerto-en-memoria.ts`).
- Una buena parte de lo que hace un agente no pasa por el CLI: edita el `.dg` con sus propias herramientas (skill `rinthel-diagramas`, paso 2 del bucle). El watcher de `dev` ya ve esos cambios. Resaltar en el lienzo no necesita canal entre procesos; el feed de comandos y el "que Vista esta mirando" (comandos de solo lectura, que no dejan rastro en disco) si lo necesitan.

Dos hallazgos del codigo condicionan cualquier opcion que use `.diagrams/`:

1. **`build` borra `.diagrams/` entero.** `ejecutar` llama `escribir(raiz, ...)` sin subcarpeta (`packages/cli/src/index.ts:158`) y `escribirSalida` hace `rmSync(join(destino, subcarpeta), { recursive: true })` con `subcarpeta = ''` (`packages/cli/src/workspace.ts:85-91`). Un archivo de puerto o un log en `.diagrams/` desapareceria en cada `build`. Hay que hacer que `build` reemplace solo lo suyo (`canonico.json` y `geometria/`, ver `packages/sesion/src/sesion.ts:40`); el parametro `subcarpeta` ya existe.
2. **El watcher de `dev` ignora las carpetas ocultas.** `observarDisco` descarta cualquier ruta con un segmento que empieza por `.` (`packages/cli/src/dev.ts:71-76`). Es correcto (evita recompilar por `.diagrams/` o `.git/`), pero significa que `dev` no ve hoy nada de `.diagrams/`; hace falta un observador aparte.

## Mapa del codigo relevante

| Pieza | Donde | Que importa aqui |
|---|---|---|
| Entrada del proceso | `packages/cli/src/bin.ts:4-7` | Unico sitio que conoce `argv` y el `ResultadoDeEjecucion` final; `run` no escribe en el proceso (`index.ts:3`). Punto de enganche natural para emitir un evento por comando. |
| Despacho | `packages/cli/src/index.ts:58-86` | `run(argv, dependencias)`; `edit`, `inspect`, `dev` se despachan en `:65-67`; `validate`/`build` en `ejecutar` (`:118-168`). |
| Dependencias inyectables | `packages/cli/src/index.ts:28-33` | Patron ya usado para `leer`/`escribir`; un `registrarActividad?` cabe aqui sin romper pruebas. |
| `edit` | `packages/cli/src/comando-edit.ts:24`, `:109` | Escribe por `aplicarAlWorkspace`; la salida trae `edits` y `files`: datos utiles para el evento. |
| `inspect` | `packages/cli/src/comando-inspect.ts:47`, `:56` | Comando y argumento (`vista <id>`, `nodo <id>`) dicen que mira el agente: insumo de "seguir la Vista que toca". |
| Puerta de escritura | `packages/sesion/src/aplicar.ts:13-16`, `:34-46` | `PuertoDeWorkspace { leer, escribir }`; devuelve `cambiados` y `ediciones`. Es nucleo puro (`docs/CODING.md:49`): no debe emitir actividad el mismo, eso es del adaptador. |
| Workspace vivo | `packages/cli/src/workspace-vivo.ts:25-32`, `:69-86` | `PuertoDelWorkspaceVivo` (extiende `PuertoDeWorkspace` con `borrar`, `recursos`, `observar`) y `WorkspaceVivo` (`estado`, `suscribir`, `editar`...). |
| Recompilacion | `packages/cli/src/workspace-vivo.ts:145-171` | Tiene a mano la Sesion buena anterior y la nueva: aqui se puede calcular que Nodos/Aristas/Vistas cambiaron (opcion d). |
| Historial ante cambio externo | `packages/cli/src/workspace-vivo.ts:277-282`, `:288-293` | Un `edit` desde otro proceso reinicia el Historial de `dev`; relevante para (c). |
| Servidor | `packages/cli/src/dev.ts:155-317` | Host check (`:221`), Origin y `application/json` en POST (`:180-196`), SSE con `data:` sin nombre de evento (`:168-172`, `:274-278`), `listen` en `127.0.0.1` (`:297`). |
| Estado empujado | `packages/canonico/src/estado.ts:24-35` | `EstadoDeDev` (version, cambio, fuente, issues...). Un evento de actividad no es estado: no deberia ir dentro. |
| Cliente del navegador | `packages/cli/navegador/cliente.ts:21-23`, `:66` | `eventos(url, alMensaje)` solo entiende mensajes sin nombre; para un segundo tipo de mensaje hay que pasar el nombre del evento o abrir otra ruta SSE. |
| Escritura atomica | `packages/cli/src/workspace.ts:100-110` | `escribirTexto` usa temporal + `rename`; sirve para un archivo de descubrimiento, no para un log (un append no se hace con rename). |

## Opciones

### (a) El CLI descubre el `dev` vivo y le hace POST

Como seria: al hacer `listen` (`dev.ts:297`), `dev` escribe `<workspace>/.diagrams/dev/<pid>.json` con `{ pid, puerto, raiz, token }` y lo borra en `cerrar` (`dev.ts:309-314`). El CLI, en `bin.ts` tras `run`, lee esa carpeta y hace `POST /api/actividad` a cada `dev` con un plazo corto.

- **Enganches**: `bin.ts:4-7` (emisor), `dev.ts:227` (nueva ruta junto a `/api/edit`), `dev.ts:168-172` (reenvio por SSE), `workspace.ts:85-91` (que `build` no borre el archivo).
- **Costo**: medio. Ruta nueva, archivo de descubrimiento con limpieza, cliente HTTP en el CLI con plazo, esquema en `canonico`. Cada comando paga un `connect` + POST (pocos ms en localhost; si el puerto murio, `ECONNREFUSED` inmediato). Hay que esperar la respuesta o el proceso termina antes de mandarla.
- **Si `dev` no corre**: no queda rastro. Al abrir la UI despues no hay historia. Si `dev` murio con `SIGKILL`, queda un archivo huerfano; el CLI debe tolerar `ECONNREFUSED` o comprobar el `pid`.
- **Concurrencia**: varios agentes, sin problema (el event loop serializa). Varios `dev` del mismo Workspace: hace falta un archivo por proceso y que el CLI publique a todos (fan-out en el emisor). Un `dev` con otro `--workspace` que contiene al primero no se entera.
- **Seguridad**: el chequeo de Host (`dev.ts:221`) y de Origin + `application/json` (`dev.ts:180-196`) ya frenan DNS rebinding y CSRF desde el navegador. El CLI de Node no manda `Origin`, asi que pasa. Cualquier proceso local podria inyectar actividad falsa; es inocuo (solo se muestra) pero un `token` en el archivo, con permisos `0600`, lo cierra. Superficie nueva: un endpoint de escritura mas.
- **Otros consumidores**: solo quien sea servidor HTTP y publique su puerto. Una TUI o un registro de auditoria tendrian que levantar servidor propio. Poco reutilizable.

### (b) El CLI escribe un log de actividad que `dev` observa

Como seria: en `bin.ts` (o en `run` con una dependencia `registrarActividad`), tras cada comando, el CLI agrega una linea JSON a `<raiz resuelta>/.diagrams/actividad.jsonl`: comando, argumentos normalizados, codigo de salida, duracion, resumen (errores y avisos, archivos cambiados por `edit`, Vista o Nodo consultado), `pid` y un id opcional de agente. `dev` observa ese archivo con un observador propio, lee desde el ultimo offset y empuja cada evento por SSE.

- **Enganches**: `bin.ts:4-7` o `index.ts:28-33` (emisor, un solo punto para todos los comandos); `workspace-vivo.ts:25-32` (agregar al puerto algo como `observarActividad(alEvento)`, con su version en `puerto-en-memoria.ts` para probar sin disco) o un modulo hermano "Actividad" que no toque el Workspace vivo; `dev.ts:71-76` (no se toca: el observador del log es otro); `dev.ts:168-172` y `cliente.ts:23` (segundo tipo de mensaje SSE); `workspace.ts:85-91` (que `build` no borre el log).
- **Costo**: medio-bajo. Esquema del evento en `canonico` (como `estadoDeDevSchema`), un `appendFileSync` en el CLI, un lector con offset en `dev`, y el arreglo de `build`. Sin red, sin plazos, sin limpieza de huerfanos.
- **Si `dev` no corre**: el log queda. Al arrancar, `dev` puede mostrar los ultimos N eventos (contexto de lo que paso antes de abrir la UI). Hace falta un tope de tamano: el escritor rota (`actividad.jsonl` -> `actividad.1.jsonl`) al pasar un umbral, y el lector tolera que el archivo se acorte.
- **Concurrencia**: varios agentes agregan al mismo archivo. Con `O_APPEND` el kernel coloca cada `write` al final; en Linux, en disco local, una linea corta escrita con un solo `write` no se intercala en la practica, aunque POSIX solo garantiza la posicion, no la atomicidad de cualquier tamano. Mitigacion: lineas pequenas (resumen, no la salida completa), un solo `write` por evento y un lector que descarta lineas que no parsean. Varios `dev` leen el mismo archivo: fan-out gratis en el lector. Si el Workspace es de solo lectura, el CLI debe ignorar el fallo de escritura y seguir.
- **Seguridad**: sin red; no hay Host ni Origin que chequear. El log vive dentro del Workspace (ya en `.gitignore`: `.diagrams/`). Contiene argumentos de linea de comando (rutas, ids); no hay secretos que el CLI maneje. `dev` debe mostrarlo como texto, no como HTML.
- **Otros consumidores**: cualquiera sin coordinarse con `dev`. Por ejemplo `tail -f`, una TUI, la UI de una extension de editor, pruebas e2e que comprueben que comandos corrio un agente, `pnpm capturas` (`scripts/capturas.ts:157`) para saber que Vista capturar, o una auditoria posterior de una sesion de agente. Es el canal mas reutilizable.
- **Tension con el ADR 0005**: `validate` es "de solo lectura" (ADR 0005, contrato de `validate`). Escribir un log en `.diagrams/` no toca el DSL y `build` ya escribe ahi, pero es un efecto lateral nuevo de `validate` e `inspect`. Hay que enmendar el ADR y conviene una forma de desactivarlo (variable de entorno o flag).

### (c) Los comandos se ejecutan a traves de `dev`

Como seria: si hay un `dev` vivo, el CLI le manda `argv` (`POST /api/run`) y `dev` ejecuta `run(argv, dependencias)` en su proceso, o rutea `edit` a `vivo.editar` (`workspace-vivo.ts:251`). La actividad sale gratis porque todo pasa por `dev`.

- **Enganches**: `index.ts:58` (`run` ya es invocable en proceso y no escribe en el proceso), `workspace-vivo.ts:251-284` (cola y Historial), `dev.ts:227` (ruta nueva), `bin.ts` (proxy o ejecucion local).
- **Costo**: alto. Ejecucion remota de comandos que escriben a disco (`build`, `edit`); hay que reenviar stdout, stderr y el codigo de salida; validar que `--workspace` y `--theme-path` coinciden con los de `dev`; mantener dos caminos (local y via `dev`) que pueden divergir: `dev` responde con su Sesion vigente o la ultima buena, el CLI lee el disco fresco.
- **Si `dev` no corre**: el CLI cae al camino local y no hay actividad. Es la peor combinacion: dos implementaciones y sin rastro.
- **Concurrencia**: es la mejor en escrituras. La cola de `dev` serializa y una edicion del agente entra al Historial, asi que se puede deshacer desde la UI. Hoy, en cambio, un `edit` externo reinicia el Historial (`workspace-vivo.ts:277-282`, `:288-293`). Con varios `dev`, hay que elegir a cual mandar.
- **Seguridad**: es la peor. Un endpoint que ejecuta comandos de escritura exige token obligatorio, porque Host + Origin no bastan contra otro proceso local. Contradice "el sistema no agrega bloqueos ni estado compartido" y "el DSL en git es el unico punto de coordinacion" (ADR 0005, "Bucle en vivo").
- **Otros consumidores**: ninguno nuevo; todo queda atado a `dev`.

La ventaja real de (c), que el agente pueda deshacer desde la UI, no necesita que el comando corra en `dev`. Se puede lograr haciendo que el Workspace vivo apile un cambio externo en el Historial en vez de reiniciarlo, cuando el texto previo coincide con `historial.archivos`. Es una decision del Historial, no del canal de actividad.

### (d) Diff de Sesiones en el Workspace vivo (sin canal entre procesos)

Como seria: en `recompilarUnaVez` (`workspace-vivo.ts:145-171`), con `buena.sesion.fuente` (antes) y `sesion.fuente` (despues), calcular los ids de Nodos, Aristas y Vistas agregados, quitados o cambiados, y mandarlos junto al `cambio`. Es un campo aditivo de `EstadoDeDev` (`estado.ts:24`) o un evento aparte.

- **Costo**: bajo. Pura y probable con el puerto en memoria (`puerto-en-memoria.ts:42`, `editarFuera`). `clasificarCambio` (`cambio.ts:32`) ya compara Fuentes.
- **Cubre** `edit` y las ediciones directas del `.dg` (el caso mas comun del agente), con `dev` corriendo. No cubre `validate`, `inspect` ni `build`, ni sabe quien hizo el cambio.
- **Seguridad y concurrencia**: las mismas de hoy; no agrega nada.
- **Consumidores**: la UI. Tambien seria util para un `diagrams diff` futuro si el calculo vive en `sesion` en vez de en `cli`.

Es complementaria: resalta en el lienzo sin depender del canal; el canal aporta el feed y el "de quien".

### (e) Socket de dominio Unix en `.diagrams/`

Variante de (a): `dev` escucha tambien en `.diagrams/dev.sock` y el CLI se conecta ahi. No hay puerto que descubrir ni Host que chequear; los permisos del archivo dan la autenticacion. Comparte con (a) todo lo demas: no hay rastro sin `dev`, quedan huerfanos, hace falta fan-out con varios `dev` y el canal sirve a un solo consumidor. Ademas en Windows funciona distinto (named pipes). No aporta frente a (b).

### (f) `dev` observa las salidas de `build`

`dev` podria vigilar `.diagrams/canonico.json` para saber que hubo un `build`. Solo cubre `build`, sin argumentos ni resultado; queda absorbida por (b).

## Comparacion

| | (a) POST | (b) log | (c) via dev | (d) diff |
|---|---|---|---|---|
| Comandos de solo lectura | si | si | si | no |
| Sin `dev` corriendo | se pierde | queda, se reproduce al abrir | cae a local, se pierde | no aplica |
| Varios agentes | si | si (lineas cortas) | si, serializado | si |
| Varios `dev` | fan-out en el emisor | fan-out gratis | elegir uno | cada uno el suyo |
| Superficie de red nueva | endpoint de escritura | ninguna | endpoint que ejecuta | ninguna |
| Otros consumidores | solo servidores | cualquiera | ninguno | la UI (y un `diff`) |
| Costo | medio | medio-bajo | alto | bajo |

## Recomendacion argumentada

1. **Canal: (b)**, con un esquema de evento versionado en `canonico` (como `estadoDeDevSchema`, `estado.ts:24`) para que productor, `dev`, UI y terceros validen lo mismo.
2. **Emisor en un solo punto del CLI**: un envoltorio de `run` en `bin.ts:4-7`, o una dependencia `registrarActividad` en `Dependencias` (`index.ts:28-33`) con no-op por defecto en pruebas. Asi ningun comando lo repite y `sesion` sigue pura. El evento lo arma el CLI con lo que ya devuelve cada comando: `exitCode`, `summary` de `validate`/`build`, `files` de `edit`, comando y argumento de `inspect`.
3. **Ruta resuelta**: el CLI escribe en `resolve(--workspace)/.diagrams/...` y `dev` lee la misma ruta, asi coinciden sin importar el `cwd`.
4. **Arreglar `build`** para que reemplace solo `canonico.json` y `geometria/` (`index.ts:158`, `workspace.ts:85-91`). Hace falta con cualquier opcion que use `.diagrams/`.
5. **Lector en `dev` detras de un puerto** (un metodo nuevo en `PuertoDelWorkspaceVivo` o un modulo "Actividad" hermano), con adaptador de disco (`fs.watch` del archivo y lectura por offset) y adaptador en memoria para pruebas. Se empuja por SSE como evento con nombre (`event: actividad`), sin mezclarlo con `EstadoDeDev`. Para eso `cliente.ts:23` necesita aceptar el nombre del evento.
6. **(d) en el Workspace vivo** para resaltar lo cambiado en el lienzo. La UI puede cruzar ambos: un evento `edit` con `files` y el diff de la siguiente `version`.
7. **(a) queda como optimizacion opcional**: el mismo evento por POST si se mide que la latencia de `fs.watch` molesta. No hace falta para empezar.

## Preguntas abiertas para #172

- Nombre y forma del archivo: `.diagrams/actividad.jsonl` o una carpeta `.diagrams/actividad/`. Tope de tamano y rotacion.
- Campos del evento: argumentos completos o normalizados, resumen por comando, `pid`, id de agente (p. ej. una variable de entorno opcional que el harness pueda fijar sin romper el agnosticismo).
- Activado por defecto o con opt-in o opt-out, y la enmienda al ADR 0005 por el nuevo efecto lateral de `validate` e `inspect`.
- Si `dev` reproduce los ultimos N eventos al arrancar o solo muestra lo nuevo.
- Si el diff de Sesiones vive en `sesion` (reutilizable por un futuro `diff`) o en el Workspace vivo.
- Fuera de este ticket, para el Historial: apilar un cambio externo en vez de reiniciar, para que la UI pueda deshacer lo que hizo el agente.
