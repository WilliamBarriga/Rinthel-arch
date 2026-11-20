/** La suite de contrato de `estudio` contra el `dev` real (HTTP y SSE de verdad) sobre `puertoEnMemoria`. */
import { eventosSobreFetch, probarContratoDeDev } from 'estudio/contrato';

import { iniciarDev } from 'cli';
import { puertoEnMemoria } from 'sesion';

probarContratoDeDev(async ({ propios, temas, actividad, escrituraRota, codigo }) => {
  const puerto = puertoEnMemoria({ propios, ...(temas !== undefined && { temas }), ...(actividad !== undefined && { actividad }), ...(escrituraRota !== undefined && { escrituraRota }) });
  const servidor = await iniciarDev({
    workspace: '/ws',
    puerto,
    ...(codigo !== undefined && { compilarCodigo: () => ({ componentes: Object.fromEntries(codigo.componentes.map((nombre) => [nombre, {}])), issues: [], bundle: codigo.bundle }) }),
    debounceMs: 5,
    puertoHttp: 0,
  });
  const fetchDelServidor: typeof fetch = (ruta, init) => fetch(new URL(String(ruta).replace(/^\//, ''), servidor.url), init);
  return {
    fetch: fetchDelServidor,
    eventos: eventosSobreFetch(fetchDelServidor),
    editarFuera: (ruta, texto) => puerto.editarFuera(ruta, texto),
    anexarActividad: (texto) => puerto.anexarActividad(texto),
    cerrar: () => servidor.cerrar(),
  };
});
