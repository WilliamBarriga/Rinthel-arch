/**
 * Arrastre de Nodos bajo `dev`: gesto de raton (umbral, posicion en unidades de la geometria) y posicion
 * provisional del Nodo hasta que llega otra geometria o el aviso de movimiento lo rechaza.
 */
import { useEffect, useRef, useState } from 'react';
import type { MutableRefObject, RefObject } from 'react';

import type { Camara } from 'render';

import type { Calculo } from './geometria';

export type Movimiento = { id: string; x: number; y: number };
export type AlMoverNodo = (movimiento: Movimiento) => void | boolean | Promise<boolean | void>;

/** Id del Nodo dibujado (`g[data-id]` mas interno) bajo un evento, si lo hay. */
export function idDeNodoBajo(destino: EventTarget | null): string | undefined {
  return (destino as Element | null)?.closest?.('[data-id]')?.getAttribute('data-id') ?? undefined;
}

export interface EntradaDeArrastre {
  zona: RefObject<HTMLElement | null>;
  /** Habilitado solo si hay aviso de movimiento. */
  alMoverNodo: AlMoverNodo | undefined;
  /** Calculo vigente (sin morph ni desplazamiento): al cambiar, el desplazamiento provisional se descarta. */
  calculo: Calculo | undefined;
  calculoActual: RefObject<Calculo | undefined>;
  camaraVigente: RefObject<Camara>;
  ancho: number;
  umbral: MutableRefObject<number> | RefObject<number>;
  /** Ref al aviso mas reciente (el efecto es de larga vida). */
  ultimoAviso: RefObject<AlMoverNodo | undefined>;
}

/** Devuelve la posicion provisional del Nodo arrastrado y si un arrastre acaba de terminar (para ignorar el clic que le sigue). */
export function useArrastre(e: EntradaDeArrastre): { desplazado: Movimiento | undefined; arrastrando: RefObject<boolean> } {
  const [desplazado, setDesplazado] = useState<Movimiento | undefined>(undefined);
  const arrastrando = useRef(false);

  useEffect(() => {
    setDesplazado(undefined);
  }, [e.calculo]);

  const arrastrable = e.alMoverNodo !== undefined;
  useEffect(() => {
    if (!arrastrable) return;
    const nodo = e.zona.current!;
    const alPulsar = (evento: MouseEvent): void => {
      if (evento.button !== 0 || evento.ctrlKey) return;
      const id = idDeNodoBajo(evento.target);
      const caja = id === undefined ? undefined : e.calculoActual.current?.geometria.nodes[id];
      if (id === undefined || caja === undefined) return;
      const [x0, y0] = [evento.clientX, evento.clientY];
      let movido = false;
      /** Pixeles de pantalla por unidad de diagrama con la camara de este instante. */
      const escalaVigente = (): number => e.ancho / e.camaraVigente.current!.width;
      const alMover = (m: MouseEvent): void => {
        const [px, py] = [m.clientX - x0, m.clientY - y0];
        if (!movido && Math.hypot(px, py) < e.umbral.current!) return;
        movido = true;
        m.preventDefault();
        const k = escalaVigente();
        setDesplazado({ id, x: Math.round(caja.x + px / k), y: Math.round(caja.y + py / k) });
      };
      const alSoltar = (m: MouseEvent): void => {
        window.removeEventListener('mousemove', alMover);
        window.removeEventListener('mouseup', alSoltar);
        if (!movido) return;
        const k = escalaVigente();
        const destino = { id, x: Math.round(caja.x + (m.clientX - x0) / k), y: Math.round(caja.y + (m.clientY - y0) / k) };
        // El clic que sigue al soltar no debe seleccionar ni navegar.
        arrastrando.current = true;
        setTimeout(() => {
          arrastrando.current = false;
        }, 0);
        setDesplazado(destino);
        const devolver = (): void => setDesplazado((d) => (d?.id === id ? undefined : d));
        try {
          const resultado = e.ultimoAviso.current?.(destino);
          if (typeof resultado === 'object') resultado.then((ok) => ok === false && devolver(), devolver);
          else if (resultado === false) devolver();
        } catch {
          devolver();
        }
      };
      window.addEventListener('mousemove', alMover);
      window.addEventListener('mouseup', alSoltar);
    };
    nodo.addEventListener('mousedown', alPulsar);
    return () => nodo.removeEventListener('mousedown', alPulsar);
  }, [arrastrable]);

  return { desplazado, arrastrando };
}
