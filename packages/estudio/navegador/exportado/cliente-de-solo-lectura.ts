/**
 * Read-only client: replaces the `dev` transport in an exported Dev UI. Serves the captured state, the `inspect tema`
 * output of each Theme and the Theme components bundle; every write is refused, there are no SSE events, and the
 * Geometry never arrives (the page lays out with its own ELK, measuring with the embedded fonts).
 * Invariants: never throws; `suscribir` delivers the state once, asynchronously, like the connection snapshot of `dev`.
 */
import type { DatosDeExportado } from '../../src/exportado';
import type { ClienteDeDev, ResultadoDeEnvio } from '../cliente';

const SOLO_LECTURA = 'This is a read-only export';

export function crearClienteDeSoloLectura(datos: DatosDeExportado): ClienteDeDev {
  const rechazo = async (): Promise<ResultadoDeEnvio> => ({ ok: false, desactualizado: false, message: SOLO_LECTURA });
  const { estado, temas, componentes } = datos;
  return {
    estado: async () => estado,
    suscribir(alEstado) {
      let activa = true;
      queueMicrotask(() => {
        if (activa) alEstado(estado);
      });
      return () => {
        activa = false;
      };
    },
    escuchar: () => () => undefined,
    async inspeccionar(comando, argumento) {
      const salida = comando === 'theme' ? temas[argumento] : undefined;
      return salida === undefined ? { ok: false, message: `${SOLO_LECTURA}: inspect ${comando} is not available`, suggestions: [] } : { ok: true, salida };
    },
    editar: rechazo,
    editarTexto: rechazo,
    archivos: async () => ({ ok: false, message: SOLO_LECTURA }),
    archivo: async () => undefined,
    deshacer: rechazo,
    rehacer: rechazo,
    saltar: rechazo,
    codigo: async () => ({ ok: true, valor: { temaConCodigo: componentes !== undefined, componentes: componentes?.nombres ?? [], confiado: true } }),
    confiar: async () => ({ ok: true }),
    bundleDeComponentes: async () => (componentes === undefined ? { ok: false, message: 'The Themes of this export load no code' } : { ok: true, valor: componentes.bundle }),
    geometria: async () => ({ ok: false }),
  };
}
