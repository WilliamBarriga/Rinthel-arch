/**
 * Must be the first import of `worker.ts`: with `document` undefined and `self` defined, ELK takes itself for its own
 * Worker, does not export its `FakeWorker` and the layout fails. An empty `document` makes it run as a library.
 */
if (typeof document === 'undefined') (globalThis as { document?: unknown }).document = {};
