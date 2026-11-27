/** La suite de contrato de `dev-ui` contra el `dev` real (HTTP y SSE de verdad) sobre `inMemoryPort`. */
import { eventsOverFetch, testDevContract } from 'dev-ui/contract';

import { iniciarDev } from 'cli';
import { inMemoryPort } from 'session';

testDevContract(async ({ own: propios, themes: temas, activity: actividad, brokenWrite: escrituraRota, code: codigo }) => {
  const puerto = inMemoryPort({ own: propios, ...(temas !== undefined && { themes: temas }), ...(actividad !== undefined && { activity: actividad }), ...(escrituraRota !== undefined && { brokenWrite: escrituraRota }) });
  const servidor = await iniciarDev({
    workspace: '/ws',
    puerto,
    ...(codigo !== undefined && { compilarCodigo: () => ({ components: Object.fromEntries(codigo.components.map((nombre) => [nombre, {}])), issues: [], bundle: codigo.bundle }) }),
    debounceMs: 5,
    puertoHttp: 0,
  });
  const fetchDelServidor: typeof fetch = (ruta, init) => fetch(new URL(String(ruta).replace(/^\//, ''), servidor.url), init);
  return {
    fetch: fetchDelServidor,
    events: eventsOverFetch(fetchDelServidor),
    editOutside: (ruta, texto) => puerto.editOutside(ruta, texto),
    appendActivity: (texto) => puerto.appendActivity(texto),
    close: () => servidor.cerrar(),
  };
});
