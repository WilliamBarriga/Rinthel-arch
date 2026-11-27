/** The `dev-ui` contract suite against the real `dev` (real HTTP and SSE) over `inMemoryPort`. */
import { eventsOverFetch, testDevContract } from 'dev-ui/contract';

import { startDev } from 'cli';
import { inMemoryPort } from 'session';

testDevContract(async ({ own: ownOnes, themes, activity, brokenWrite: brokenWriteFn, code }) => {
  const port = inMemoryPort({ own: ownOnes, ...(themes !== undefined && { themes }), ...(activity !== undefined && { activity }), ...(brokenWriteFn !== undefined && { brokenWrite: brokenWriteFn }) });
  const server = await startDev({
    workspace: '/ws',
    port: port,
    ...(code !== undefined && { compileCode: () => ({ components: Object.fromEntries(code.components.map((name) => [name, {}])), issues: [], bundle: code.bundle }) }),
    debounceMs: 5,
    httpPort: 0,
  });
  const serverFetch: typeof fetch = (path, init) => fetch(new URL(String(path).replace(/^\//, ''), server.url), init);
  return {
    fetch: serverFetch,
    events: eventsOverFetch(serverFetch),
    editOutside: (path, text) => port.editOutside(path, text),
    appendActivity: (text) => port.appendActivity(text),
    close: () => server.close(),
  };
});
