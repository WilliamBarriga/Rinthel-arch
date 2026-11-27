/**
 * Stand-in for `zod` in the Worker bundle: `canonical` builds its schemas on load even though layout does not validate.
 * It accepts any chain of calls and does nothing.
 */
const inert: unknown = new Proxy(function () {}, {
  get: () => inert,
  apply: () => inert,
  construct: () => inert as object,
});

export const z = inert as never;
