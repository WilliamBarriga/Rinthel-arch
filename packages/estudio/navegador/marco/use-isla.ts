/**
 * `useIsla`: tamano, visibilidad y asas de una isla lateral. El ancho y el alto se cambian con Pointer Events
 * (`setPointerCapture`) o con el teclado del separador (patron "window splitter" de WAI-ARIA); los limites son
 * las funciones puras de `limites.ts`. `alto: null` deja que la isla mida su contenido; doble clic en un asa de alto
 * vuelve a eso. Mientras se arrastra, `arrastrando` es `true` (el marco baja el vidrio durante el gesto).
 */
import { useRef, useState } from 'react';
import type { HTMLAttributes, KeyboardEvent, PointerEvent } from 'react';

import { rangoDeIsla, tamanoPorTeclado, tamanoTrasArrastre } from './limites';
import type { EjeDeAsa, LadoDeIsla, Lienzo, TamanoDeIsla, TamanoMedido } from './limites';

export interface OpcionesDeIsla {
  lado: LadoDeIsla;
  /** `id` del elemento de la isla, para `aria-controls`. */
  id: string;
  /** Nombre de la isla en las etiquetas de las asas ("panel izquierdo"). */
  nombre: string;
  lienzo: Lienzo;
  anchoInicial: number;
}

export interface Isla {
  tamano: TamanoDeIsla;
  oculta: boolean;
  arrastrando: boolean;
  alternar(): void;
  mostrar(): void;
  ocultar(): void;
  /** Ensancha la isla hasta `minimo` (recortado al maximo del lienzo); si ya es mas ancha, no cambia. */
  ensanchar(minimo: number): void;
  /** Para medir el content height al empezar un gesto. */
  ref: (elemento: HTMLElement | null) => void;
  /** Props del asa de un eje: separador accesible para `horizontal` y `vertical`; la esquina es solo de puntero. */
  asa(eje: EjeDeAsa): HTMLAttributes<HTMLDivElement>;
}

export function useIsla({ lado, id, nombre, lienzo, anchoInicial }: OpcionesDeIsla): Isla {
  const [tamano, setTamano] = useState<TamanoDeIsla>({ ancho: anchoInicial, alto: null });
  const [oculta, setOculta] = useState(false);
  const [arrastrando, setArrastrando] = useState(false);
  const elemento = useRef<HTMLElement | null>(null);
  const gesto = useRef<{ x: number; y: number; inicio: TamanoMedido; eje: EjeDeAsa } | undefined>(undefined);

  const medido = (): TamanoMedido => ({ ...tamano, altoMedido: Math.round(elemento.current?.getBoundingClientRect().height ?? 0) });
  const rango = rangoDeIsla(lienzo);

  const asa = (eje: EjeDeAsa): HTMLAttributes<HTMLDivElement> => {
    const puntero: HTMLAttributes<HTMLDivElement> = {
      onPointerDown(e: PointerEvent<HTMLDivElement>) {
        if (e.button !== 0) return;
        e.preventDefault();
        e.currentTarget.setPointerCapture?.(e.pointerId);
        gesto.current = { x: e.clientX, y: e.clientY, inicio: medido(), eje };
        setArrastrando(true);
      },
      onPointerMove(e: PointerEvent<HTMLDivElement>) {
        const g = gesto.current;
        if (g === undefined) return;
        setTamano(tamanoTrasArrastre(g.inicio, { dx: e.clientX - g.x, dy: e.clientY - g.y }, { lado, eje: g.eje }, lienzo));
      },
      onPointerUp(e: PointerEvent<HTMLDivElement>) {
        e.currentTarget.releasePointerCapture?.(e.pointerId);
        gesto.current = undefined;
        setArrastrando(false);
      },
      onPointerCancel() {
        gesto.current = undefined;
        setArrastrando(false);
      },
    };
    const volverAlContenido = (): void => setTamano((t) => ({ ...t, alto: null }));
    if (eje === 'diagonal') return { ...puntero, 'aria-hidden': true, onDoubleClick: volverAlContenido };
    const teclado = (e: KeyboardEvent<HTMLDivElement>): void => {
      const nuevo = tamanoPorTeclado(e.key, medido(), { lado, eje }, lienzo);
      if (nuevo === undefined) return;
      e.preventDefault();
      setTamano(nuevo);
    };
    if (eje === 'horizontal') {
      return { ...puntero, role: 'separator', tabIndex: 0, 'aria-orientation': 'vertical', 'aria-label': `Width of the ${nombre}`, 'aria-controls': id, 'aria-valuemin': rango.ancho.min, 'aria-valuemax': rango.ancho.max, 'aria-valuenow': tamano.ancho, onKeyDown: teclado };
    }
    return {
      ...puntero,
      role: 'separator',
      tabIndex: 0,
      'aria-orientation': 'horizontal',
      'aria-label': `Height of the ${nombre}`,
      'aria-controls': id,
      'aria-valuemin': rango.alto.min,
      'aria-valuemax': rango.alto.max,
      'aria-valuenow': tamano.alto ?? Math.round(elemento.current?.getBoundingClientRect().height ?? rango.alto.min),
      'aria-valuetext': tamano.alto === null ? 'content height' : `${tamano.alto} px`,
      onKeyDown: teclado,
      onDoubleClick: volverAlContenido,
    };
  };

  return {
    tamano,
    oculta,
    arrastrando,
    alternar: () => setOculta((o) => !o),
    mostrar: () => setOculta(false),
    ocultar: () => setOculta(true),
    ensanchar: (minimo) => setTamano((t) => (t.ancho >= minimo ? t : { ...t, ancho: Math.max(t.ancho, Math.min(minimo, rango.ancho.max)) })),
    ref: (el) => {
      elemento.current = el;
    },
    asa,
  };
}
