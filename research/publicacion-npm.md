# Research: publicacion en npm (ticket #215)

Fecha de consulta: 2026-11-24. Mapa #211. Fuentes primarias: docs de npm (docs.npmjs.com, CLI v11), docs de pnpm (pnpm.io), el registro de npm (`npm view`, `registry.npmjs.org`), el calendario oficial de Node (`nodejs/Release/schedule.json`) y pruebas locales sobre `main` (`ac900aa`) con npm 11.19.0, pnpm 12.5.1 y Node 24.20.0 / 22.23.5 / 20.20.2. No se publico nada. Lo no verificado se marca **[no verificado]**.

## Pregunta

Que hace falta para publicar el CLI en npm y que funcione `npx <nombre> dev`: nombres disponibles, que paquetes del monorepo se publican y cuales se empaquetan dentro, fuentes y assets de los Temas de ejemplo, licencias incluidas, version minima de Node y practicas de publicacion desde local sin CI.

## Conclusion

Publicar **un solo paquete sin scope, `rinthel-arch`, con el CLI empaquetado en un bundle de esbuild** (todo el monorepo dentro de `dist/bin.js`), los estaticos de `estudio` copiados en `dist/estudio/`, `esbuild` como unica dependencia de runtime, `bin: { "diagrams": ..., "rinthel-arch": ... }` apuntando al mismo archivo, `engines.node >=22` y un aviso de terceros generado. Se publica a mano desde local con `pnpm publish` y 2FA interactivo (sin token); provenance no es posible sin CI. El prototipo pesa 2.1 MB comprimido (7.3 MB desempaquetado, 19 MB instalado con esbuild) y `npm exec --package=<tarball> -- diagrams dev` sirve la UI completa en Node 20, 22 y 24.

## Estado actual del repo (contexto)

- Los nueve paquetes (`canonico`, `tema`, `dsl`, `layout`, `sesion`, `render`, `shell`, `estudio`, `cli`) son `"private": true`, version `0.0.0`, ESM, build con tsup; se enlazan con `workspace:*` (ADR 0004). La raiz se llama `rinthel-arch`, tambien privada, con `engines.node >=20`.
- `cli` declara `bin: { "diagrams": "./dist/bin.js" }` y depende en runtime de `esbuild` 0.28.1 (compila al vuelo los `.tsx` de Componentes de Tema, `packages/cli/src/codigo.ts`).
- `estudio` produce en su build los estaticos de la app de `dev` (`dist/estudio/`: `index.html`, `pagina.js`, `worker.js`, `estilo.css`, `trozos/`), y su entrada de Node los ubica con `new URL('../dist/estudio/', import.meta.url)` (`packages/estudio/src/index.ts`). Esa ruta relativa importa para el bundle (ver abajo).
- Licencias en el repo: `LICENSE` (MIT, Rinthel) en la raiz y `packages/dsl/LICENSE-LIKEC4` (MIT de LikeC4, obligatoria por ADR 0001). Fuentes de ejemplo: `examples/rinthel-arch/fuentes/` (DejaVu, 1.1 MB, con `LICENCIA-DejaVu.txt`) y `examples/rinthel-arch/temas/fuentes/` (ocho familias OFL-1.1 en woff2 con su `OFL-<familia>.txt`; 640 KB la carpeta de Temas entera). El Tema `neutral` vive en codigo (`packages/tema`), no en archivos.
- Hoy la unica forma documentada de correr el CLI es desde el clon: `node packages/cli/dist/bin.js dev --workspace ...` (`README.en.md`).

## 1. Nombres en npm

Consultado con `npm view <nombre>` y `GET registry.npmjs.org/-/org/<scope>/package` el 2026-11-24:

| Nombre | Estado |
|---|---|
| `rinthel-arch` | libre (404) |
| `rinthel` | libre (404) |
| `rinthel-diagrams`, `rinthel-cli` | libres (404) |
| `@rinthel/*` (`@rinthel/arch`, `@rinthel/cli`) | libres; el scope `rinthel` no existe ni como usuario ni como organizacion ("Scope not found") |
| `diagrams` | **ocupado**: `diagrams@0.11.0`, de otro mantenedor, sin cambios desde 2023-02-21 |
| `canonico`, `estudio` | libres |
| `dsl`, `layout`, `render`, `tema`, `shell`, `cli`, `sesion` | **ocupados** por paquetes ajenos |

Consecuencias:

- `npx diagrams ...` descarga el paquete ajeno `diagrams`, no el nuestro. La documentacion nunca debe decir `npx diagrams`; debe decir `npx rinthel-arch <comando>` o instalar global (`npm i -g rinthel-arch`) y luego usar `diagrams`.
- Los nombres de paquete del workspace no se pueden publicar tal cual (siete estan tomados). Publicar varios paquetes exige un scope (`@rinthel/*`, que hay que reclamar creando el usuario u organizacion `rinthel` en npm) y renombrar en la publicacion.
- Las guias de npm piden que un nombre sin scope no se escriba de forma parecida a otro ni confunda sobre la autoria (docs.npmjs.com/package-name-guidelines); `rinthel-arch` es el nombre del repo y no choca con nada.
- Recomendacion: reservar `rinthel-arch` publicando pronto una version (un `0.x`), y opcionalmente crear la organizacion `rinthel` gratuita para tener el scope si un dia se publican librerias (`@rinthel/render`).

## 2. `npx rinthel-arch dev`: como elige npm el binario

Doc de `npm exec` (docs.npmjs.com/cli/v11/commands/npm-exec): sin `--package`, npm toma el ejecutable del primer argumento asi: si el paquete tiene una sola entrada en `bin`, **o todas las entradas son alias del mismo comando**, usa esa; si tiene varias y una coincide con la parte sin scope de `name`, usa esa; si no queda exactamente una, `npm exec` falla.

- Con `bin: { "diagrams": "./dist/bin.js" }` sola, `npx rinthel-arch dev` ya funciona (una sola entrada).
- Recomendado: `bin: { "diagrams": "./dist/bin.js", "rinthel-arch": "./dist/bin.js" }`. Ambas son alias del mismo archivo, `npx` sigue funcionando y quien instala global tiene los dos nombres.
- Con scope (`@rinthel/arch`) tambien funcionaria (`npx @rinthel/arch dev`), pero es mas largo de escribir.

Verificado: `npm exec --yes --package=/tmp/.../rinthel-arch-0.0.0-proto.tgz -- diagrams dev --workspace ws --port 47215` arranca, `GET /` devuelve 200, `/_estudio/pagina.js` (458 KB) y `/_estudio/worker.js` (1.6 MB) devuelven 200 y `/api/estado` devuelve la Fuente canonica del Workspace de ejemplo.

## 3. Un paquete empaquetado vs varios paquetes del workspace

### Opcion A (recomendada): un solo paquete con bundle

Prototipo hecho fuera del repo (`/tmp`), sin tocar codigo:

```
esbuild packages/cli/src/bin.ts --bundle --platform=node --format=esm --target=node20 \
  --outfile=dist/bin.js --external:esbuild --minify \
  --banner:js="import{createRequire as __cr}from'module';const require=__cr(import.meta.url);"
cp -r packages/estudio/dist/estudio dist/estudio
```

- El shebang de `src/bin.ts` se conserva. El banner `createRequire` cubre dependencias CJS empaquetadas en ESM (langium, chevrotain, vscode-languageserver).
- `esbuild` va `external` y como `dependencies` exacta: trae un binario nativo por plataforma via `optionalDependencies` (26 en 0.28.1) y no se puede empaquetar.
- La ruta de los estaticos sale gratis: `new URL('../dist/estudio/', import.meta.url)` evaluada desde `<paquete>/dist/bin.js` resuelve a `<paquete>/dist/estudio/`, que es donde se copian. Conviene que esta coincidencia quede cubierta por una prueba del empaquetado (por ejemplo, empaquetar y hacer `GET /_estudio/pagina.js`), porque cualquier cambio de esa ruta en `estudio` rompe `dev` publicado sin que fallen las pruebas actuales.
- Sin `workspace:` en el manifiesto publicado: el paquete publicado solo declara `esbuild`. Todo lo demas (React, zod, langium, elkjs, CodeMirror, d3...) va dentro del bundle o de `dist/estudio/`.
- La interfaz interna del monorepo (nombres en espanol, subpaths de `estudio`) no se vuelve API publica ni hay que versionarla con semver.
- El mapa deja fuera de alcance renombrar paquetes; con el bundle no hace falta.

Donde vive: un paquete nuevo que solo empaqueta (p. ej. `packages/rinthel-arch/` o un script de la raiz que arma `dist/` y un `package.json` de publicacion), o el propio `cli` con `publishConfig.name: "rinthel-arch"`. Con pnpm 12, `publishConfig.name` publica bajo otro nombre sin renombrar el manifiesto (pnpm.io/package_json, `publishConfig.name`). En cualquier caso, las dependencias `workspace:*` del paquete publicado deben pasar a `devDependencies`: pnpm reemplaza `workspace:*` por la version del paquete del workspace al empaquetar (pnpm.io/workspaces, "Publishing workspace packages"), y como esos paquetes son privados y no existen en el registro, la instalacion fallaria. Decidirlo es del ticket de implementacion; tocar `check:deps` (orden de paquetes) si se suma un paquete.

### Opcion B: publicar varios paquetes (`pnpm -r publish`)

- `pnpm -r publish` publica todos los paquetes no privados cuyas versiones no esten ya en el registro y reemplaza `workspace:*` por versiones reales (pnpm.io/cli/publish, pnpm.io/workspaces).
- Exige: scope `@rinthel` (siete nombres estan tomados), nueve `package.json` publicables (`files`, `license`, `repository`, versionado coordinado), `publishConfig.name` en cada uno o renombrar, y publicar `estudio` con sus estaticos dentro.
- Ventaja real: permite que un consumidor importe `@rinthel/render` como libreria. Pero ADR 0004 dice que integrar en un repo consumidor es trabajo de ese repo, y el mapa #211 solo pide el CLI. Costo: nueve paquetes que mantener en sincronia, mas superficie publica y una instalacion con muchas dependencias transitivas.
- Decision sugerida: B queda para cuando exista un consumidor real de `render`; no bloquea A (A no impide publicar `@rinthel/render` despues).

## 4. Assets: estudio, fuentes, Temas de ejemplo y licencias

`files` en `package.json` define que entra; siempre entran `package.json`, el `README` y el `LICENSE` de la raiz del paquete y los archivos de `bin`; nunca entran `.git`, `.npmrc`, `node_modules`, `pnpm-lock.yaml` y similares (docs.npmjs.com/cli/v11/configuring-npm/package-json, `files`). `LICENSE-LIKEC4` no tiene un nombre de los que entran solos: hay que listarlo en `files`.

Contenido recomendado del paquete:

- `dist/bin.js` (bundle) y `dist/estudio/**` (estaticos de la UI).
- `LICENSE` (MIT del proyecto) y `LICENSE-LIKEC4` (obligatoria, ADR 0001), en la raiz del paquete.
- `THIRD-PARTY-NOTICES` generado: el bundle y los estaticos llevan codigo de terceros y el build de `estudio` usa `legalComments: 'none'`, asi que hoy sus avisos no viajan. `pnpm licenses list --prod --recursive` da el inventario: 38 MIT (React, zod, langium, CodeMirror, Base UI, floating-ui...), 6 Apache-2.0 (chevrotain), 8 ISC y 1 BSD-3-Clause (d3) y **elkjs bajo `EPL-2.0 OR GPL-3.0-or-later`**. Para EPL-2.0 al distribuir en forma objeto hay que avisar de la licencia y de donde obtener el codigo fuente de elkjs **[no verificado contra el texto EPL-2.0 en este research; revisarlo al implementar]**. Apache-2.0 pide conservar el NOTICE si el paquete trae uno.
- `README.md` en ingles (el mapa pone el ingles como cara publica), con `npx rinthel-arch dev` y el enlace al repo.
- Temas de ejemplo con sus fuentes (opcional, 640 KB sin comprimir): `examples/rinthel-arch/temas/` con `fuentes/` y sus `OFL-*.txt`. La OFL-1.1 permite redistribuirlas junto con software si viajan con su licencia y no se venden solas (ya resuelto en el research `fuentes-tema`). Hoy, para usarlos, el usuario tendria que pasar `--theme-path <ruta dentro de node_modules>`, lo que no es practico; tiene sentido solo si el CLI ofrece una forma de referirlos (un `--theme-path` por defecto a los Temas incluidos o un comando que los copie al Workspace). Esa decision es de la UX del CLI y del ticket de instalacion, no de este research. DejaVu (`examples/rinthel-arch/fuentes/`, 1.1 MB) es del Workspace de ejemplo y no hace falta en el paquete.

## 5. Version minima de Node

- Calendario oficial (`nodejs/Release/schedule.json`): Node 20 termino el 2026-04-30 (ya sin soporte); Node 22 en mantenimiento hasta 2027-04-30; Node 24 LTS (mantenimiento desde 2026-10-20) hasta 2028-04-30; Node 26 LTS desde 2026-10-28.
- Prueba local con el tarball: `diagrams validate` sobre `examples/rinthel-arch` da el mismo resultado (0 errores, 36 avisos) en Node 20.20.2, 22.23.5 y 24.20.0; `diagrams dev` arranca y sirve `/` en Node 20. El codigo de runtime no usa APIs posteriores a Node 20 (solo `.at()` y `structuredClone`); `fs.watch` recursivo en Linux existe desde Node 20.
- `esbuild` 0.28.1 declara `engines.node >=18`.
- Recomendacion: `engines.node: ">=22"` en el paquete publicado. Funciona en 20, pero declarar una version sin soporte invita a reportes que no se van a atender; `engines` solo avisa al instalar (docs de npm, `engines`). La raiz del repo puede seguir en `>=20` o subir a la par (los scripts de la raiz corren `.ts` con `node` directo, lo que ya exige Node 22.6+ con type stripping **[no verificado en este research]**).

## 6. Publicar desde local sin CI: provenance y 2FA

- **Provenance no es posible desde local.** La doc dice que para publicar con provenance hay que construir el paquete en un proveedor de CI/CD en la nube soportado con runner alojado (hoy GitHub Actions y GitLab CI/CD) (docs.npmjs.com/generating-provenance-statements, "Provenance limitations"). Trusted publishing (OIDC) tampoco: soporta GitHub Actions, GitLab.com y CircleCI cloud, sin runners propios (docs.npmjs.com/trusted-publishers). AGENTS.md prohibe CI y workflows, asi que se publica sin provenance. Es aceptable; la doc aclara que provenance no garantiza ausencia de codigo malicioso, solo enlaza fuente y build.
- **2FA es obligatorio para publicar**: todo paquete exige 2FA o un token granular con "bypass 2FA" para crear y publicar (docs.npmjs.com/requiring-2fa-for-package-publishing-and-settings-modification). Recomendado para un solo mantenedor que publica a mano:
  1. 2FA en la cuenta con llave de seguridad (WebAuthn) o TOTP (docs.npmjs.com/configuring-two-factor-authentication).
  2. En la configuracion del paquete, "Require two-factor authentication and disallow tokens" (la opcion que npm marca como recomendada): solo se publica de forma interactiva y ningun token puede publicar.
  3. Publicar con `pnpm publish` desde el paquete: pnpm pide el OTP si el registro lo exige, o se pasa con `--otp` / `PNPM_CONFIG_OTP`; si el registro pide autenticacion web, pnpm imprime la URL (pnpm.io/cli/publish). Por defecto pnpm comprueba arbol limpio, rama de publicacion y rama al dia con el remoto (`--no-git-checks` lo salta; no usarlo).
  4. Antes de publicar: `pnpm publish --dry-run` o `npm pack --dry-run` para revisar la lista de archivos.
- **No usar tokens para publicar.** Los tokens legados ya no existen; los granulares con bypass 2FA y publicacion directa se dejan de aceptar para publicar en enero de 2027 (docs.npmjs.com/about-access-tokens, "Direct publishing is being deprecated"); el reemplazo para automatizacion son tokens "stage only" con `npm stage publish` y aprobacion con 2FA (`npm stage approve <id> --otp`). Sin CI no hace falta nada de eso.

## 7. Tamano resultante

Medido con el prototipo (`npm pack --dry-run` e instalacion del tarball en una carpeta vacia):

| Medida | Valor |
|---|---|
| Tarball (`.tgz`) | 2.1 MB |
| Desempaquetado | 7.3 MB, 18 archivos |
| `dist/bin.js` (CLI entero minificado) | 2.7 MB |
| `dist/estudio/` | 4.5 MB (`worker.js` 1.6 MB, `trozos/elk.bundled-*.js` 1.5 MB, `pagina.js` 458 KB, `panel-de-codigo` 393 KB...) |
| `node_modules` tras `npm install` del tarball | 19 MB (11 MB del binario `@esbuild/<plataforma>`, 7.1 MB del paquete) |
| Con Temas de ejemplo | +640 KB sin comprimir (woff2 ya comprimido) |

ELK aparece tres veces: dentro de `bin.js` (layout en Node), en `worker.js` y en `trozos/elk.bundled-*.js`. Deduplicar el trozo de la pagina y el Worker bajaria cerca de 1.5 MB; es optimizacion, no requisito.

Hallazgo lateral: npm 11.19 avisa al instalar que `esbuild` tiene un `postinstall` no aprobado (`npm install-scripts approve <pkg>`). Sin ese script esbuild funciona igual (el binario llega por `optionalDependencies`): `transformSync` respondio bien en la instalacion de prueba. Conviene decirlo en el README para que el aviso no asuste.

## 8. Checklist para el ticket de implementacion

1. Paquete de publicacion `rinthel-arch` (nuevo o `cli` con `publishConfig.name`), `version` 0.x, `license: "MIT"`, `repository`, `homepage`, `bugs`, `keywords`, `type: module`, `engines.node >=22`, `bin` con `diagrams` y `rinthel-arch`, `files: ["dist", "LICENSE-LIKEC4", "THIRD-PARTY-NOTICES"]`, `dependencies: { esbuild: "0.28.1" }`, todo `workspace:*` en `devDependencies`.
2. Script de empaquetado (esbuild, como arriba) que copia `estudio/dist/estudio` y las licencias, y genera los avisos de terceros desde `pnpm licenses list --prod`.
3. Prueba que empaqueta (`npm pack`), instala el tarball en una carpeta temporal y corre `validate` y `dev` (GET `/` y `/_estudio/pagina.js`).
4. Guias: `README` y `docs/guia/cli.md` con `npx rinthel-arch dev --workspace .` y nunca `npx diagrams`.
5. Cuenta: crear/usar la cuenta npm del mantenedor con 2FA (WebAuthn), publicar a mano, y al publicar la primera version activar "Require 2FA and disallow tokens".

## Fuentes

- npm exec: https://docs.npmjs.com/cli/v11/commands/npm-exec
- package.json (`files`, `bin`, `engines`, `license`): https://docs.npmjs.com/cli/v11/configuring-npm/package-json
- Guias de nombres: https://docs.npmjs.com/package-name-guidelines
- Provenance: https://docs.npmjs.com/generating-provenance-statements
- Trusted publishing: https://docs.npmjs.com/trusted-publishers
- 2FA para publicar: https://docs.npmjs.com/requiring-2fa-for-package-publishing-and-settings-modification
- Configurar 2FA: https://docs.npmjs.com/configuring-two-factor-authentication
- Tokens de acceso y stage-only: https://docs.npmjs.com/about-access-tokens
- pnpm workspaces (`workspace:` al publicar): https://pnpm.io/workspaces
- pnpm publish (`-r`, `--otp`, git checks): https://pnpm.io/cli/publish
- pnpm package.json (`publishConfig.name`): https://pnpm.io/package_json
- Calendario de Node: https://raw.githubusercontent.com/nodejs/Release/main/schedule.json
- Registro: `npm view <nombre>` y `https://registry.npmjs.org/-/org/rinthel/package`, consultados el 2026-11-24
