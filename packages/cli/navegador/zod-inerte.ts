/**
 * Sustituto de `zod` para el bundle del Worker: el layout solo usa funciones de
 * `canonico` que no validan, pero `canonico` construye sus esquemas al cargarse.
 * Este objeto acepta cualquier cadena de llamadas y no hace nada (ahorra ~90 KiB gzip).
 */
const inerte: unknown = new Proxy(function () {}, {
  get: () => inerte,
  apply: () => inerte,
  construct: () => inerte as object,
});

export const z = inerte as never;
