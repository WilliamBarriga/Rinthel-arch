/**
 * Primer import de `worker.ts`: ELK se toma por Worker propio si ve `document`
 * indefinido y `self` definido (como en un Web Worker real), y entonces no
 * exporta su `FakeWorker` y el layout falla. Dentro del Worker se declara un
 * `document` vacio para que ELK corra como libreria.
 */
if (typeof document === 'undefined') (globalThis as { document?: unknown }).document = {};
