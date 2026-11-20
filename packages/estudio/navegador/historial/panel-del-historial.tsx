/**
 * Panel Historial: las entradas del Historial de `dev`, lo mas reciente arriba (el futuro atenuado, luego la posicion
 * actual y el pasado) y al final Inicio. Un clic salta a la entrada; las no alcanzables quedan deshabilitadas con su
 * motivo. Saltar pasa por la Escritura (`escribir`), que antes vacia el guardado pendiente del editor.
 */
import { useEffect, useId, useState } from 'react';
import type { ReactElement } from 'react';

import type { EntradaDelHistorialDeDev } from '../../src/protocolo';
import { useEstudio } from '../marco/contexto';
import { horaRelativa, useHistorialVisible } from './historial-visible';

/** Cada cuanto se rehace la hora relativa. */
const REFRESCO_MS = 15_000;

interface Fila {
  /** 0: Inicio. */
  id: number;
  entrada?: EntradaDelHistorialDeDev;
  alcanzable: boolean;
  motivo?: string;
  futuro: boolean;
  actual: boolean;
}

const filaDe = (entrada: EntradaDelHistorialDeDev, futuro: boolean, actual: boolean): Fila => ({
  id: entrada.id,
  entrada,
  alcanzable: entrada.alcanzable,
  ...(entrada.motivo !== undefined && { motivo: entrada.motivo }),
  futuro,
  actual,
});

export function PanelDelHistorial(): ReactElement {
  const estudio = useEstudio();
  const historial = useHistorialVisible(estudio.cliente);
  const [ahora, setAhora] = useState(() => Date.now());
  useEffect(() => {
    const t = setInterval(() => setAhora(Date.now()), REFRESCO_MS);
    return () => clearInterval(t);
  }, []);
  useEffect(() => setAhora(Date.now()), [historial]);

  if (historial === undefined) return <p className="ui-tenue">Esperando el Historial de dev.</p>;
  const { pasado, futuro, inicio } = historial;
  const ultima = pasado[pasado.length - 1];
  const filas: Fila[] = [
    ...[...futuro].reverse().map((e) => filaDe(e, true, false)),
    ...[...pasado].reverse().map((e) => filaDe(e, false, e === ultima)),
    { id: 0, alcanzable: inicio.alcanzable, ...(inicio.motivo !== undefined && { motivo: inicio.motivo }), futuro: false, actual: ultima === undefined },
  ];
  const saltar = (fila: Fila): void => {
    if (!fila.actual) void estudio.escribir({ historial: { saltar: fila.id } });
  };

  return (
    <section aria-label="Historial" className="ui-historial">
      {pasado.length === 0 && futuro.length === 0 && <p className="ui-tenue">Sin cambios todavia. Cada Gesto, guardado o fix sera una entrada.</p>}
      <ol className="ui-historial-lista" aria-label="Historial de cambios">
        {filas.map((fila) => (
          <FilaDelHistorial key={fila.id} fila={fila} ahora={ahora} alSaltar={saltar} />
        ))}
      </ol>
    </section>
  );
}

function FilaDelHistorial({ fila, ahora, alSaltar }: { fila: Fila; ahora: number; alSaltar: (fila: Fila) => void }): ReactElement {
  const idMotivo = useId();
  const { entrada } = fila;
  return (
    <li className="ui-historial-fila" data-futuro={fila.futuro ? 'true' : undefined} data-actual={fila.actual ? 'true' : undefined}>
      <button
        type="button"
        className="ui-historial-boton"
        disabled={!fila.alcanzable}
        aria-current={fila.actual ? 'step' : undefined}
        aria-describedby={fila.motivo === undefined ? undefined : idMotivo}
        onClick={() => alSaltar(fila)}
      >
        <span className="ui-historial-marca" aria-hidden="true">
          {fila.actual ? '●' : '○'}
        </span>
        {entrada === undefined ? (
          <span className="ui-historial-descripcion">Inicio</span>
        ) : (
          <>
            <span className="ui-historial-descripcion">{entrada.descripcion}</span>
            <span className="ui-mono ui-tenue">{entrada.archivos.join(', ')}</span>
            <time className="ui-tenue" dateTime={new Date(entrada.cuando).toISOString()}>
              {horaRelativa(entrada.cuando, ahora)}
            </time>
          </>
        )}
        {fila.actual && <span className="ui-historial-actual">actual</span>}
      </button>
      {fila.motivo !== undefined && (
        <p id={idMotivo} className="ui-historial-motivo">
          {fila.motivo}
        </p>
      )}
    </li>
  );
}
