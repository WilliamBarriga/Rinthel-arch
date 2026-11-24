# Empaquetado para Claude Code, Codex, OpenCode y Pi

Ticket: #213 (hijo del mapa #211). Fecha de consulta de las fuentes: 2026-11-24.

## Pregunta

Como se empaqueta e instala una skill o plugin en Claude Code, Codex, OpenCode y Pi (`@earendil-works/pi-coding-agent`): formato de plugin y marketplace de cada uno, ubicaciones de skills, si un mismo arbol sirve para los cuatro, como se declara un comando o CLI acompanante, y el minimo de pasos de instalacion para el usuario.

## Conclusion

Un solo arbol sirve para los cuatro: `skills/<nombre>/SKILL.md` en la raiz del repo (el que ya existe), en formato Agent Skills estricto. Encima van tres manifiestos finos que apuntan a ese mismo `skills/`: `.claude-plugin/plugin.json` + `.claude-plugin/marketplace.json` (Claude Code), `.codex-plugin/plugin.json` + `.agents/plugins/marketplace.json` (Codex) y la clave `pi` de un `package.json` publicado en npm (Pi). OpenCode no tiene formato de plugin para skills: lee `.agents/skills/`, `.claude/skills/` y `~/.claude/skills/`, asi que se cubre copiando el arbol (a mano o con `npx skills add`). El CLI `diagrams` es la pieza que falta: hoy es `private` y depende de paquetes `workspace:*`, y el nombre `diagrams` en npm ya es de otro paquete. Hay que publicar un paquete npm propio (propuesta: `rinthel-arch`, libre al 2026-11-24) con `bin: { diagrams }` y las dependencias del workspace empaquetadas; las skills lo invocan como `diagrams` si esta en `PATH` y si no con `npx -y -p rinthel-arch diagrams`. Solo Claude Code pone ejecutables de un plugin en el `PATH` (`bin/`); en los otros tres el CLI llega por npm.

## Fuentes primarias

- Claude Code: [Plugin manifest reference](https://code.claude.com/docs/en/plugins-reference), [Create a marketplace](https://code.claude.com/docs/en/plugin-marketplaces), [Marketplace reference](https://code.claude.com/docs/en/plugins/marketplace-reference.md), [Install and manage plugins](https://code.claude.com/docs/en/plugins/install.md), [Skills](https://code.claude.com/docs/en/skills).
- Codex: [Build plugins](https://developers.openai.com/codex/plugins/build), [Skills](https://learn.chatgpt.com/docs/build-skills) (redirigido desde `developers.openai.com/codex/skills`), [Plugins](https://learn.chatgpt.com/docs/plugins).
- OpenCode: [Skills](https://opencode.ai/docs/skills/), [Plugins](https://opencode.ai/docs/plugins/), [Config](https://opencode.ai/docs/config/).
- Pi: paquete npm `@earendil-works/pi-coding-agent@1.6.0` (MIT, repo `github.com/earendil-works/pi`), archivos `docs/skills.md`, `docs/packages.md`, `docs/cli.md` y el bundle `dist/` del tarball.
- Estandares: [Agent Skills specification](https://agentskills.io/specification), [Agent Plugins](https://agent-plugins.org/).
- Instalador multiagente: [vercel-labs/skills](https://github.com/vercel-labs/skills) (`docs/agents.md`), npm `skills@1.9.0` (MIT).
- Repo: `packages/cli/package.json`, `skills/*/SKILL.md`, `docs/guia/cli.md`; ejemplo de inspiracion en `/tmp/ext-floorplan/repo` (no se cita en la cara publica).

## Estandar Agent Skills

Segun la [especificacion](https://agentskills.io/specification), una skill es una carpeta con `SKILL.md` (frontmatter YAML + Markdown) y opcionalmente `scripts/`, `references/` y `assets/`.

- Campos: `name` (obligatorio; 1-64 caracteres, `a-z0-9` y guiones, sin guion inicial, final ni doble; "Must match the parent directory name"), `description` (obligatorio, 1-1024), `license`, `compatibility` (1-500; "Indicates environment requirements (intended product, system packages, network access, etc.)"), `metadata` (mapa string a string) y `allowed-tools` (experimental).
- Divulgacion progresiva: al inicio solo se cargan `name` y `description`; el cuerpo al activarse ("< 5000 tokens recommended", "Keep your main `SKILL.md` under 500 lines"); los recursos bajo demanda, con rutas relativas a la carpeta de la skill.
- Claude Code: "Claude Code skills follow the Agent Skills open standard"; fuera de Claude Code solo valen `name`, `description`, `license`, `compatibility`, `metadata`, `allowed-tools` ([Skills](https://code.claude.com/docs/en/skills)).
- Codex: "Skills build on the open standard at agentskills.io" ([Skills](https://learn.chatgpt.com/docs/build-skills)).
- Pi: "Pi implements the Agent Skills specification" (`docs/skills.md`).
- OpenCode: acepta `name`, `description`, `license`, `compatibility`; deriva el id de la ruta, no del `name`, y recomienda el patron `^[a-z0-9]+(-[a-z0-9]+)*$` ([Skills](https://opencode.ai/docs/skills/)).

Las dos skills del repo (`rinthel-diagramas`, `rinthel-temas`) ya cumplen: `name` igual a la carpeta, en minusculas, descripciones de 327 y 282 caracteres, 133 y 73 lineas. El unico campo que conviene anadir es `compatibility` (por ejemplo "Requiere Node >= 20 y el CLI `diagrams` (paquete npm rinthel-arch)").

Problema de portabilidad: ambas skills citan rutas del repo (`docs/guia/referencia-dsl.md`, `examples/rinthel-arch/`, `pnpm capturas`, `pnpm build`): 13 y 8 menciones. Instaladas fuera del repo esas rutas no existen. Hay que mover lo que la skill necesita a `references/` dentro de cada skill (o remitir a `diagrams skill`, que ya imprime el esquema del contrato JSON, y a `diagrams <comando> --help`), y dejar lo exclusivo de contribuidores (`pnpm docs:catalogo`, `pnpm capturas`) fuera del cuerpo o marcado como "solo en el repo".

## Por agente

### Claude Code

- Skills sueltas: `~/.claude/skills/<n>/SKILL.md` (personal), `.claude/skills/<n>/SKILL.md` (proyecto). La doc no menciona `.agents/skills`; Claude Code no lo lee ([Skills](https://code.claude.com/docs/en/skills); el indice `llms.txt` no tiene ninguna pagina con `.agents/skills`).
- Plugin: manifiesto opcional en `.claude-plugin/plugin.json`; solo `name` es obligatorio (kebab-case; no puede empezar por `claude-` ni `anthropic-`). Componentes en la raiz del plugin, no dentro de `.claude-plugin/`. `skills/` se escanea por defecto ("One `<name>/SKILL.md` per skill") y la clave `skills` "Adds to the default `skills/` scan". Las skills quedan con prefijo: `/rinthel-arch:rinthel-diagramas` ([manifest reference](https://code.claude.com/docs/en/plugins-reference)).
- CLI acompanante: "Executables | `bin/` | Files here are on the Bash tool's `PATH` while the plugin is enabled, so Claude runs them as bare commands." Advertencia de la misma tabla: "claude.ai and Cowork don't install a plugin that has this directory". `${CLAUDE_PLUGIN_ROOT}` y `${CLAUDE_SKILL_DIR}` se sustituyen en el cuerpo de la skill, pero no estan en el entorno del Bash tool. `${CLAUDE_PLUGIN_DATA}` (`~/.claude/plugins/data/<id>/`) sobrevive a actualizaciones y sirve para un `node_modules` propio.
- Marketplace: `.claude-plugin/marketplace.json` con `name`, `owner` (`name`) y `plugins` (cada entrada `name` + `source`). `source` puede ser ruta relativa (`"./"` = el propio repo), `github`, `url`, `git-subdir`, `npm` ("fetched with your npm client and unpacked without running install scripts"; las dependencias se instalan aparte solo si hay lockfile), `archive` o `command`. Un repo puede ser marketplace y plugin a la vez con `"source": "./"`; en ese caso Claude Code no trae submodulos que el plugin no use ([marketplace reference](https://code.claude.com/docs/en/plugins/marketplace-reference.md)). El nombre de entrada y el `name` de `plugin.json` deben coincidir.
- Instalacion minima (shell, v2.1.292+): `claude plugin install rinthel-arch --marketplace WilliamBarriga/Rinthel-arch`. Equivalente en dos pasos: `claude plugin marketplace add WilliamBarriga/Rinthel-arch` y `claude plugin install rinthel-arch@<nombre-marketplace>`. En sesion: `/plugin install rinthel-arch --marketplace WilliamBarriga/Rinthel-arch` ([install](https://code.claude.com/docs/en/plugins/install.md)). Scopes `user`, `project` (`.claude/settings.json`; cada colaborador aun debe instalar una vez) y `local`. Auto-update apagado por defecto en marketplaces de terceros.
- Validacion: `claude plugin validate .` revisa manifiesto y marketplace.

### Codex

- Skills sueltas: `.agents/skills` en cada directorio desde el cwd hasta la raiz del repo, `$HOME/.agents/skills`, `/etc/codex/skills` y las de sistema. Sigue symlinks. `name` y `description` obligatorios. Opcional `agents/openai.yaml` por skill (UI, `policy.allow_implicit_invocation`, dependencias de herramientas MCP). `$skill-installer` instala skills, tambien desde otros repos ([Skills](https://learn.chatgpt.com/docs/build-skills)). La propia doc recomienda plugins para distribuir: "For reusable distribution of your own skills, prefer plugins."
- Plugin: la doc actual describe un formato "portable" con `plugin.json` en la raiz (`$schema` de agent-plugins.org), `skills/` descubierto sin declararlo, `mcp.json` y extensiones bajo `extensions.com.openai`; y dice "Existing `.codex-plugin/plugin.json` files remain supported as a compatibility fallback" ([Build plugins](https://developers.openai.com/codex/plugins/build)). Lo que si funciona hoy en ambos casos es `skills/` en la raiz.
- CLI acompanante: la doc no documenta ejecutables de plugin ni cambios de `PATH`; solo hooks (con `PLUGIN_ROOT`/`PLUGIN_DATA`, y "Installing or enabling a plugin doesn't automatically trust its hooks"). El campo `requires_local_executor` que usa el ejemplo de inspiracion no aparece en la doc oficial; no apoyarse en el. El CLI debe llegar por npm.
- Marketplace: `$REPO_ROOT/.agents/plugins/marketplace.json` (repo) o `~/.agents/plugins/marketplace.json` (personal). Cada entrada lleva `name`, `source`, `policy` (`installation`: `AVAILABLE`, `INSTALLED_BY_DEFAULT`, `NOT_AVAILABLE`; `authentication`) y `category`. `source`: `{"source":"local","path":"./"}`, `url`, `git-subdir` o `npm` (sin lifecycle scripts). Copia instalada en `~/.codex/plugins/cache/<marketplace>/<plugin>/<version>/`.
- Instalacion minima: `codex plugin marketplace add WilliamBarriga/Rinthel-arch`, luego `/plugins` dentro de `codex` para instalar, y sesion nueva ([Plugins](https://learn.chatgpt.com/docs/plugins)). La extension de IDE no soporta plugins. Alternativa sin plugin: copiar las skills a `~/.agents/skills/`.

### OpenCode

- Skills: global `~/.config/opencode/skills`; compatibilidad global `~/.claude/skills` y `~/.agents/skills`; proyecto `.opencode/skills`, y por compatibilidad `.claude/skills` y `.agents/skills`, buscando desde el cwd hasta la raiz. Salta directorios ocultos y `node_modules` dentro de cada fuente; profundidad maxima 6 ([Skills](https://opencode.ai/docs/skills/)).
- Fuentes extra: el array `skills` de `opencode.json(c)` acepta rutas (relativas al cwd), `~/` y URLs HTTP de un catalogo: una URL base con `index.json` que lista `skills: [{ name, version, files }]`; los archivos se bajan de `<base>/<name>/<file>`; subir `version` invalida la cache.
- Plugin: los plugins de OpenCode son modulos JS/TS (`plugins` en la config, `.opencode/plugins/`, `opencode plugin add <paquete>`) que anaden herramientas, hooks, comandos y agentes; la pagina no menciona skills ni marketplace ([Plugins](https://opencode.ai/docs/plugins/)). No hace falta un plugin para distribuir skills.
- CLI acompanante: ninguno declarativo; el CLI llega por npm.
- Instalacion minima: si el usuario ya instalo el plugin de Claude Code, nada (OpenCode no lee la cache de plugins de Claude, pero si `~/.claude/skills`; ver nota). Lo directo: `npx skills add WilliamBarriga/Rinthel-arch -a opencode -g`, que copia a `~/.config/opencode/skills/` (tabla de `vercel-labs/skills` `docs/agents.md`). Sin herramienta: copiar `skills/*` a `~/.config/opencode/skills/` o `~/.agents/skills/`. Opcion futura: publicar un catalogo HTTP (`index.json`) en GitHub Pages y que el usuario anada una linea `skills` a su config.

Nota: las skills instaladas como plugin de Claude Code viven en la cache de plugins, no en `~/.claude/skills`, asi que OpenCode no las ve por esa via.

### Pi

- Skills: directorios de usuario y proyecto de Pi, mas "the Agent Skills locations `~/.agents/skills/` and `.agents/skills/`", estos ultimos desde el cwd hasta la raiz del repo. Invocacion explicita `/skill:<nombre>`; `disable-model-invocation: true` la oculta del modelo. Pi no exige que `name` coincida con la carpeta pero lo recomienda (`docs/skills.md`).
- Paquete: un "Pi package" es un directorio o paquete npm con `extensions/`, `skills/`, `prompts/`, `themes/` por convencion, o rutas explicitas bajo la clave `pi` del `package.json` (`"pi": { "skills": ["./skills"] }`). La keyword `pi-package` lo hace visible en la galeria `pi.dev/packages` (`docs/packages.md`). No hay marketplace aparte: npm es el catalogo.
- Instalacion: `pi install npm:<paquete>@<version>`, `pi install git:github.com/<owner>/<repo>@<ref>` o una ruta local; `--local` lo escribe en `.pi/settings.json` del proyecto; `pi -e npm:<paquete>` lo prueba una vez. "Pi installs package dependencies when it installs an npm or git source"; en el bundle de 1.6.0 eso es `npm install --omit=dev ...` (y `npm ci --ignore-scripts --omit=dev` en otra via).
- CLI acompanante: la doc dice "Keep environment setup inside the skill and declare any required runtime dependencies in the package"; no documenta enlazar `bin` al `PATH`. Si el paquete npm de Pi es el mismo que trae el CLI, el binario queda en el `node_modules` de Pi pero no en el `PATH` del usuario; la skill debe usar `diagrams` del `PATH` o `npx`.
- Riesgo (no verificado): `pi install git:` sobre la raiz de este monorepo correria `npm install` sobre un `package.json` raiz con dependencias `workspace:*`, que npm no entiende, y clonaria el repo entero. Por eso para Pi conviene el paquete npm, no el git.
- Instalacion minima: `pi install npm:rinthel-arch`.

## Arbol comun propuesto

```
skills/
  rinthel-diagramas/SKILL.md (+ references/ con lo que hoy cita de docs/)
  rinthel-temas/SKILL.md     (+ references/)
.claude-plugin/
  plugin.json          name: rinthel-arch (skills/ se descubre solo)
  marketplace.json     plugins: [{ name: rinthel-arch, source: "./" }]
.codex-plugin/
  plugin.json          name, version, "skills": "./skills/", interface
.agents/plugins/
  marketplace.json     plugins: [{ name: rinthel-arch, source: { source: local, path: "./" }, policy, category }]
bin/
  diagrams             shim solo para Claude Code: exec diagrams del PATH o npx -y -p rinthel-arch@<version> diagrams
packages/<publicable>/package.json
  name: rinthel-arch, bin: { diagrams }, "pi": { "skills": [...] }, keywords: [pi-package]
```

- `skills/` ya esta en la raiz y es la unica copia. Los manifiestos de Claude y Codex lo leen en sitio. El paquete npm lo incluye en `files` (copiandolo en el build, o publicando desde la raiz).
- `.agents/skills/` y `.claude/skills/` en el repo siguen siendo symlinks locales ignorados por git (hoy `.claude/` y `.agents/` estan en `.gitignore`). Ojo: el marketplace de Codex vive en `.agents/plugins/`, que tendria que salir del `.gitignore` (solo esa subcarpeta).
- `bin/` en la raiz hace que claude.ai y Cowork no instalen el plugin; es aceptable porque el publico es la terminal, pero se puede evitar si la skill llama a `npx` directamente.
- Versiones: `version` en `.claude-plugin/plugin.json`, `.codex-plugin/plugin.json` y `package.json` debe moverse junta; Claude Code fija la version instalada a ese campo.

## CLI `diagrams`

Estado actual (`packages/cli/package.json`): `"name": "cli"`, `"private": true`, `bin: { diagrams: ./dist/bin.js }`, dependencias `workspace:*` (`canonico`, `dsl`, `estudio`, `layout`, `sesion`, `tema`) y `esbuild` en runtime. No es instalable fuera del monorepo.

- `npx diagrams` no sirve: el nombre `diagrams` en npm es otro paquete (0.11.0, "Generate Flowcharts, Network Sequence, Dot, and Railroad Diagrams"). Ejecutarlo seria correr codigo ajeno.
- `rinthel-arch` y `@rinthel/arch` estaban libres en npm el 2026-11-24.
- Con dos binarios (`diagrams` y el alias `dg`) `npx rinthel-arch` no sabe cual correr; la forma estable es `npx -y -p rinthel-arch@<version> diagrams ...`. Fijar la version evita que el contrato JSON cambie bajo la skill.
- Publicar exige empaquetar las dependencias del workspace en el `dist` (por ejemplo `noExternal` en tsup) y dejar `esbuild` (binario nativo por plataforma) como dependencia real. Es trabajo de un ticket de implementacion; la adopcion del registro npm y del nombre se decide en ticket o ADR.
- Las skills deben decir en una linea como obtener el CLI: "Usa `diagrams` si esta en el `PATH`; si no, `npx -y -p rinthel-arch@<version> diagrams`" y declararlo en `compatibility`.

## Pasos minimos por agente (con el paquete publicado)

| Agente | Skills | CLI |
| --- | --- | --- |
| Claude Code | `claude plugin install rinthel-arch --marketplace WilliamBarriga/Rinthel-arch` | `bin/diagrams` del plugin (shim a npx) o `npm i -g rinthel-arch` |
| Codex | `codex plugin marketplace add WilliamBarriga/Rinthel-arch` y `/plugins` en `codex` | `npm i -g rinthel-arch` o npx desde la skill |
| OpenCode | `npx skills add WilliamBarriga/Rinthel-arch -a opencode -g` | `npm i -g rinthel-arch` o npx desde la skill |
| Pi | `pi install npm:rinthel-arch` | `npm i -g rinthel-arch` o npx desde la skill |

Atajo comun para todos los que leen `.agents/skills` (Codex, OpenCode, Pi): `npx skills add WilliamBarriga/Rinthel-arch -g` con el agente elegido; `vercel-labs/skills` instala en `~/.agents/skills/` para Codex y Pi, y en `~/.config/opencode/skills/` para OpenCode. Es una dependencia del usuario, no del repo.

## Abierto

- Probar en limpio cada via (Claude, Codex, OpenCode, Pi) con el paquete publicado; ninguna se ejecuto en esta investigacion.
- Confirmar el comportamiento de `pi install git:` sobre el monorepo (riesgo `workspace:*`).
- Si Codex llega a documentar ejecutables de plugin o el formato portable de agent-plugins.org se vuelve el unico, reevaluar `.codex-plugin/`.
- Decidir si `bin/` en la raiz (Claude) compensa perder claude.ai y Cowork.
