import { CODIGOS, CONTRACT_VERSION, DESCRIPCION_DE_CODIGO, salidaDeValidateJsonSchema } from 'canonico';
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
 * esquema Zod, ADR 0008) y codigos de issue. Pura y determinista: el mismo
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
description: Escribir y corregir los archivos .dg (DSL de diagramas) de este proyecto con el bucle diagrams validate / correccion. Usalo al crear o editar Nodos, Aristas, Vistas o Temas.
---

# Diagramas de este proyecto

Los diagramas se escriben en archivos \`.dg\` del Workspace. Es la unica fuente editable: nunca edites el JSON de \`.diagrams/\`, que es salida derivada.

## Bucle de trabajo

1. Edita los \`.dg\`.
2. Ejecuta \`diagrams validate --workspace <ruta> --json\`.
3. Si \`ok\` es \`false\`, corrige cada issue (empieza por los \`fix\`, que son ediciones exactas del texto) y vuelve al paso 2.
4. Termina cuando \`ok\` es \`true\`. \`diagrams build\` y \`diagrams export\` generan geometria, SVG y PNG.

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
- Una Arista es \`origen ["card"] -> ["card"] destino\` (espacios alrededor de \`->\`); un extremo puede ser \`nodo#atributo\`.
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

## Codigos de issue

| Codigo | Significado |
| --- | --- |
${codigos.join('\n')}
`;
}
