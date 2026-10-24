import {
  CODIGOS,
  CONTRACT_VERSION,
  DESCRIPCION_DE_CODIGO,
  EDIT_CONTRACT_VERSION,
  INSPECT_CONTRACT_VERSION,
  salidaDeEditJsonSchema,
  salidaDeInspectJsonSchema,
  salidaDeValidateJsonSchema,
} from 'canonico';
import type { FuenteCanonica } from 'canonico';

/** Celda de tabla Markdown: sin saltos de linea ni barras que rompan la fila. */
const celda = (texto: string): string => (texto.trim() === '' ? '-' : texto.replace(/\s*\n\s*/g, ' ').replace(/\|/g, '\\|'));

const EJEMPLO_DE_DSL = `specification {
  node servicio { description "Pieza desplegable"  color blue }
}

theme claro extends neutral {
  palette { acento "#0ea5e9" }
}

model {
  servicio sistema "Sistema" {
    servicio api "API"
    servicio db "Base de datos" {
      attrs { id: uuid "clave"  email: text }
    }
  }
  sistema.api -> sistema.db
}

view general {
  type architecture
  include **
  theme claro
  node sistema.db { label "Datos"  color acento }
}`;

/**
 * Skill para agentes (formato `SKILL.md`) del proyecto: Tipos de nodo, Paleta y
 * Temas de su catalogo, sintaxis del DSL, contrato de `validate` (derivado del
 * esquema Zod, ADR 0005) y codigos de issue. Pura y determinista: el mismo
 * catalogo produce los mismos bytes.
 */
export function generarSkill(fuente: FuenteCanonica): string {
  const tipos = fuente.specification.nodeTypes.map(
    (tipo) => `| \`${tipo.name}\` | ${celda(tipo.description)} | ${celda(tipo.icon ?? '')} | ${celda(tipo.color ?? '')} |`,
  );
  const temas = fuente.themes.map(
    (tema) =>
      `| \`${tema.name}\` | ${Object.keys(tema.palette).map((color) => `\`${color}\``).join(', ') || '-'} |`,
  );
  const codigos = Object.values(CODIGOS).map((codigo) => `| \`${codigo}\` | ${DESCRIPCION_DE_CODIGO[codigo]} |`);

  return `---
name: diagrams
description: Escribir y corregir los archivos .dg (DSL de diagramas) de este proyecto con el bucle diagrams inspect, editar, validate. Usalo al crear o editar Nodos, Aristas, Vistas o Temas.
---

# Diagramas de este proyecto

Los diagramas se escriben en archivos \`.dg\` del Workspace. Es la unica fuente editable: nunca edites el JSON de \`.diagrams/\`, que es salida derivada.

## Bucle de trabajo

1. Consulta el Modelo con \`diagrams inspect\` para saber que ids existen, donde estan escritos y como se conectan (no adivines ids ni releas todos los \`.dg\`).
2. Edita los \`.dg\`.
3. Ejecuta \`diagrams validate --workspace <ruta> --json\`.
4. Si \`ok\` es \`false\`, corrige cada issue (empieza por los \`fix\`, que son ediciones exactas del texto) y vuelve al paso 3.
5. Termina cuando \`ok\` es \`true\`. \`diagrams build\` genera la geometria y \`diagrams dev\` muestra los diagramas.

Para ver el resultado mientras se edita (persona o agente), \`diagrams dev\` abre el bucle en vivo (ver abajo). Si dos autores tocan el mismo \`.dg\`, gana la ultima escritura; la reconciliacion es de git.

Este skill se genera: tras cambiar los Tipos de nodo, Temas o codigos, regeneralo con \`diagrams skill --workspace <ruta> --out <archivo>\`.

## Tipos de nodo

Todo Nodo declara su tipo con uno de estos (\`specification { node <tipo> { ... } }\`).

| Tipo | Descripcion | Icono | Color |
| --- | --- | --- | --- |
${tipos.join('\n') || '| - | - | - | - |'}

## Paleta y Temas

Un color se escribe solo por nombre de Paleta (en un Tipo de nodo o en un override de Vista); el valor hex vive unicamente dentro de un \`theme\`.

| Tema | Colores de Paleta |
| --- | --- |
${temas.join('\n')}

## Sintaxis del DSL

\`\`\`dg
${EJEMPLO_DE_DSL}
\`\`\`

- Un Nodo es \`<tipo> <id> ["Titulo" ["Descripcion"]] [{ hijos, attrs, source }]\`; sus hijos lo hacen Grupo y su id completo es \`padre.hijo\`.
- Una Arista es \`origen ["card"] -> ["card"] destino ["etiqueta"]\` (espacios alrededor de \`->\`; la etiqueta se pierde al fusionar Aristas elevadas por un Grupo colapsado); un extremo puede ser \`nodo#atributo\`.
- Una Vista solo selecciona (\`include\`, \`exclude\`, \`depth\`; selectores \`a\`, \`a.*\`, \`a.**\`); \`type\` es \`architecture\` o \`flow\`. Sus overrides por Nodo (\`label\`, \`pin x,y\`, \`order\`, \`color\`) nunca tocan el Modelo; \`pin\` es la posicion relativa al Grupo padre y \`order\` solo se guarda (sin efecto en v1).
- Una Vista puede declarar \`theme\`, \`collapsed\`/\`expanded\`, \`link <nodo> -> <vista>\` y \`steps\` de revelado (\`steps { step "Titulo" { show a, a -> b  hide c } }\`: acumulativos; \`show\` revela y \`hide\` oculta lo anterior; en un paso \`a.*\` revela el Grupo \`a\` y sus hijos).
- \`extend <nodo> { ... }\` anade hijos, \`attrs\` y \`source\` a un Nodo declarado en otro archivo. Un Tipo de nodo admite \`description\`, \`icon\`, \`style\` y \`color\`; el \`icon\` es un icono generico o el nombre de un \`.svg\` del Workspace.

## Contrato de validate

\`diagrams validate --workspace <ruta> [--json] [--max-issues N] [--strict]\`. Con \`--json\`, stdout es exactamente un objeto (contractVersion ${CONTRACT_VERSION}). \`summary\` cuenta todos los issues; \`truncated\` indica que \`issues\` se corto en \`--max-issues\` (100 por defecto). Los issues salen ordenados por archivo, linea, columna y codigo.

| Codigo de salida | Significado |
| --- | --- |
| 0 | Sin errores (los avisos no fallan) |
| 1 | Hay errores; con \`--strict\`, tambien avisos |
| 2 | Fallo de uso o interno (mensaje en stderr) |

Cada issue trae \`code\` (estable), \`severity\` (\`error\` o \`warning\`), \`file\`, \`line\`, \`column\`, \`message\`, y opcionales \`hint\`, \`related\` y \`fix\`. El \`fix\` es una edicion exacta del texto (\`{ file, range, replacement }\`) y solo aparece cuando hay un unico candidato; si hay varios, lee \`hint\`. Nunca hay \`fix\` sobre el JSON canonico. Guiate por \`code\`: \`message\` y \`hint\` pueden cambiar.

Esquema (JSON Schema derivado del esquema Zod del contrato):

\`\`\`json
${JSON.stringify(salidaDeValidateJsonSchema(), null, 2)}
\`\`\`

## Consultar el Modelo (inspect)

Solo lectura; nunca escribe. Cada resultado trae el id cualificado, el tipo y \`archivo:linea\` de donde se escribio.

\`\`\`text
diagrams inspect buscar <texto> --workspace <ruta> [--json]
diagrams inspect nodo <id> --workspace <ruta> [--json]
diagrams inspect vista <id> --workspace <ruta> [--json]
diagrams inspect tema <nombre> --workspace <ruta> [--tipo <tipo>] [--estado <estado>] [--catalogo] [--json]
\`\`\`

- \`buscar\` encuentra Nodos por id parcial o titulo, y Vistas por id (sin distinguir mayusculas).
- \`nodo\` devuelve el Nodo, su padre e hijos, sus Atributos, las Aristas que entran y salen, y las Vistas que lo muestran.
- \`vista\` devuelve los Nodos y Aristas visibles de la Vista en su estado inicial.
- \`tema\` devuelve la cadena \`extends\`, las \`part\` usadas, la pila de Capas resuelta para el \`--tipo\` y \`--estado\` pedidos (cada Capa con el \`archivo:linea\` del parche que la fijo, para saber que parche editar), las Metricas y si el Tema usa codigo; con \`--catalogo\`, tambien las claves del catalogo de Primitivas, Movimientos y efectos.
- Sin \`--json\` sale texto legible. Con \`--json\`, stdout es exactamente un objeto (contractVersion ${INSPECT_CONTRACT_VERSION}, independiente del de validate) con \`comando\` = \`buscar\`, \`nodo\`, \`vista\` o \`tema\`.
- Codigos de salida: 0 hay respuesta (\`buscar\` sin coincidencias tambien), 1 el Nodo, la Vista, el Tema, el Tipo o el estado no existe (stderr sugiere ids cercanos) o el Workspace tiene errores (corrigelos con validate), 2 fallo de uso o interno.

Esquema de \`inspect --json\` (JSON Schema derivado del esquema Zod):

\`\`\`json
${JSON.stringify(salidaDeInspectJsonSchema(), null, 2)}
\`\`\`

## Editar de forma estructurada (edit)

Es la unica escritura explicita del CLI y solo escribe lo que pides; \`validate\` nunca reescribe. Edita siempre el \`.dg\`, nunca el JSON canonico.

\`\`\`text
diagrams edit --workspace <ruta> --view <vista> --node <id cualificado> --x N --y N [--json]
diagrams edit --workspace <ruta> --edits '[{"file":"main.dg","range":{"start":{"line":1,"column":1},"end":{"line":1,"column":2}},"replacement":"..."}]' [--json]
\`\`\`

- La primera forma mueve el Pin de un Nodo en una Vista: reemplaza el \`pin\` si existe y lo anade si no; no necesitas conocer la sintaxis.
- La segunda aplica ediciones de texto ya calculadas (p. ej. el \`fix\` de un issue de \`validate\`): rangos 1-based, fin excluido.
- Concurrencia: cada edicion lleva el hash del archivo que viste (\`hash\` en la edicion, o \`--hash <archivo>=<hash>\`); sin hash se usa el del disco. Si el archivo cambio, se rechaza todo sin escritura parcial.
- Se rechaza tambien lo que introduce errores nuevos, solapa ediciones o apunta fuera del archivo.
- Con \`--json\`, stdout es exactamente un objeto (contractVersion ${EDIT_CONTRACT_VERSION}, independiente de los otros) con \`ok\`; si es \`false\` trae \`reason\` y \`message\`.
- Codigos de salida: 0 escrito, 1 edicion rechazada o invalida, 2 fallo de uso o interno.

Esquema de \`edit --json\` (JSON Schema derivado del esquema Zod):

\`\`\`json
${JSON.stringify(salidaDeEditJsonSchema(), null, 2)}
\`\`\`

## Bucle en vivo (dev)

\`diagrams dev --workspace <ruta>\` levanta un servidor local (solo en 127.0.0.1, puerto 4173 por defecto; \`--port N\` lo cambia) que sirve el shell. Observa el Workspace y, ante cada cambio en los \`.dg\` (con un debounce de ~150 ms), recompila y empuja al navegador la Vista y los issues por Server-Sent Events. La pantalla muestra la Vista elegida por el hash de la URL (\`#<vista>\`) y un panel de issues clicables (\`archivo:linea\`). Un agente no necesita abrirlo: usa inspect y validate; \`dev\` es para que la persona vea el resultado en vivo. No hay bloqueos de edicion ni estado compartido: el DSL en git es el unico punto de coordinacion.

## Codigos de issue

| Codigo | Significado |
| --- | --- |
${codigos.join('\n')}
`;
}
