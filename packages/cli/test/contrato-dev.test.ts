/** La suite de contrato de `estudio` contra el `dev` real (HTTP y SSE de verdad) sobre `puertoEnMemoria`. */
import { eventosSobreFetch, probarContratoDeDev } from 'estudio/contrato';

import { iniciarDev } from 'cli';
import { puertoEnMemoria } from '../src/puerto-en-memoria';

probarContratoDeDev(async ({ propios, actividad }) => {
  const puerto = puertoEnMemoria({ propios, ...(actividad !== undefined && { actividad }) });
  const servidor = await iniciarDev({
    workspace: '/ws',
    leer: () => puerto.leer().propios,
    escribir: (_raiz, ruta, texto) => puerto.escribir(ruta, texto),
    borrar: (_raiz, ruta) => puerto.borrar(ruta),
    observar: (_raiz, alCambiar) => puerto.observar(alCambiar),
    actividad: () => puerto.actividad,
    debounceMs: 5,
    puerto: 0,
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
