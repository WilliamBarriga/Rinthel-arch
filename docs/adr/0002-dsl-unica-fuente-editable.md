# El DSL de texto es la unica fuente editable; la Fuente canonica es derivada

Solo los archivos del DSL de texto se editan y versionan, y compilan en un solo sentido a la Fuente canonica (esquema propio en Zod, no json-render). El JSON canonico es artefacto de build y contrato de render, export y validacion. Se descarta tener dos fuentes editables: el round-trip a texto de LikeC4 es lossy y dos fuentes generan conflictos. Los agentes tambien escriben DSL, con un skill generado desde el catalogo del proyecto y un comando `validate` con issues estructurados.
