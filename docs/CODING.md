# Reglas de codigo

Vocabulario de diseno: **Modulo**, **Interfaz**, **Seam**, **Adaptador**, **Profundidad** (skill `codebase-design`). Vocabulario de dominio: `CONTEXT.md`. Decisiones de contrato por modulo: `docs/adr/`.

## Estructura

Monorepo con workspaces. Un paquete en `packages/` por modulo profundo (canonico, tema, dsl, layout, sesion, render, shell, estudio, cli). La interfaz del modulo es el paquete: lo que no sale por `exports` de su `package.json` es privado. `exports` declara solo `.`; la unica excepcion es `estudio`, con `./protocolo` (tipos del protocolo de `dev` que `cli` importa sin cargar la app), `./contrato` (suite de contrato de solo pruebas) y `./construir` (arma el bundle de la app; lo usan su build y el bench). Un paquete se importa por su nombre; los archivos internos de otro paquete no se importan.

## Modulos profundos

- Interfaz pequena (pocas funciones y tipos), mucho comportamiento detras.
- La interfaz incluye invariantes, orden de llamadas, modos de error y configuracion requerida. La cabecera del `index.ts` la resume en pocas lineas (interfaz, invariantes, modos de error, dependencias); el detalle de cada export vive en su TSDoc y las opciones de usuario en `docs/guia/`.
- Test de borrado: si borrar el modulo hace desaparecer la complejidad, era un pass-through; se fusiona con quien lo usa.
- Las piezas internas pueden ser pequenas y sustituibles; solo cuenta como interfaz lo que cruza el seam.

## Hexagonal donde hay variacion real

- **Nucleo puro**: compilador DSL, Modelo, Vistas, validacion, Pin, render. Sin I/O, sin reloj, sin estado global.
- **Puertos**: interfaces que define el nucleo segun lo que necesita. **Adaptadores**: sistema de archivos, ELK, d3-zoom, Web Worker, CLI; viven en el borde y dependen del nucleo, nunca al reves.
- Un seam existe cuando algo varia a traves de el: un adaptador es un seam hipotetico, dos es uno real. Con un solo adaptador, llamada directa.
- Las dependencias entran como argumento; las funciones devuelven resultados en vez de mutar.
- Direccion de dependencias: `canonico -> tema -> dsl -> layout -> sesion -> render -> shell -> estudio -> cli`. Un paquete solo importa de los anteriores. `tema` va tras `canonico` porque reutiliza sus `Issue` y codigos, y antes de `dsl` porque el compilador de Temas valida con su catalogo (ADR 0004, enmienda).
- El nucleo es agnostico del Proyecto documentado (ver `AGENTS.md`).

## Pruebas

- La interfaz es la superficie de prueba: tests y llamadores cruzan el mismo seam.
- Entradas y salidas observables. Un refactor interno deja todos los tests en verde.
- Fakes en memoria (adaptadores reales de bajo costo) antes que mocks; mock solo para I/O que no se puede simular.
- Compilador: texto DSL entra, Fuente canonica sale; se compara contra la salida publica.
- Protocolo cliente-servidor: el fake va sobre el transporte, no sobre el dominio. `devEnMemoria` (`estudio/contrato`) es el Workspace vivo real de `sesion` (con `atenderApiDeDev`, las mismas rutas que `dev`) sobre `puertoEnMemoria`; solo el HTTP y el SSE son falsos. La app recibe `fetch` y la fabrica de eventos inyectados (sin polyfills de `EventSource` ni MSW) y los errores de red se inyectan envolviendo `fetch`.
- Contrato compartido entre fake y real: una suite (`probarContratoDeDev(crear)`) corre contra el fake en el paquete que lo define y contra el adaptador real en el que lo implementa. Una ruta nueva entra a la vez al contrato, al fake y al real.
- Interfaz de usuario: se consulta por rol y nombre accesible (prueba tambien la accesibilidad), nunca componentes ni estado interno; se espera con `findBy*`/`waitFor` y el tiempo (debounce, avisos) con timers falsos. Las islas y los componentes no son seams: se prueban a traves de la app montada en jsdom. Excepcion, solo donde no hay rol que consultar: el lienzo (`data-id`, `data-vista`, `data-layout`, `data-part` de las Partes dibujadas, las variables `--rd-*` del dibujo y lo que dibuja el Componente de Tema de prueba, `data-aurora` de `BUNDLE_DE_PRUEBA`; `lienzoListo` de `packages/estudio/test/ayudas-de-ui.tsx`; las ayudas de puntero del lienzo, como `pulsarNodo`, tienen una sola copia en `tests/ayudas/lienzo.ts`, que las pruebas de los paquetes importan por ruta relativa, como el reloj falso y los Eventos de actividad de `tests/ayudas/reloj.ts` y `tests/ayudas/actividad.ts`) y las decoraciones de CodeMirror (clases `cm-*` y las marcas que el editor pone en sus lineas); un atributo de estado del chrome (`data-arrastrando`) se busca como ancestro de un elemento consultado por rol.
- Una sola punta a punta en navegador real, dentro de `pnpm test` (`packages/cli/test/e2e-estudio.test.ts`): `dev` real, Chromium headless de Playwright, locators y plazo de 60 s. Cubre solo lo que jsdom no puede (escritura en disco, CodeMirror, scroll, arrastres); lo demas va a jsdom. Busca Chromium con `tests/ayudas/chromium.ts` (ayuda de prueba compartida en la raiz), el mismo helper que `pnpm capturas` y `pnpm docs:capturas`; sin Chromium falla pidiendo `pnpm exec playwright install chromium`. Sin regresion visual automatica: la estetica se revisa a mano con `pnpm docs:capturas` servido por `localhost`.
- Documentacion derivada: lo que sale de un esquema se genera, no se escribe a mano. `docs/referencia-catalogo.md` sale del catalogo de `tema` (`pnpm docs:catalogo`); `tests/referencia-catalogo.test.ts` falla si se desvia. Una Primitiva nueva: una entrada en el catalogo, su pintor y regenerar la referencia.
- Runner de pruebas: Vitest. Build de paquetes: tsup. Gestor: pnpm workspaces, sin orquestador de tareas.

## README de paquete

`packages/<paquete>/README.md` es la puerta de entrada del paquete: hasta 25 lineas (sin linea en blanco tras cada encabezado), con un resumen de una linea bajo el titulo `# <paquete>` y estas secciones `##`, en este orden (la lista vive en `SECCIONES_README` de `scripts/check-docs.ts`):

1. `Que hace`: las capacidades del paquete, en pocas lineas.
2. `Que NO hace`: lo que se busca aqui y vive en otro paquete, con el paquete dueno.
3. `Depende de`: paquetes del workspace que importa (o "Ningun paquete del workspace").
4. `Archivo de entrada`: ruta del `index.ts` entre comillas invertidas, relativa a la raiz del repo.
5. `ADR relacionado`: el ADR del contrato del paquete.
6. `Probar`: `pnpm --filter <paquete> test`.

Modelo: `packages/canonico/README.md`. `pnpm check:docs` falla si un paquete no tiene README o si este pierde una seccion, nombra un archivo de entrada inexistente o no da el comando de `Probar`.

## Chequeos automaticos

La direccion de dependencias, los imports internos entre paquetes, la superficie `exports` y la pureza del nucleo (`canonico`, `tema`, `dsl`, `sesion`, `render`: sin `node:*`, reloj, azar, `process`, red ni DOM; `layout`, `shell`, `estudio` y `cli` son adaptadores), y que ningun archivo reexporte (`export ... from`) de otro paquete salvo `estudio/protocolo` y la fachada de `shell`, y que `scripts/` y `bench/` usen de los paquetes solo su nombre o lo que declara `exports` (nunca sus `test/` o `scripts/` por ruta), los verifica `scripts/check-dependencies.ts` (`pnpm check:deps`); no se repiten en review.
