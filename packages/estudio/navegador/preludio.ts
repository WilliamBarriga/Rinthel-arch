/**
 * Debe ser el primer import de `worker.ts`: con `document` indefinido y `self` definido, ELK se toma por Worker
 * propio, no exporta su `FakeWorker` y el layout falla. Un `document` vacio hace que corra como libreria.
 */
if (typeof document === 'undefined') (globalThis as { document?: unknown }).document = {};
