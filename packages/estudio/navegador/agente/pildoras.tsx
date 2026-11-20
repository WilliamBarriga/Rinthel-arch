/**
 * Pildoras del agente en la barra: la ultima linea (con contador de lo no visto cuando no se le sigue; clic abre la
 * pestana Agente) y el interruptor "seguir al agente". Con el interruptor encendido, cada tanda en vivo lleva el lienzo
 * al destino de su ultimo objetivo (`destinoDelObjetivo`): cambia la Vista y la Seleccion, nunca las islas. Si lo que
 * nombra aun no esta en la Fuente (el estado llega despues que el Evento), espera al siguiente estado.
 */
import { Switch } from '@base-ui/react/switch';
import { useEffect, useState } from 'react';
import type { ReactElement } from 'react';

import type { ObjetivoDeActividad } from 'canonico';

import { useEstudio } from '../marco/contexto';
import { destinoDelObjetivo, resumenDelEvento, useActividadDelAgente } from './actividad';

export function UltimaLineaDelAgente(): ReactElement {
  const { cliente, abrirPestana } = useEstudio();
  const { almacen, instantanea } = useActividadDelAgente(cliente);
  const ultimo = instantanea.eventos[instantanea.eventos.length - 1];
  const linea = ultimo === undefined ? 'sin actividad' : resumenDelEvento(ultimo);
  const sinVer = instantanea.siguiendo ? 0 : instantanea.sinVer;
  return (
    <button
      type="button"
      className="ui-ultima-linea"
      aria-label={`Ultima linea del agente: ${linea}${sinVer > 0 ? `, ${sinVer} sin ver` : ''}`}
      title={linea}
      onClick={() => {
        abrirPestana('derecha', 'agente');
        almacen.marcarVisto();
      }}
    >
      <span className="ui-mono ui-ultima-linea-texto">{linea}</span>
      {sinVer > 0 && (
        <span className="ui-contador" aria-hidden>
          {sinVer}
        </span>
      )}
    </button>
  );
}

export function SeguirAlAgente(): ReactElement {
  const { cliente, fuente, vista, irAVista, seleccionar } = useEstudio();
  const { almacen, instantanea } = useActividadDelAgente(cliente);
  const [pendiente, setPendiente] = useState<{ objetivo: ObjetivoDeActividad }>();

  useEffect(
    () =>
      almacen.alEnVivo((eventos) => {
        if (!almacen.instantanea().siguiendo) return;
        const ultimo = [...eventos].reverse().find(({ objetivo }) => objetivo?.vista !== undefined || objetivo?.nodo !== undefined);
        if (ultimo?.objetivo !== undefined) setPendiente({ objetivo: ultimo.objetivo });
      }),
    [almacen],
  );

  useEffect(() => {
    if (pendiente === undefined) return;
    // Apagado (desde el interruptor o el Buscador) descarta lo que esperaba.
    if (!instantanea.siguiendo) {
      setPendiente(undefined);
      return;
    }
    if (fuente === undefined) return;
    const destino = destinoDelObjetivo(pendiente.objetivo, fuente, vista);
    if (destino === undefined) return;
    setPendiente(undefined);
    if (destino.vista !== vista) irAVista(destino.vista);
    if (destino.seleccion !== undefined) seleccionar(destino.seleccion);
    // Solo al llegar un objetivo nuevo, una Fuente nueva o al apagar; la Vista activa se lee de este render.
  }, [pendiente, fuente, instantanea.siguiendo]);

  return (
    <label className="ui-seguir">
      <Switch.Root
        className="ui-interruptor"
        aria-label="Seguir al agente"
        checked={instantanea.siguiendo}
        onCheckedChange={(siguiendo) => almacen.seguir(siguiendo)}
      >
        <Switch.Thumb className="ui-interruptor-pulgar" />
      </Switch.Root>
      <span aria-hidden>seguir</span>
    </label>
  );
}
