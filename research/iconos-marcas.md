# Research: sets de iconos y logos de marcas para el catalogo

Ticket: #17. Fecha de consulta: 2026-10-03.

## Pregunta

Que set de iconos/logos de marcas conviene como paquete opcional (referencia tipo `brand:postgres`) para el catalogo de Tipos de nodo, sin que el nucleo lo conozca. Criterios: licencia y marcas registradas, mantenimiento, tamano, cobertura de infraestructura, forma de consumo y encaje con export autocontenido.

## Hallazgos clave

1. La licencia del set (CC0, MIT, ISC) cubre el dibujo como archivo, **no** la marca. Los logos siguen siendo marcas de sus duenos; ningun set transfiere ese derecho. Simple Icons lo dice expresamente: "CC0 ... doesn't mean to imply that all icons within the project are also CC0" y "cannot be held responsible for any legal activity raised by a brand" ([DISCLAIMER.md](https://github.com/simple-icons/simple-icons/blob/develop/DISCLAIMER.md)).
2. Simple Icons es el mejor candidato: monocromo, 24x24, con color de marca y enlace a guias de marca por icono, mantenimiento semanal. Su cobertura omite AWS, Microsoft/Azure y OpenAI (ver tabla).
3. Para nubes (AWS, Azure) los iconos oficiales de cada proveedor tienen sus propios terminos y no deben mezclarse en el set por defecto; `gilbarbara/logos` los incluye pero con mas riesgo.
4. Iconify no es un set: es un formato/distribucion. Sirve como formato de empaquetado (`@iconify-json/*`, CC0 en el caso de simple-icons), pero el consumo por API en runtime rompe el export autocontenido.

## Comparacion

| Set | Licencia | Estado (repo) | Tamano npm (unpacked) | Estilo | Marcas infra |
|---|---|---|---|---|---|
| [simple-icons](https://github.com/simple-icons/simple-icons) | CC0-1.0 (con salvedad por icono) | ultimo push 2026-09-30, release semanal (16.33.0, 2026-09-27), ~26k estrellas | 16 MB (`simple-icons`), 4.8 MB (`@iconify-json/simple-icons`) | monocromo 24x24 + `hex` de marca | ~3460 marcas |
| [gilbarbara/logos](https://github.com/gilbarbara/logos) (Iconify `logos`) | CC0-1.0 en el repo; "logos are the property of their respective owners" | push 2026-09-28 | 7.7 MB (`@iconify-json/logos`) | color completo, multicolor | ~1450 (1960 en Iconify), incluye AWS y Azure |
| [devicon](https://github.com/devicons/devicon) | MIT; aviso: uso segun politica de cada marca | push 2026-09-24 | no medido | color y plano | ~1000, orientado a lenguajes/herramientas dev |
| [Lucide](https://github.com/lucide-icons/lucide) | ISC (algunos derivados de Feather, MIT) | push 2026-10-03, ~25k estrellas | 51 MB (`lucide-static`, incluye todo; se importa por icono) | iconos genericos, trazo | no son marcas (solo `database`, `server`, etc.) |
| Tabler | MIT | activo | n/m | genericos | pocas marcas |
| Font Awesome brands (`fa6-brands`) | CC BY 4.0 (exige atribucion) | n/m | n/m | monocromo | cobertura corta, sin infra fina |

Datos de licencia por set verificados en [iconify/icon-sets collections.json](https://github.com/iconify/icon-sets/blob/master/collections.json).

### Cobertura de marcas pedidas (verificada contra datos de cada set)

| Marca | simple-icons | gilbarbara/logos |
|---|---|---|
| PostgreSQL, Docker, Redis, Stripe | si | si |
| Kubernetes, MongoDB, Kafka, RabbitMQ, Nginx | si | si (kafka, redis, nginx) |
| Terraform, GitHub, Cloudflare, Vercel, Supabase, Grafana, Prometheus, MySQL, Elasticsearch, SQLite | si | mayoria |
| Google Cloud | si | si |
| AWS (servicios), Amazon S3 | **no** | si (`aws-*`) |
| Microsoft Azure / Microsoft | **no** | si |
| OpenAI | **no** (solo "OpenAI Gym") | si |

Simple Icons retira iconos que dejan de cumplir sus criterios, o a peticion de la marca, en releases mayores ([DISCLAIMER.md](https://github.com/simple-icons/simple-icons/blob/develop/DISCLAIMER.md), seccion "Removal of Brands"). Un icono puede desaparecer entre versiones: fijar version.

## Formato de cada fuente y consumo

- **simple-icons**: SVG 24x24 monocromo, sin color incrustado; `data/simple-icons.json` trae `title`, `hex`, `source`, y cuando existe `guidelines` y `license` ([CONTRIBUTING.md](https://github.com/simple-icons/simple-icons/blob/develop/CONTRIBUTING.md)). Paquete npm con SVG por icono y modulo JS. Tambien CDN (jsDelivr, `cdn.simpleicons.org`), pero eso exige red.
- **Iconify**: formato `IconifyJSON` y paquetes `@iconify-json/<set>` que se importan localmente; `@iconify/utils` (`getIconData`, `iconToSVG`) convierte a SVG sin API. Los web components/frameworks cargan por API ("Requires access to Iconify API, making it unusable for offline applications"), asi que no sirven para export autocontenido ([docs](https://iconify.design/docs/icon-components/)). Iconify no licencia los iconos: su Apache-2.0 es del software, no de los sets ([docs](https://iconify.design/docs/icons/)).
- **Lucide**: SVG de trazo con `currentColor`, un archivo por icono, ideal como set generico.

## Encaje con el export autocontenido

- SVG exportado: incrustar el `<path>` del icono inline (o `<symbol>`/`<defs>`), sin `<image href>` externo. Con monocromo + `hex` el color sale de la tematizacion o del color de marca, y funciona en claro/oscuro.
- PNG: se rasteriza desde el mismo SVG inline; sin dependencias.
- HTML: SVG inline; sin CDN ni fuentes de iconos.
- Esto favorece SVG monocromo con `currentColor` (simple-icons, Lucide) sobre logos multicolor (`logos`, devicon), que fijan colores y chocan con temas.
- Consecuencia de licencia: el export redistribuye los paths. Con CC0 no hay obligacion de atribucion; con MIT/ISC hay que conservar el aviso de copyright; con CC BY 4.0 (Font Awesome) hay que atribuir en el export. Esto descarta CC BY como set por defecto.

## Marcas registradas: riesgos

- Dibujar un logo en un diagrama tecnico para identificar el producto suele ser uso nominativo/factual. [PostgreSQL](https://www.postgresql.org/about/policies/trademarks/) lo permite mientras no se "state or imply" afiliacion o aval; requiere permiso si sugiere patrocinio. Cada marca tiene su propia politica, y Simple Icons enlaza la guia cuando la conoce (campo `guidelines`). Esto no es asesoria legal.
- Riesgos concretos: (a) alterar el logo (recolorear con un tema, deformar, recortar) puede violar guias de marca; (b) colocar el logo de un proveedor como si fuera el logo del propio Proyecto documentado sugiere afiliacion; (c) iconos oficiales de AWS/Azure/GCP tienen terminos propios (AWS los permite para diagramas de arquitectura; ver [pagina oficial](https://aws.amazon.com/architecture/icons/), no se pudo leer el texto completo de los terminos, verificar antes de redistribuir); (d) un icono puede ser retirado por peticion de la marca; (e) licencias de icono individuales pueden diferir del CC0 del set (Simple Icons: solo ~223 de ~3460 traen dato de licencia, y la ausencia no implica libre).
- Mitigaciones: mostrar el logo solo como identificador, no mutar su forma, avisar en la documentacion del paquete, conservar `source`/`guidelines` en el catalogo, fijar version del paquete.

## Recomendacion

1. **Nucleo**: sin dependencia de ningun set. Un Tipo de nodo referencia un icono por clave opaca (`brand:postgres`, `generic:database`, `workspace:mi-icono`). El nucleo resuelve la clave a traves de un puerto `IconProvider` que devuelve `{ svg inline, viewBox, color? , license?, guidelinesUrl? }`; el export incrusta el resultado. Alineado con la regla hexagonal de `docs/CODING.md`.
2. **v1**: iconos genericos propios (inspirarse en Lucide, ISC, con aviso) + SVG del Workspace, como esta decidido.
3. **Paquete opcional de marcas**: adaptador sobre **`simple-icons`** (CC0, monocromo 24x24, `hex`, `guidelines`), con version fijada. Es el mejor encaje con tematizacion y export autocontenido, y su metadato de marca/guia permite advertir al autor.
4. **Huecos** (AWS, Azure, OpenAI): no mezclar `gilbarbara/logos` en el set por defecto. Si se necesitan, un segundo paquete separado ("nubes"), o que el usuario aporte el SVG oficial al Workspace bajo su responsabilidad.
5. **Iconify**: no depender de su runtime ni de la API. Opcional: usar `@iconify-json/simple-icons` (4.8 MB, CC0) como formato de datos si se quiere compatibilidad de claves (`simple-icons:postgresql`), pero el paquete directo `simple-icons` basta y evita una capa.
6. **Descartar** como defecto: Font Awesome brands (CC BY, atribucion en export), devicon/`logos` (multicolor, choca con temas).

## Preguntas abiertas

- Si el paquete de marcas debe copiar solo los iconos usados al export (tree-shake) o al repo del consumidor: afecta tamano (16 MB completo).
- Terminos exactos de iconos oficiales de AWS/Azure/GCP para redistribuirlos incrustados en un SVG/HTML publicado: leer sus documentos legales antes de ofrecerlos.
- Politica de aviso: mostrar un disclaimer opcional en el export cuando haya iconos `brand:*`.
