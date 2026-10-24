# Mapa de rinthel-arch (caso de uso)

Workspace de ejemplo en el que el sistema se documenta a si mismo: paquetes del monorepo, dependencias y flujo de edicion. No es parte del nucleo: sirve de prueba de punta a punta (validate, build, dev).

## Contenido

| Archivo | Que mapea |
| --- | --- |
| `especificacion.dg` | Tipos de nodo (actor, paquete, modulo, artefacto, salida, externo...) y Temas `diagrams` (oscuro) y `diagrams-claro`: extienden los incorporados `neutral-dark` y `neutral` con las fuentes del Workspace y dos parches por Tipo |
| `sistema.dg` | Los ocho paquetes con sus modulos y las librerias externas |
| `conexiones.dg` | Dependencias entre paquetes y entre modulos (las Aristas solo se declaran en `model`, con ids cualificados) |
| `vistas.dg` | Vista de paquetes con drill-down a cada paquete, la Vista `abierto` (render, sesion y layout abiertos; la Vista `abierto` del prototipo aprobado) y una Vista de flujo con Pasos: edicion |
| `fuentes/` | DejaVu Sans y Mono (licencia en `LICENCIA-DejaVu.txt`) |

## Uso

```
node packages/cli/dist/bin.js validate --workspace examples/rinthel-arch
node packages/cli/dist/bin.js build    --workspace examples/rinthel-arch
node packages/cli/dist/bin.js dev      --workspace examples/rinthel-arch
```

Para ver una Vista con otro Tema sin tocar el ejemplo (necesita `pnpm build`):

```
pnpm capturas --workspace examples/rinthel-arch --vista abierto --prototipo A neutral neutral-dark
```

La salida queda en `examples/rinthel-arch/.diagrams/` (ignorada por git). `dev` sirve la vista previa en vivo en 127.0.0.1; navega con los enlaces de drill-down.

## Limitaciones que siguen

- Las Aristas no se pueden declarar dentro del bloque de un Nodo: hay que usar el id cualificado completo en `model`.
- Una etiqueta de Arista elevada por un Grupo colapsado se conserva solo si es la unica entre ese par; si se fusionan varias, se pierde.
