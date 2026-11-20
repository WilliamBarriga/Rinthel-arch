# Interaccion y protocolo de edicion: Intenciones, reductor puro e historial

## Intencion: union discriminada por `tipo`

Toda edicion que nace de la interaccion es una `Intencion` (paquete `sesion`): una union discriminada por `tipo`. Hay dos variantes (la Enmienda: Rutas y escrituras de la UI suma `fijar-tema`): `ordenar-lifelines` (ADR 0009: `{ vista, orden }`, reescribe el `order` de una Vista de secuencia) y `mover-pin`, que es la `IntencionDePin` de `canonico` (`{ vista, nodo, x, y }`, sin `hash`) mas `tipo: 'mover-pin'`. La Intencion no lleva `hash`: la comprobacion de concurrencia es un parametro aparte, `visto`, de quien aplica (ver Reductor puro). Cada herramienta futura (redimensionar, renombrar, crear Arista) se agrega como una variante nueva con su rama en el reductor; no cambia el resto del protocolo.

En red toda Intencion viaja por `POST /api/edit` de `dev`, con su `tipo` y la `version` del estado que vio la pagina, sin `hash` (ver Protocolo de `dev`). La salida de `edit --json` y la respuesta del endpoint conservan su forma (ADR 0005). La ruta `POST /api/pin` (cuerpo `IntencionDePin` sin `tipo`) se retiro (#164).

## Reductor puro

`aplicarIntencion(archivos, intencion, visto?)` devuelve los archivos nuevos o un rechazo con `motivo` (`MotivoDeRechazo`). Es puro: sin disco, reloj ni DOM, probado sin jsdom. `mover-pin` es un Gesto interno de `sesion` (calculo de la edicion minima, auto-prueba y aplicacion en memoria). `visto` es un mapa archivo -> hash del texto que vio quien emite la Intencion. Se rechaza con `hash-desactualizado` solo si algun archivo que la edicion cambia difiere de `visto`; los archivos que no toca no cuentan. Sin `visto`, la Intencion se aplica sobre el texto vigente. La puerta de escritura es `aplicarAlWorkspace(puerto, aplicable, visto?)`; en `dev` la pagina manda la `version` del estado que vio y el Workspace vivo la traduce a `visto` con los hashes por archivo de esa version (guarda las ultimas 16; una version olvidada se rechaza como `hash-desactualizado`), y `diagrams edit` con `--hash <archivo>=<hash>`. El texto del DSL sigue siendo la unica fuente editable (ADR 0001): una Intencion siempre se reduce a ediciones de texto.

## Historial de deshacer y rehacer

`Historial` es un valor inmutable sobre el texto del Workspace: `archivos` (vigente), `pasado` y `futuro` (instantaneas del mapa de archivos). `editarEnHistorial` aplica una Intencion y la apila, descarta el futuro y deja el historial intacto ante un rechazo; `deshacer` y `rehacer` devuelven otro historial, o `undefined` si no hay nada que hacer. Deshacer restaura el texto exactamente (byte a byte), no una edicion inversa. Se eligen instantaneas del mapa porque son baratas (los strings se comparten) y no pueden divergir del texto.

## Shell

`shell` no expone un control de edicion con estado: el historial puro vive en `sesion`. El servidor de `dev` escribe a disco por `POST /api/edit`, `POST /api/deshacer` y `POST /api/rehacer`; `shell` no conoce esas rutas ni exporta clientes HTTP: avisa los Gestos (`onMoveNode`, `onReorderLifelines`) y quien escribe es la pagina de `dev`. `dev` guarda un `Historial` del texto propio del Workspace: cada edicion lo apila (`apilar`) y deshacer/rehacer escriben el texto exacto de la instantanea. Si el disco ya no coincide con el historial (edicion externa), responden 409 `hash-desactualizado` y el historial vuelve a empezar (reemplazado: ver Enmienda: Historial ante escrituras externas y editor de texto); sin nada que deshacer o rehacer, 422. La pagina de `dev` conecta Ctrl/Cmd+Z y Ctrl/Cmd+Mayus+Z (o Ctrl+Y) a esos endpoints, salvo con el foco en un campo de texto.

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

## Enmienda: Historial ante escrituras externas y editor de texto (#174, mapa #168)

- Una escritura externa ya no reinicia el Historial de `dev`. Deshacer y rehacer se rechazan con `hash-desactualizado` solo si algun archivo que la instantanea restaura cambio por fuera (la misma regla de `visto`); las entradas que no tocan ese archivo siguen validas.
- El editor de texto de la UI guarda solo con debounce (~400 ms) por la puerta de escritura con `visto`; cada guardado es una entrada del Historial de `dev` (origen propio). Con el foco en el editor, Ctrl/Cmd+Z usa el historial propio del editor; fuera, el de `dev`.
- Se guarda aunque el texto no compile; el lienzo conserva la ultima Fuente buena y los Gestos quedan deshabilitados con el motivo visible.

## Enmienda: Rutas y escrituras de la UI (#176, mapa #168)

Los tipos de estas rutas y eventos viven en `estudio/protocolo` (ADR 0004); `cli` importa de alli solo tipos. El cliente unico de la seccion Protocolo de `dev` se muda de `packages/cli/navegador/` a `estudio` y sigue siendo la unica pieza del navegador que conoce rutas.

### Escritura

- **Ediciones de texto por `POST /api/edit`**: ademas de una Intencion, acepta `{ ediciones: [{ file, range, replacement }], version, descripcion? }`, la misma forma y el mismo camino que `diagrams edit --edits`. Guardar desde el editor manda los cambios minimos del buffer (no el archivo entero); aplicar el `fix` de un issue manda su `IssueFix` tal cual, con la `version` del estado en que se vio, un issue por peticion (salvo "Aplicar todos los `fix`", que junta los visibles en una sola peticion; ver Enmienda: Fix masivo y salto en el Historial). No hay Intenciones `escribir-archivo` ni `aplicar-fix`: ambas son texto. El guardado del editor manda ademas `aunqueNoCompile: true`, que salta solo la auto-prueba de errores de la puerta (sigue rechazando hash, rango, solape y `archivo-desconocido`): asi se guarda aunque no compile; sin el campo (`fix`, "Aplicar N fix", `edit --edits`) un error nuevo rechaza con `invalida`. Sin `hash` por edicion, la `version` se traduce a `visto` por archivo (#190).
- **Intencion `fijar-tema`** `{ vista, tema? }`: reescribe el nombre en `theme <nombre>` de la Vista conservando su parche; sin `theme`, inserta `theme <nombre>` como primera linea del cuerpo de la Vista. Sin `tema`, quita la linea (la Vista vuelve al Tema por defecto); si habia parche, escribe `theme neutral { parche }` para no perderlo. Un Tema no declarado se rechaza con el motivo nuevo `tema-desconocido` (422). Solo por Vista: el DSL no tiene Tema de Workspace.
- Solo se escribe dentro del Workspace: un archivo de `--theme-path` se rechaza con `archivo-desconocido`.
- Errores sin cambio de esquema: 400 cuerpo malformado; 403/405/415 origen, metodo, content-type; 409 `hash-desactualizado`; 422 los demas motivos.

### Lectura

- `GET /api/archivos`: `{ version, archivos: [{ file, hash, soloLectura }] }`, los `.dg` del Workspace y los de `--theme-path` (estos con `soloLectura: true`). `EstadoDeDev` sigue sin hashes por archivo.
- `GET /api/archivo/<ruta>`: `{ file, texto, hash, version }`; la `version` es la base de la siguiente edicion del editor. 404 si no existe.
- `GET /api/inspect/<comando>/<argumento>` (`buscar`, `nodo`, `vista`, `interaccion`, `tema`; las opciones de `tema` en la query): el mismo JSON que `inspect --json` (`SalidaDeInspect`, mismo `contractVersion`); 404 con el mensaje y los ids cercanos si no existe. La lista de Temas de la galeria sale de `fuente.themes` del estado.
- `GET /api/vista/<id>?tema=<nombre>`: la Geometria de la Vista calculada con otro Tema (sus Metricas), para previsualizar sin escribir ni tocar el Historial; no se cachea entre pedidos. 404 si no existe la Vista o el Tema. El Estilo lo resuelve el navegador. No hay ruta de miniaturas.

### Historial visible

`dev` empuja el Historial por SSE como `event: historial` (aparte de `estado`, `actividad` (ADR 0005) y `diferencia`, la Diferencia con su origen y `version`): `{ pasado: [entrada], futuro: [entrada] }`, cada entrada `{ descripcion, archivos, cuando }` (la Enmienda: Fix masivo y salto en el Historial le suma `id` y `alcanzable`). La `descripcion` la arma el servidor segun la Intencion; en ediciones de texto es la `descripcion` de la peticion o, sin ella, "texto de `<archivo>`". Deshacer y rehacer siguen siendo de un paso; saltar a una entrada es una operacion aparte (misma enmienda).

## Enmienda: Fix masivo y salto en el Historial (#182, mapa #168)

- **Aplicar todos los `fix`**: actua sobre los issues con `fix` que el panel de Issues muestra con su filtro activo, de cualquier severidad. Viajan en **una** peticion `POST /api/edit { ediciones, version, descripcion }` (la misma ruta y el mismo reductor que `edit --edits`) y quedan como **una** entrada del Historial. Es todo o nada (`aplicarSobre`): ante `ediciones-solapadas` o `invalida` no se escribe nada y el usuario aplica uno por uno; ante 409 el panel se recalcula. No hay subconjunto automatico ni ruta, Intencion o cambio de CLI nuevos.
- **Saltar en el Historial**: operacion pura `saltar(historial, id)` en `sesion`, no deshacer/rehacer repetido; `dev` escribe una sola vez la instantanea destino por `POST /api/historial/saltar { id }`. Rechazo 409 `hash-desactualizado` con la misma regla que deshacer (algun archivo que la instantanea restaura cambio por fuera); 422 si el `id` no existe. Clic en una entrada del pasado lleva al estado justo despues de ella; en una del futuro rehace hasta ella inclusive; la fila "Inicio" vuelve al texto previo a la primera entrada. El salto no apila y conserva el futuro.
- **Entradas**: `event: historial` lleva `{ id, descripcion, archivos, cuando, alcanzable }`; `id` es un contador estable del proceso de `dev` y `alcanzable` lo calcula `dev` con la regla de rechazo. La isla de Historial lista lo mas reciente arriba, marca la posicion actual, atenua el futuro y deshabilita las entradas no alcanzables con el motivo; sin previsualizacion al pasar el mouse. Implementado en #193: el 422 lleva el motivo `entrada-desconocida`; `id` 0 es Inicio; cada entrada no alcanzable trae `motivo` y el evento suma `inicio: { alcanzable, motivo? }`; `dev` lo empuja al conectar y tras cada recompilacion.
