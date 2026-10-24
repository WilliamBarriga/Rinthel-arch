/**
 * Accesibilidad del visor (ADR 0008): interruptor de reduced-motion, interruptor de `alto-contraste`, que sigue a
 * `prefers-contrast: more` y reemplaza el Tema solo en el visor, y la leyenda
 * derivada del Tema (Tipo, forma, color), que se muestra sola cuando dos Tipos
 * solo difieren por color. No toca el Workspace ni el Modelo.
 */
import { useEffect, useState } from 'react';
import type { ReactElement } from 'react';

import type { FuenteCanonica, Tema, VistaResuelta } from 'canonico';
import { TEMA_ALTO_CONTRASTE, leyendaDelTema } from 'tema';

export const CSS_DE_ACCESIBILIDAD = `
.rd-contraste { right: 8px; top: 8px; }
.rd-contraste { gap: 6px; }
.rd-contraste button { padding: 2px 8px; }
.rd-contraste button[aria-pressed="true"] { border-width: 3px; }
.rd-leyenda { right: 8px; bottom: 8px; flex-direction: column; align-items: flex-start; gap: 4px; padding: 6px 8px; margin: 0; list-style: none; background: var(--rd-fondo); border: 1px solid var(--rd-borde); border-radius: 4px; }
.rd-leyenda li { display: flex; align-items: center; gap: 6px; }
.rd-leyenda i { display: inline-block; width: 12px; height: 12px; border: 1px solid var(--rd-borde); }
`;

const CONSULTA = '(prefers-contrast: more)';

const consulta = (): MediaQueryList | undefined => (typeof matchMedia === 'function' ? matchMedia(CONSULTA) : undefined);

/** `prefers-contrast: more` del sistema, vigente y reactivo; `false` si no hay `matchMedia`. */
function usePrefiereAltoContraste(): boolean {
  const [sistema, fijar] = useState<boolean>(() => consulta()?.matches ?? false);
  useEffect(() => {
    const lista = consulta();
    if (lista === undefined) return undefined;
    const alCambiar = (evento: MediaQueryListEvent): void => fijar(evento.matches);
    lista.addEventListener?.('change', alCambiar);
    return () => lista.removeEventListener?.('change', alCambiar);
  }, []);
  return sistema;
}

export interface PropsDeAltoContraste {
  /** Alto contraste controlado; sin el, manda el interruptor y, antes de tocarlo, `prefers-contrast: more`. */
  highContrast?: boolean;
  onHighContrastChange?: (activo: boolean) => void;
}

/** Tema efectivo del visor y el interruptor: `alto-contraste` reemplaza al Tema solo aqui. */
export function useAltoContraste(tema: Tema, props: PropsDeAltoContraste): { tema: Tema; activo: boolean; interruptor: ReactElement; reducedMotion: 'on' | 'off' | undefined } {
  const { reducedMotion, interruptor: movimiento } = useReducedMotion();
  const sistema = usePrefiereAltoContraste();
  const [manual, fijarManual] = useState<boolean | undefined>(undefined);
  const activo = props.highContrast ?? manual ?? sistema;
  const alternar = (): void => {
    if (props.highContrast === undefined) fijarManual(!activo);
    props.onHighContrastChange?.(!activo);
  };
  const interruptor = (
    <div className="rd-chrome rd-contraste">
      <button type="button" aria-pressed={activo} onClick={alternar}>
        Alto contraste
      </button>
      {movimiento}
    </div>
  );
  return { tema: activo ? TEMA_ALTO_CONTRASTE : tema, activo, interruptor, reducedMotion };
}

const CONSULTA_MOVIMIENTO = '(prefers-reduced-motion: reduce)';

/**
 * Interruptor manual de reduced-motion (ADR 0008, US39), independiente de la preferencia
 * del sistema: `reducedMotion` es `undefined` hasta tocarlo (manda `prefers-reduced-motion`);
 * despues `on`/`off` fijan la politica de `Diagram`. El boton arranca pulsado si el sistema lo pide.
 */
export function useReducedMotion(): { reducedMotion: 'on' | 'off' | undefined; interruptor: ReactElement } {
  const [manual, fijarManual] = useState<boolean | undefined>(undefined);
  const sistema = typeof matchMedia === 'function' ? matchMedia(CONSULTA_MOVIMIENTO).matches : false;
  const activo = manual ?? sistema;
  const interruptor = (
    <button type="button" aria-pressed={activo} onClick={() => fijarManual(!activo)}>
      Reducir movimiento
    </button>
  );
  return { reducedMotion: manual === undefined ? undefined : manual ? 'on' : 'off', interruptor };
}

export type ModoDeLeyenda = 'auto' | 'always' | 'never';

/** Leyenda de los Tipos de la Vista; `null` si no hace falta (modo `auto` sin Tipos que solo difieran por color). */
export function Leyenda({ fuente, vista, tema, modo }: { fuente: FuenteCanonica; vista: VistaResuelta; tema: Tema; modo: ModoDeLeyenda }): ReactElement | null {
  if (modo === 'never') return null;
  const usados = new Set(vista.nodes.map((n) => n.type));
  const tipos = fuente.specification.nodeTypes
    .filter((t) => usados.has(t.name))
    .map((t) => ({ name: t.name, color: typeof t['color'] === 'string' ? t['color'] : undefined, icon: t.icon }));
  const leyenda = leyendaDelTema(tema, tipos);
  if (tipos.length === 0 || (modo === 'auto' && !leyenda.necesaria)) return null;
  return (
    <ul className="rd-chrome rd-leyenda" data-leyenda aria-label="Leyenda">
      {leyenda.entradas.map((e) => (
        <li key={e.tipo}>
          <i aria-hidden style={{ background: e.color ?? 'transparent' }} />
          <span>{`${e.tipo} (${e.forma}${e.color === undefined ? '' : `, ${e.color}`})`}</span>
        </li>
      ))}
    </ul>
  );
}
