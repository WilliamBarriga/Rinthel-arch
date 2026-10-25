# rinthel-arch

[![Licencia: MIT](https://img.shields.io/badge/licencia-MIT-blue.svg)](LICENSE)
![Node >= 20](https://img.shields.io/badge/node-%3E%3D20-green.svg)
![Estado: 0.x](https://img.shields.io/badge/estado-0.x%20en%20desarrollo-orange.svg)

Sistema (React + TypeScript) para escribir y renderizar diagramas grandes y detallados de cualquier proyecto. Describes tu sistema una vez en texto (`.dg`) y obtienes varias Vistas navegables, con la estetica que elijas: el mismo diagrama puede verse como tarjetas sobrias, neon, plano tecnico, post-its o placa de circuito, cambiando solo el Tema.

**English:** a text DSL for large architecture and flow diagrams. You describe a system once and get several navigable views, rendered with fully themeable and animatable styles. Documentation is in Spanish for now; see the [short English overview](README.en.md).

![El mismo diagrama con el Tema synthwave](docs/img/temas/synthwave.png)

## Que ofrece

- **Un Modelo, muchas Vistas.** Los Nodos, Aristas y Atributos se escriben una vez; cada Vista elige que mostrar (`include`, `exclude`, `depth`) y puede enlazar a otra (drill-down) o revelarse paso a paso.
- **La estetica es un Tema.** Un Tema es texto: Paleta, fuentes y una pila de Capas por elemento, tomadas de un catalogo cerrado (formas, rellenos, bordes, sombras, glow, vidrio, trazos, marcadores, animaciones). Hay 14 Temas de ejemplo y tres incorporados.
- **Visor en vivo.** `dev` recompila al guardar; el visor tiene pan y zoom, colapso de Grupos y arrastre de Nodos que reescribe el `.dg`.
- **Pensado para humanos y agentes.** `validate` devuelve issues estructurados con sugerencias, `inspect` consulta el Modelo y `skill` explica el flujo a un agente.

## Un vistazo al DSL

```
specification {
  node actor    { icon user     color purple }
  node servicio { icon server   color blue }
  node almacen  { icon database color green }
}

model {
  actor cliente "Cliente"
  servicio api "API" "Punto de entrada"
  servicio pedidos "Pedidos"
  almacen db "Base de datos"

  cliente -> api "HTTP"
  api -> pedidos
  pedidos -> db
}

view principal {
  type architecture
  include **
}
```

El [tutorial](docs/guia/tutorial.md) arma un diagrama parecido (una tienda en linea) y lo lleva, en cinco pasos, a Grupos, Vistas enlazadas y un Tema propio.

## Galeria

El mismo mapa de este repo (`examples/rinthel-arch/`), cambiando solo el Tema.

| | | |
| --- | --- | --- |
| ![Tema soft-card: tarjetas sobrias](docs/img/temas/soft-card.png)<br>`soft-card` | ![Tema blueprint: plano tecnico](docs/img/temas/blueprint.png)<br>`blueprint` | ![Tema crt-terminal: terminal verde](docs/img/temas/crt-terminal.png)<br>`crt-terminal` |

Los 14 Temas, con una imagen cada uno, estan en la [galeria completa](docs/galeria.md).

## Empezar

Requisitos: Node 20 o superior y pnpm. El paquete aun no esta publicado en npm: se usa clonando el repo.

```
git clone https://github.com/WilliamBarriga/Rinthel-arch.git
cd Rinthel-arch
pnpm install
pnpm build
node packages/cli/dist/bin.js dev --workspace examples/rinthel-arch
```

`dev` imprime una URL (`http://127.0.0.1:4173/`). Si el visor carga ahi, todo funciona; cambia a las Vistas `abierto-<tema>` para ver los 14 Temas. Para tu propio diagrama, apunta `--workspace` a una carpeta con tus `.dg`.

## Documentacion

| Guia | Para que |
| --- | --- |
| [Inicio rapido](docs/guia/inicio-rapido.md) | Instalar, correr el CLI y recorrer los ejemplos |
| [Tutorial](docs/guia/tutorial.md) | Crear un diagrama pequeno y personalizarlo en cinco pasos |
| [CLI](docs/guia/cli.md) | Comandos, opciones, codigos de salida y salida `--json` |
| [Personalizar con Temas](docs/guia/personalizar-temas.md) | Paleta, Capas, parches por Tipo y estado, Partes, movimiento |
| [Referencia del DSL](docs/guia/referencia-dsl.md) | Sintaxis de Modelo, Vistas y Pasos |
| [Catalogo de Temas](docs/referencia-catalogo.md) | Todas las Primitivas, Slots, Movimientos y Efectos con sus rangos |

Por dentro: el glosario esta en [CONTEXT.md](CONTEXT.md), las decisiones en [docs/adr/](docs/adr/) y las reglas de codigo en [docs/CODING.md](docs/CODING.md).

## Estado

Version 0.x, sin publicar en npm: el DSL y los contratos de los paquetes pueden cambiar entre versiones. Soporta los Tipos de diagrama `architecture` y `flow`; secuencia y ER vienen despues. El trabajo pendiente vive en los [issues](https://github.com/WilliamBarriga/Rinthel-arch/issues).

## Contribuir

Los issues y PRs son bienvenidos. Abre un issue antes de una contribucion grande y lee [CONTRIBUTING.md](CONTRIBUTING.md), que incluye el mapa de paquetes. Para reportar una vulnerabilidad, mira [SECURITY.md](SECURITY.md).

## Licencia

[MIT](LICENSE). Las fuentes incluidas en los ejemplos traen sus propias licencias (OFL-1.1 y DejaVu) junto a los archivos.

El paquete `dsl` parte de la gramatica y el compilador de [LikeC4](https://github.com/likec4/likec4) (MIT); su aviso de copyright y licencia estan en [`packages/dsl/LICENSE-LIKEC4`](packages/dsl/LICENSE-LIKEC4).
