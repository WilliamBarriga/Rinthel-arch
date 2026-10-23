# Metricas y Estilo resuelto: un solo sitio para lo visual

Contexto: cambiar la estetica obligaba a recorrer la construccion de la escena y el layout a la vez. El Tema solo ofrecia strings, el contrato real (`background`, `foreground`, `border`, `fontSize`) no estaba declarado y los numeros de espaciado y dibujo vivian repartidos en `layout` y `render`, coincidiendo por convencion. Spec #91. Amplia el contrato de Tema del ADR 0002 y el de layout del ADR 0003; no los contradice.

## Metricas: lo que se reserva y se dibuja

`layout` exporta `metricasDe(tema) -> Metricas`: padding de Nodo, cabecera de Grupo, alto de fila de Atributo, caja de icono, escalas de texto, holguras de etiqueta y factor de ancho de texto. Lo usan `layout` (medir: `tamanoDeNodo`, `tamanoDeEtiqueta`) y `render` (dibujar), de modo que lo reservado y lo dibujado no pueden divergir. La clave de cache de layout se calcula sobre las mismas Metricas (ADR 0003). Es el sitio de enganche de una medicion real de texto: un adaptador de `metricasDe`, sin tocar a quien las consume. Hoy el ancho se estima por caracter (el layout corre sin DOM).

## Contrato del Tema

`canonico` exporta `contratoDeTemaSchema`, que extiende `temaSchema` con lo que el dibujo exige: tokens `background`, `foreground` y `border`, fuentes `body` y `mono`, y `fontSize` (si existe) como tamano en px. Un Tema puede declarar mas tokens; el contrato solo fija un minimo. Un Tema incompleto falla al validarse (`resolverEstilo` lanza con la ruta de cada campo que falta), no a mitad del dibujo con un `none` silencioso. `temaSchema` no cambia: el compilador del DSL sigue aceptando Temas parciales y la exigencia llega donde se dibuja.

## Estilo resuelto

`render` exporta `resolverEstilo(tema, metricas?) -> Estilo`, el unico sitio con defaults y numeros magicos de dibujo: colores y fuentes del Tema, Paleta, radio y relleno de Nodo, trazo de Grupo colapsado, color y forma de flecha, separaciones de cardinalidad, halo de etiqueta, glifos del control de colapso y las Metricas. Pura y determinista.

`render` dibuja solo desde el Estilo, con pintores pequenos por parte (`pintarFondo`, `pintarNodo`, `pintarGrupo`, `pintarArista`, `pintarEtiquetaDeArista`, `pintarControl`, `pintarFlecha`) que no leen tokens ni llevan constantes. La escena (`construirEscena`) solo ordena y compone. El SVG exportado y `Diagram` salen de la misma escena, de modo que un cambio del Estilo los cambia por igual. La entrada de ambos acepta `estilo` opcional (por defecto el del Tema), que es la costura de prueba y de personalizacion.

## Pruebas

- Tabla de estilo (`resolverEstilo`): prueba propia, sin dibujar.
- Pintores: cada uno recibe un Estilo y datos planos y se verifica por separado; un Estilo modificado cambia su salida.
- Invariante estructural: cambiar un valor del Estilo cambia el SVG exportado y el de `Diagram`; cambiar una Metrica mueve layout y dibujo a la vez y lo dibujado cabe en lo reservado. Los snapshots dejan de ser el unico guardia.

## Consecuencias y siguiente paso

- Redisenar la estetica es editar `estilo.ts` (y las Metricas), no recorrer la escena.
- Un Tema aun no sobrescribe el Estilo por nombre ni declara rellenos o sombras por Tipo de nodo o tipo de Arista: el Estilo es la tabla donde eso se enchufa despues, sin tocar el Modelo (ADR 0002). Los estados visuales (seleccionado, hover, fantasma) y las variables CSS del chrome del shell son un ticket posterior y se apoyan en este.
- Un Tema que antes dibujaba con `none` por un token ausente ahora falla con un mensaje claro; los Temas del nucleo y de los ejemplos ya cumplen el contrato.
