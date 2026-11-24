---
name: rinthel-diagramas
description: Escribir, validar y servir diagramas .dg (Nodos, Aristas, Vistas, Pasos; Tipos de diagrama architecture, flow, sequence y er) con el CLI `diagrams` de rinthel-arch. Usalo al crear o editar un Workspace, escribir una Interaccion o una tabla ER, arreglar issues de validate, reordenar Lifelines o mostrar un diagrama al usuario.
---

# Diagramas: escribir y servir

Un **Workspace** es una carpeta de `.dg`; el DSL de texto es la unica fuente editable (ADR 0001). `.diagrams/` es salida derivada: se regenera, no se edita. Vocabulario exacto en `CONTEXT.md` (Modelo, Vista, Pin, Paso).

El CLI es `diagrams` (abreviado `dg`; si no esta instalado, `node <rinthel-arch>/packages/cli/dist/bin.js` tras `pnpm build` en ese repo). `dg <comando> --help` es la fuente de las opciones. Las rutas `docs/` y `examples/` de abajo son del repo rinthel-arch.

## Bucle

1. **Ubicar**: `dg inspect search <texto> --workspace <ruta>` da ids cualificados y `archivo:linea`. Usa ids que `inspect` devolvio.
2. **Editar** el `.dg`. Sintaxis en `docs/guia/referencia-dsl.md`; ejemplo vivo: `examples/rinthel-arch/`.
3. **Validar**: `dg validate --workspace <ruta> --json`. Aplica primero cada `fix` (por `dg edit --edits '<json>'` o a mano), lee `hint` cuando no hay `fix`, y guiate por `code` (estable; `message` cambia).
4. **Cerrar** cuando `ok` es `true` y el resumen no trae errores. Con `--strict`, tambien sin avisos.
5. **Mirar** el resultado (abajo) cuando el cambio es visual: una Vista nueva, Pins, Pasos.

## Elegir el Tipo de diagrama

El Tipo (`type` de la Vista) decide como se dibuja el mismo Modelo; el Modelo no cambia.

| El usuario quiere... | `type` | Que se escribe |
| --- | --- | --- |
| Piezas y sus dependencias | `architecture` | Nodos y Aristas; `include`, `depth`, `pin` |
| Un recorrido paso a paso por piezas | `flow` | Lo mismo mas `steps { show/hide }` |
| Quien llama a quien y en que orden | `sequence` | Una `interaction` en `model` y una Vista que la proyecta |
| Tablas, columnas y claves foraneas | `er` | Atributos con `pk fk uk` y Aristas con cardinalidad |

Un mismo Modelo admite varias Vistas de Tipos distintos. Detalle de cada sintaxis: `docs/guia/referencia-dsl.md` (secciones Interacciones, Vista de secuencia, Vistas `er`).

## Secuencia

Una **Interaccion** es un escenario ordenado entre Nodos del Modelo (las Lifelines); la Vista `sequence` la proyecta. Este ejemplo valida tal cual:

```
specification { node servicio { description "Un servicio" icon box color blue } }
model {
  servicio cliente "Cliente"
  servicio api "API"
  servicio db "Base de datos"
  interaction compra "Compra" {
    pedido: cliente -> api "POST /pedidos"
    alt "hay stock" {
      api -> db "reservar"
      reply db -> api "ok"
    } else "sin stock" {
      api -> cliente "rechazar"
    }
    note right of db "idempotente"
    reply api -> cliente "201"
  }
}
view compra { type sequence interaction compra order cliente, api autonumber }
```

- Mensaje: `[id:] [async|reply|create|destroy] origen -> destino ["etiqueta"]`. El orden de declaracion es el orden temporal; las activaciones se derivan (un `sync` abre, el `reply` cierra).
- Fragmentos `opt loop break critical`, `alt { } else { }`, `par { } and { }`; Notas `note left|right of X`, `note over X, Y`; `ref otra-interaccion` (declara tambien una Vista que proyecte la referida).
- Vista `sequence`: `interaction` obligatoria; `order` opcional; `depth`, `collapsed`, `exclude`, `autonumber`. `include` y `pin` no valen. Pasos: `step "titulo" { upto <id de Mensaje> }` o `steps each`; ponle `id:` a los Mensajes que un Paso corta.
- `dg inspect interaction <id> --workspace <ruta>` da sus Lifelines en orden, cuantos Mensajes tiene y las Vistas que la proyectan.

### Codigos de secuencia y ER al validar

| `code` | Accion |
| --- | --- |
| `unknown-lifeline`, `unknown-interaction`, `unknown-step` | Aplica el `fix` (typo) o elige un id de la lista del `hint` |
| `sequence-without-interaction` | Agrega `interaction <id>` a la Vista |
| `view-property-for-type` | Quita la propiedad o cambia `type`; el `hint` dice cual |
| `create-not-first`, `after-destroy` | Mueve el `create` a la primera aparicion o saca los Mensajes posteriores al `destroy`; `related` apunta al otro extremo |
| `invalid-fragment-operand` | `else` solo en `alt`, `and` solo en `par`; `opt/loop/break/critical` tienen un operando |
| `step-not-advancing`, `step-not-projected`, `steps-each-with-step` | Pasos que solo avanzan, sobre Mensajes proyectados; no mezcles `steps each` con `step` |
| `er-cardinality` | Solo `0..1`, `1`, `0..*`, `1..*` en Vista `er`; aplica el `fix` |
| `duplicate-key-mark` | Aplica el `fix` (borra la marca repetida) |
| `reply-without-sync`, `order-not-in-interaction`, `ref-without-view` | Avisos: revisa el orden de los Mensajes, el `order` o agrega la Vista de la Interaccion referida |

La lista completa de codigos sale de `dg skill --workspace <ruta>`.

### Reordenar Lifelines

Arrastrar una cabecera en el visor reescribe `order`. Por CLI, con el orden visible completo:

```
dg edit --workspace <ruta> --intent '{"type":"reorder-lifelines","view":"compra","order":["api","cliente","db"]}'
```

## ER

Una Vista `type er` dibuja cada Nodo hoja como tabla. Este ejemplo valida tal cual:

```
specification { node tabla { description "Tabla" icon box color blue } }
model {
  tabla clientes "Clientes" {
    id: uuid pk
    email: text? uk "unico"
  }
  tabla pedidos "Pedidos" {
    id: uuid pk
    cliente_id: uuid fk
  }
  pedidos#cliente_id "0..*" -> "1" clientes#id "pertenece" identifying
}
view tablas { type er include ** }
```

- Atributo `nombre: tipo[?] [pk] [fk] [uk] ["notas"]`; `?` lo hace opcional. Arista `identifying` al final: trazo continuo, el resto discontinuo.
- Extremos `nodo#atributo`; cardinalidades `0..1`, `1`, `0..*`, `1..*`.
- Un Grupo colapsado agrega las FK de sus tablas (sin marcadores).

## Servir y mostrar

- `dg dev --workspace <ruta> --port <N>` sirve la UI de dev en `http://127.0.0.1:<N>/#vista=<id>`. Es un proceso largo: lanzalo en segundo plano, vigila su salida hasta la linea con la URL y entrega esa URL al usuario.
- `dev` recompila al guardar: edita el `.dg` y la UI se actualiza sola. El usuario tambien escribe desde la UI (editor, arrastres, `fix`, galeria de Temas) y puede deshacer desde el Historial de archivos: vuelve a leer el archivo antes de editarlo. Para que `dg edit` no pise un cambio suyo, pasale `--hash <archivo>=<hash>` con el `hash` de `GET /api/archivo/<ruta>` (rechaza con `stale-hash`: relee y reintenta; detalle en `docs/guia/cli.md`).
- La UI muestra en su panel Agente cada `validate`, `build`, `inspect` y `edit` que corres y resalta lo que cambias. Exporta `DIAGRAMS_AGENTE=<tu nombre>` para que el usuario sepa quien fue; no pongas `DIAGRAMS_ACTIVIDAD=0` salvo que te lo pidan. Guia: `docs/guia/ui-de-dev.md`.
- Para mandar el diagrama a alguien sin la herramienta: `dg export --workspace <ruta> --out <archivo>.html` escribe un HTML de solo lectura autocontenido (Vistas, Pasos, `link`, galeria de Temas). Para mostrarlo, sirve su carpeta con un servidor local y entrega la URL.
- Imagen de una Vista: captura el visor de `dev` con un navegador headless y entrega al usuario una URL servida por un servidor local (`http://localhost:<puerto>/...`), no una ruta de archivo. En el repo rinthel-arch, `pnpm capturas --workspace <ruta> --vista <id> <tema>...` lo hace (necesita `pnpm build` y Chromium).
- Un Workspace con Tema de codigo (`.tsx`) exige `--trust-code` o confirmar en el visor; confia solo en Workspaces propios.

## Ejemplos para copiar

| Quiero... | Mira |
| --- | --- |
| El primer diagrama, paso a paso | `examples/tutorial/paso-1` a `paso-6`, y `docs/guia/tutorial.md` |
| Un Modelo grande con drill-down y Pasos | `examples/rinthel-arch/` (Vistas `paquetes`, `flujo-edicion`) |
| Ver un Tipo de nodo en cada estado | `examples/temas/galeria/` |
| Secuencia y ER sobre el mapa del repo | `examples/rinthel-arch/fuente-canonica.dg` (`editar-pin`, `fuente-er`) |
| Secuencia o ER con Tema propio | `examples/temas/secuencia.dg`, `examples/temas/er.dg` |

## Consultar antes de inventar

- Sintaxis o bloque desconocido: `docs/guia/referencia-dsl.md`.
- Estetica, colores, fuentes, animacion: skill `rinthel-temas`.
- Cambiar el DSL, un Tema de ejemplo o el CLI: actualiza `docs/guia/` (y `docs/guia/cli.md` si cambian opciones); `pnpm docs:catalogo` regenera `docs/referencia-catalogo.md`.
