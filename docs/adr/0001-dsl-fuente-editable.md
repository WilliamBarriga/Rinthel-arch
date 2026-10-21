# DSL de texto: copia de LikeC4 y unica fuente editable

## Origen: copia de LikeC4 que se independiza de inmediato

El DSL de texto parte del codigo de gramatica, parser y compilador del modelo de LikeC4 (MIT), porque es el candidato que mejor cubre modelo unico con varias vistas, anidado y drill-down, frente a Mermaid (sin modelo compartido ni AST) y D2 (Go, tableros independientes). Se copia el codigo en este repo, sin fork ni remoto upstream, y en cuanto empecemos a cambiarlo la conexion con LikeC4 se corta: no se siguen sus novedades. Se necesitan cambios propios porque nuestro Modelo exige Atributos como extremo de Arista, `source` y Tipos de nodo declarados, que C4 no tiene. Solo se copia lenguaje y compilador; el render y el layout los decide el ticket de render.

### Consecuencias

- Se conserva el aviso de copyright y la licencia MIT de LikeC4.
- No hay parches de seguridad heredados: lo que se copia es nuestro.
- LikeC4 puede volver como importador opcional, nunca como dependencia del nucleo.

## El DSL es la unica fuente editable; la Fuente canonica es derivada

Solo los archivos del DSL de texto se editan y versionan, y compilan en un solo sentido a la Fuente canonica (esquema propio en Zod, no json-render). El JSON canonico es artefacto de build y contrato de render, export y validacion. Se descarta tener dos fuentes editables: el round-trip a texto de LikeC4 es lossy y dos fuentes generan conflictos. Los agentes tambien escriben DSL, con un skill generado desde el catalogo del proyecto y un comando `validate` con issues estructurados.
