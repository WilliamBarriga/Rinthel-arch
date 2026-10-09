/**
 * Primer import de `entrada.tsx`: fija el rol del bundle antes de que se
 * inicialice ELK. El motor de ELK se toma por Worker propio si ve `document`
 * indefinido y `self` definido (como en un Web Worker real), y entonces no
 * exporta su `FakeWorker` y el layout falla. Dentro del Worker se declara un
 * `document` vacio para que ELK corra como libreria; el rol queda en `rolWorker`.
 */
export const rolWorker = typeof document === 'undefined';

if (rolWorker) (globalThis as { document?: unknown }).document = {};
