/**
 * Panel Agente: el feed del Registro de actividad (una linea por Evento, el mas nuevo arriba) con hora, agente o pid,
 * comando, objetivo clicable y marca; los `args` al expandir. Mientras se ve, el contador de la barra queda a cero.
 * Encima, lo quitado por la ultima Diferencia externa (hasta la siguiente).
 */
import { useEffect, useState } from 'react';
import type { ReactElement } from 'react';

import { etiquetaDeElemento } from 'canonico';
import type { EventoDeActividad } from 'canonico';

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
    <section aria-label="Agente" className="ui-agente">
      {quitados.length > 0 && (
        <div className="ui-quitados">
          <p className="ui-tenue">Quitado por fuera</p>
          <ul aria-label="Quitado por fuera" className="ui-lista">
            {quitados.map((elemento) => {
              const { tipo, id } = etiquetaDeElemento(elemento);
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
        <p className="ui-tenue">Sin actividad del agente. Los comandos validate, build, inspect y edit apareceran aqui.</p>
      ) : (
        <ol className="ui-feed" aria-label="Actividad del agente">
          {eventos
            .map((evento, i) => <LineaDelFeed key={`${i}:${evento.ts}:${evento.pid}`} evento={evento} />)
            .reverse()}
        </ol>
      )}
    </section>
  );
}

function LineaDelFeed({ evento }: { evento: EventoDeActividad }): ReactElement {
  const { fuente, vista, irAVista, seleccionar } = useEstudio();
  const [abierta, setAbierta] = useState(false);
  const marca = marcaDelEvento(evento);
  const { objetivo } = evento;
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
        <span className="ui-mono">{evento.comando}</span>
        {objetivo?.vista !== undefined && (
          <button type="button" className="ui-enlace ui-mono" onClick={() => ir({ vista: objetivo.vista })}>
            {objetivo.vista}
          </button>
        )}
        {objetivo?.nodo !== undefined && (
          <button type="button" className="ui-enlace ui-mono" onClick={() => ir({ nodo: objetivo.nodo })}>
            {objetivo.nodo}
          </button>
        )}
        {objetivo?.tema !== undefined && <span className="ui-mono">{objetivo.tema}</span>}
        {objetivo?.archivos !== undefined && <span className="ui-mono ui-tenue">{objetivo.archivos.join(', ')}</span>}
        <span className="ui-feed-marca" data-marca={marca.tipo}>
          {marca.texto}
        </span>
        <button type="button" className="ui-boton-icono" aria-label="Ver args" aria-expanded={abierta} onClick={() => setAbierta((a) => !a)}>
          {abierta ? '▾' : '▸'}
        </button>
      </div>
      {abierta && <code className="ui-feed-args ui-mono">{['diagrams', evento.comando, ...evento.args].join(' ')}</code>}
    </li>
  );
}
