# Reglas de codigo

Vocabulario de diseno: **Modulo**, **Interfaz**, **Seam**, **Adaptador**, **Profundidad** (skill `codebase-design`). Vocabulario de dominio: `CONTEXT.md`.

## Estructura

Monorepo con workspaces. Un paquete en `packages/` por modulo profundo (previstos: dsl, canonico, layout, render, shell, cli). La interfaz del modulo es el paquete: lo que no sale por `exports` de su `package.json` es privado. Un paquete se importa por su nombre; los archivos internos de otro paquete no se importan.

## Modulos profundos

- Interfaz pequena (pocas funciones y tipos), mucho comportamiento detras.
- La interfaz incluye invariantes, orden de llamadas, modos de error y configuracion requerida. Se documenta en el `index.ts` del paquete.
- Test de borrado: si borrar el modulo hace desaparecer la complejidad, era un pass-through; se fusiona con quien lo usa.
- Las piezas internas pueden ser pequenas y sustituibles; solo cuenta como interfaz lo que cruza el seam.

## Hexagonal donde hay variacion real

- **Nucleo puro**: compilador DSL, Modelo, Vistas, validacion, Pin, render. Sin I/O, sin reloj, sin estado global.
- **Puertos**: interfaces que define el nucleo segun lo que necesita. **Adaptadores**: sistema de archivos, ELK, d3-zoom, Web Worker, CLI; viven en el borde y dependen del nucleo, nunca al reves.
- Un seam existe cuando algo varia a traves de el: un adaptador es un seam hipotetico, dos es uno real. Con un solo adaptador, llamada directa.
- Las dependencias entran como argumento; las funciones devuelven resultados en vez de mutar.
- Direccion de dependencias: `canonico -> dsl -> layout -> render -> shell / cli`. Un paquete solo importa de los anteriores.
- El nucleo es agnostico del Proyecto documentado (ver `AGENTS.md`).

## Pruebas

- La interfaz es la superficie de prueba: tests y llamadores cruzan el mismo seam.
- Entradas y salidas observables. Un refactor interno deja todos los tests en verde.
- Fakes en memoria (adaptadores reales de bajo costo) antes que mocks; mock solo para I/O que no se puede simular.
- Compilador: texto DSL entra, Fuente canonica sale; se compara contra la salida publica.
- Runner de pruebas: Vitest. Build de paquetes: tsup. Gestor: pnpm workspaces, sin orquestador de tareas.
