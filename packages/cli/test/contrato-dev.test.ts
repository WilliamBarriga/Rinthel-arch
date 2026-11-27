/** La suite de contrato de `estudio` contra el `dev` real (HTTP y SSE de verdad) sobre `inMemoryPort`. */
import { eventosSobreFetch, probarContratoDeDev } from 'estudio/contrato';

import { iniciarDev } from 'cli';
import { inMemoryPort } from 'session';

probarContratoDeDev(async ({ own: propios, themes: temas, activity: actividad, brokenWrite: escrituraRota, codigo }) => {
  const puerto = inMemoryPort({ own: propios, ...(temas !== undefined && { themes: temas }), ...(actividad !== undefined && { activity: actividad }), ...(escrituraRota !== undefined && { brokenWrite: escrituraRota }) });
  const servidor = await iniciarDev({
    workspace: '/ws',
    puerto,
    ...(codigo !== undefined && { compilarCodigo: () => ({ components: Object.fromEntries(codigo.componentes.map((nombre) => [nombre, {}])), issues: [], bundle: codigo.bundle }) }),
    debounceMs: 5,
    puertoHttp: 0,
  });
  const fetchDelServidor: typeof fetch = (ruta, init) => fetch(new URL(String(ruta).replace(/^\//, ''), servidor.url), init);
  return {
    fetch: fetchDelServidor,
    eventos: eventosSobreFetch(fetchDelServidor),
    editarFuera: (ruta, texto) => puerto.editOutside(ruta, texto),
    anexarActividad: (texto) => puerto.appendActivity(texto),
    cerrar: () => servidor.cerrar(),
  };
});
