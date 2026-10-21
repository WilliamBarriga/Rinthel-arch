# Contrato de salida de `validate`: objeto JSON versionado, issues con `fix` estructurado

`validate` es de solo lectura y reporta todos los issues en una pasada (tope `--max-issues`, 100 por defecto; `truncated: true` si se corta). Con `--json` imprime un unico objeto a stdout, sin texto extra, ordenado de forma determinista (archivo, linea, columna, codigo):

```
{ contractVersion: 1, ok, summary: { errors, warnings, truncated }, issues: [...] }
```

Cada issue: `code` estable, `severity` (`error` | `warning`), `file`, `line`, `column`, `message`, y opcionales `hint` (texto), `related: [{file,line,column,message}]` (p. ej. el Nodo duplicado original) y `fix`. El `fix` es una edicion estructurada del DSL de texto (`{ file, range, replacement }`) y solo se emite en casos inequivocos (un unico candidato); si hay ambiguedad queda `hint`. Nunca edita el JSON canonico (ADR 0002).

Codigos de salida: `0` sin errores (warnings permitidos), `1` hay errores, `2` fallo de uso o interno. `--strict` trata warnings como exit 1.

Versionado: `contractVersion` entero desde el inicio. Es cambio incompatible quitar o renombrar campos o codigos, cambiar su significado o los codigos de salida; anadir campos o codigos no lo es (los consumidores ignoran lo desconocido). Los codigos se deprecan, nunca se reciclan. Los codigos y `code`/`fix` son contrato publico; el texto de `message` y `hint` no. El esquema Zod de la salida es la fuente del skill generado para agentes.

Se descarta `validate --fix`: el agente aplica las ediciones con sus herramientas y revalida (bucle validate/autoFix de json-render), y el CLI no reescribe archivos del Workspace. Se descarta NDJSON: un objeto es mas simple de parsear y de probar con snapshots.

Nota: la edicion estructurada explicita (`diagrams edit` y el shell de `dev`) se decidio despues; ver ADR 0010. `validate --fix` sigue descartado.
