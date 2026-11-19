/** Entrada de la pagina de `dev`: arma las dependencias reales del navegador y monta `<Estudio>`. */
import { adaptadorDeWorker, hashDelNavegador } from 'shell';
import type { AdaptadorDeLayout, PuertoDeMensajes } from 'shell';

import { EVENTOS_DE_DEV } from '../src/protocolo';
import { RUTA_DEL_ESTUDIO } from '../src/rutas';
import { montar } from './arranque';
import type { DependenciasDelCliente } from './cliente';
import { Estudio } from './estudio';

/** Un `EventSource` por conexion; cada evento con nombre del protocolo llega con su nombre. */
const eventos: DependenciasDelCliente['eventos'] = (url, alEvento) => {
  const origen = new EventSource(url);
  for (const nombre of EVENTOS_DE_DEV) origen.addEventListener(nombre, (evento) => alEvento(nombre, (evento as MessageEvent<string>).data));
  return () => origen.close();
};

function layoutEnWorker(): AdaptadorDeLayout {
  let adaptador: Promise<AdaptadorDeLayout> | undefined;
  return (vista, tema, medidas) => {
    adaptador ??= fetch(`${RUTA_DEL_ESTUDIO}worker.js`)
      .then((r) => r.text())
      .then((codigo) => adaptadorDeWorker(new Worker(URL.createObjectURL(new Blob([codigo], { type: 'text/javascript' }))) as unknown as PuertoDeMensajes));
    return adaptador.then((layout) => layout(vista, tema, medidas));
  };
}

const fetchDelNavegador: typeof fetch = (...args) => fetch(...args);
const confirmar = (mensaje: string): boolean => window.confirm(mensaje);

montar(<Estudio fetch={fetchDelNavegador} eventos={eventos} hash={hashDelNavegador(window)} layout={layoutEnWorker()} confirmar={confirmar} />);
