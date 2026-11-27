/**
 * Panel Agente: el feed del Registro de actividad (una linea por Evento, el mas nuevo arriba) con hora, agente o pid,
 * comando, objetivo clicable y marca; los `args` al expandir. Mientras se ve, el contador de la barra queda a cero.
 * Encima, lo quitado por la ultima Diferencia externa (hasta la siguiente).
 */
import { useEffect, useState } from 'react';
import type { ReactElement } from 'react';

import { elementLabel } from 'canonical';
import type { ActivityEvent } from 'canonical';

import { useDiferencias } from '../diferencia/diferencias';
import { useEstudio } from '../marco/contexto';
import { destinoDelObjetivo, marcaDelEvento, quienDelEvento, useActividadDelAgente } from './actividad';

const dos = (n: number): string => String(n).padStart(2, '0');
/** Hora local `HH:MM:SS`. */
const hora = (ts: string): string => {
  const fecha = new Date(ts);
  return Number.isNaN(fecha.getTime()) ? ts : `${dos(fecha.getHours())}:${dos(fecha.getMinutes())}:${dos(fecha.getSeconds())}`;
};

export function PanelDelAgente(): ReactElement {
  const { cliente } = useEstudio();
  const { almacen, instantanea } = useActividadDelAgente(cliente);
  const { eventos, sinVer } = instantanea;
  const { quitados } = useDiferencias(cliente).instantanea.resaltado;
  useEffect(() => {
    if (sinVer > 0) almacen.marcarVisto();
  }, [almacen, sinVer]);

  return (
    <section aria-label="Agent" className="ui-agente">
      {quitados.length > 0 && (
        <div className="ui-quitados">
          <p className="ui-tenue">Removed externally</p>
          <ul aria-label="Removed externally" className="ui-lista">
            {quitados.map((elemento) => {
              const { kind: tipo, id } = elementLabel(elemento);
              return (
                <li key={`${tipo}:${id}`}>
                  <span className="ui-tenue">{tipo}</span> <span className="ui-mono">{id}</span>
                </li>
              );
            })}
          </ul>
        </div>
      )}
      {eventos.length === 0 ? (
        <p className="ui-tenue">No agent activity. The validate, build, inspect and edit commands will appear here.</p>
      ) : (
        <ol className="ui-feed" aria-label="Agent activity">
          {eventos
            .map((evento, i) => <LineaDelFeed key={`${i}:${evento.ts}:${evento.pid}`} evento={evento} />)
            .reverse()}
        </ol>
      )}
    </section>
  );
}

function LineaDelFeed({ evento }: { evento: ActivityEvent }): ReactElement {
  const { fuente, vista, irAVista, seleccionar } = useEstudio();
  const [abierta, setAbierta] = useState(false);
  const marca = marcaDelEvento(evento);
  const { target: objetivo } = evento;
  const ir = (destino: Parameters<typeof destinoDelObjetivo>[0]): void => {
    if (fuente === undefined) return;
    const d = destinoDelObjetivo(destino, fuente, vista);
    if (d === undefined) return;
    if (d.vista !== vista) irAVista(d.vista);
    if (d.seleccion !== undefined) seleccionar(d.seleccion);
  };
  return (
    <li className="ui-feed-linea" data-marca={marca.tipo}>
      <div className="ui-feed-cabecera">
        <time className="ui-mono ui-tenue" dateTime={evento.ts}>
          {hora(evento.ts)}
        </time>
        <span className="ui-feed-quien">{quienDelEvento(evento)}</span>
        <span className="ui-mono">{evento.command}</span>
        {objetivo?.view !== undefined && (
          <button type="button" className="ui-enlace ui-mono" onClick={() => ir({ view: objetivo.view })}>
            {objetivo.view}
          </button>
        )}
        {objetivo?.node !== undefined && (
          <button type="button" className="ui-enlace ui-mono" onClick={() => ir({ node: objetivo.node })}>
            {objetivo.node}
          </button>
        )}
        {objetivo?.theme !== undefined && <span className="ui-mono">{objetivo.theme}</span>}
        {objetivo?.files !== undefined && <span className="ui-mono ui-tenue">{objetivo.files.join(', ')}</span>}
        <span className="ui-feed-marca" data-marca={marca.tipo}>
          {marca.texto}
        </span>
        <button type="button" className="ui-boton-icono" aria-label="Show args" aria-expanded={abierta} onClick={() => setAbierta((a) => !a)}>
          {abierta ? '▾' : '▸'}
        </button>
      </div>
      {abierta && <code className="ui-feed-args ui-mono">{['diagrams', evento.command, ...evento.args].join(' ')}</code>}
    </li>
  );
}
