# Mapa de rinthel-arch (caso de uso)

Workspace de ejemplo en el que el sistema se documenta a si mismo: paquetes del monorepo, dependencias, export y flujo de edicion. No es parte del nucleo: sirve de prueba de punta a punta (validate, build, export svg/png/html).

## Contenido

| Archivo | Que mapea |
| --- | --- |
| `especificacion.dg` | Tipos de nodo (actor, paquete, modulo, artefacto, salida, externo...) y Temas `diagrams` (oscuro) y `diagrams-claro` |
| `sistema.dg` | Los siete paquetes con sus modulos, las librerias externas y los formatos de export |
| `conexiones.dg` | Dependencias entre paquetes y entre modulos (las Aristas solo se declaran en `model`, con ids cualificados) |
| `vistas.dg` | Vista de paquetes con drill-down a cada paquete, la Vista de exportacion y dos Vistas de flujo con Pasos: export y edicion |
| `fuentes/` | DejaVu Sans y Mono (licencia en `LICENCIA-DejaVu.txt`): el PNG con resvg necesita `.ttf` |

## Uso

```
node packages/cli/dist/bin.js validate --workspace examples/rinthel-arch
node packages/cli/dist/bin.js build    --workspace examples/rinthel-arch
node packages/cli/dist/bin.js export   --workspace examples/rinthel-arch --format html   # o svg, png
```

La salida queda en `examples/rinthel-arch/.diagrams/` (ignorada por git). Abre `.diagrams/html/paquetes.html` y navega con los enlaces de drill-down.

## Limitaciones que siguen

- Las Aristas no se pueden declarar dentro del bloque de un Nodo: hay que usar el id cualificado completo en `model`.
- Una etiqueta de Arista elevada por un Grupo colapsado se conserva solo si es la unica entre ese par; si se fusionan varias, se pierde.
- El Tema depende de fuentes `.ttf` del Workspace para que el PNG sea identico entre maquinas; sin ellas resvg usa fuentes del sistema.
