/**
 * Sustituto de `zod` en el bundle del Worker: `canonical` construye sus esquemas al cargarse aunque el layout no valide.
 * Acepta cualquier cadena de llamadas y no hace nada.
 */
const inerte: unknown = new Proxy(function () {}, {
  get: () => inerte,
  apply: () => inerte,
  construct: () => inerte as object,
});

export const z = inerte as never;
