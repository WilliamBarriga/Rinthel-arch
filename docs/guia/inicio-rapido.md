# Inicio rapido

## Requisitos

- Node 20 o superior.
- pnpm.
- Para regenerar las capturas de la documentacion (opcional): Chromium, desde la cache de Playwright o con `CHROMIUM_PATH`.

El paquete aun no esta publicado en npm, asi que el sistema se usa desde un clon del repo.

## Instalar y construir

```
git clone https://github.com/WilliamBarriga/Rinthel-arch.git
cd Rinthel-arch
pnpm install
pnpm build
```

El CLI queda en `packages/cli/dist/bin.js`. En esta guia lo abreviamos como `dg`:

```
alias dg="node $PWD/packages/cli/dist/bin.js"
```

## Los conceptos en un minuto

Un **Workspace** es una carpeta de archivos `.dg`. Todos se fusionan en un unico **Modelo** (los Nodos y las Aristas de tu proyecto). Una **Vista** elige que parte del Modelo se dibuja y de que **Tipo de diagrama** (`architecture` o `flow`). Un **Tema** decide como se ve. El vocabulario completo esta en [CONTEXT.md](../../CONTEXT.md).

Un archivo `.dg` tiene hasta cinco clases de bloque:

| Bloque | Para que |
| --- | --- |
| `specification` | Declara los Tipos de nodo (icono y color) |
| `model` | Declara los Nodos y las Aristas |
| `view` | Elige que mostrar y con que Tema |
| `theme` | Define una estetica (Paleta, fuentes, Capas) |
| `part` | Trozo de Tema reutilizable |

## Los comandos

Todos piden `--workspace <ruta>`.

| Comando | Que hace |
| --- | --- |
| `dg validate --workspace <ruta>` | Compila y valida; lista errores y avisos con archivo y linea. `--json` da el mismo resultado estructurado |
| `dg build --workspace <ruta>` | Escribe la Fuente canonica y la geometria en `<ruta>/.diagrams/` (no se versiona) |
| `dg dev --workspace <ruta>` | Visor en vivo en `http://127.0.0.1:4173/`; recompila al guardar |
| `dg inspect buscar <texto>`<br>`dg inspect nodo <id>`<br>`dg inspect vista <id>`<br>`dg inspect tema <nombre>` | Consultas de solo lectura sobre el Modelo, con `archivo:linea` |
| `dg edit` | Escribe sobre el `.dg`: fija un Pin (`--view <id> --node <id> --x N --y N`) o aplica ediciones estructuradas (`--edits '<json>'`, por ejemplo los `fix` de `validate`). Es lo que usa el visor al arrastrar un Nodo |
| `dg skill` | Imprime una skill (Markdown) para que un agente escriba y corrija `.dg` con el bucle inspect, editar, validate |

En el visor, la Vista se elige con el hash de la URL (`#p=<vista>`), y los enlaces de drill-down y las migas navegan entre Vistas. Arrastrar un Nodo fija su Pin y reescribe el archivo `.dg`.

## Recorrer los ejemplos

```
dg dev --workspace examples/tutorial/paso-2      # el diagrama pequeno del tutorial
dg dev --workspace examples/rinthel-arch         # este repo documentado, con 14 Temas
dg dev --workspace examples/temas/galeria        # un Modelo comun con los 14 Temas y los estados de cada Nodo
```

En `examples/rinthel-arch` prueba la Vista `paquetes` y haz clic en un paquete (drill-down), o abre una Vista `abierto-<tema>`. La Vista `flujo-edicion` es de Tipo `flow`: avanza sus Pasos para ver como se revela el diagrama.

## Siguiente

- [Tutorial](tutorial.md): tu primer diagrama, de cero a personalizado.
- [Personalizar con Temas](personalizar-temas.md).
- [Referencia del DSL](referencia-dsl.md).
