/** Viewer accessibility: reduced-motion and high-contrast toggles, and the Node kind legend. Touches neither the Workspace nor the Model. */
import { useEffect, useState } from 'react';
import type { ReactElement } from 'react';

import type { CanonicalForm, Theme, ResolvedView } from 'canonical';
import { HIGH_CONTRAST_THEME, themeLegend } from 'theme';

export const ACCESSIBILITY_CSS = `
.rd-contraste { right: 8px; top: 8px; }
.rd-contraste { gap: 6px; }
.rd-contraste button { padding: 2px 8px; }
.rd-contraste button[aria-pressed="true"] { border-width: 3px; }
.rd-leyenda { right: 8px; bottom: 8px; flex-direction: column; align-items: flex-start; gap: 4px; padding: 6px 8px; margin: 0; list-style: none; background: var(--rd-fondo); border: 1px solid var(--rd-borde); border-radius: 4px; }
.rd-leyenda li { display: flex; align-items: center; gap: 6px; }
.rd-leyenda i { display: inline-block; width: 12px; height: 12px; border: 1px solid var(--rd-borde); }
`;

const QUERY = '(prefers-contrast: more)';

const query = (): MediaQueryList | undefined => (typeof matchMedia === 'function' ? matchMedia(QUERY) : undefined);

/** The system's `prefers-contrast: more`, current and reactive; `false` without `matchMedia`. */
function usePrefersHighContrast(): boolean {
  const [system, set] = useState<boolean>(() => query()?.matches ?? false);
  useEffect(() => {
    const list = query();
    if (list === undefined) return undefined;
    const handleChange = (event: MediaQueryListEvent): void => set(event.matches);
    list.addEventListener?.('change', handleChange);
    return () => list.removeEventListener?.('change', handleChange);
  }, []);
  return system;
}

export interface HighContrastProps {
  /** Controlled high contrast; without it the toggle rules and, before it is touched, `prefers-contrast: more`. */
  highContrast?: boolean;
  onHighContrastChange?: (active: boolean) => void;
}

/** Effective Theme of the viewer and the toggle: `high-contrast` replaces the Theme only here. */
export function useHighContrast(theme: Theme, props: HighContrastProps): { theme: Theme; active: boolean; toggleSwitch: ReactElement; reducedMotion: 'on' | 'off' | undefined } {
  const { reducedMotion, toggleSwitch: motion } = useReducedMotion();
  const system = usePrefersHighContrast();
  const [manual, setManual] = useState<boolean | undefined>(undefined);
  const active = props.highContrast ?? manual ?? system;
  const toggle = (): void => {
    if (props.highContrast === undefined) setManual(!active);
    props.onHighContrastChange?.(!active);
  };
  const toggleSwitch = (
    <div className="rd-chrome rd-contraste">
      <button type="button" aria-pressed={active} onClick={toggle}>
        High contrast
      </button>
      {motion}
    </div>
  );
  return { theme: active ? HIGH_CONTRAST_THEME : theme, active, toggleSwitch, reducedMotion };
}

const MOTION_QUERY = '(prefers-reduced-motion: reduce)';

/**
 * Manual reduced-motion toggle, independent of the system
 * preference: `reducedMotion` is `undefined` until touched (`prefers-reduced-motion` rules);
 * then `on`/`off` set the `Diagram` policy. The button starts pressed if the system asks for it.
 */
export function useReducedMotion(): { reducedMotion: 'on' | 'off' | undefined; toggleSwitch: ReactElement } {
  const [manual, setManual] = useState<boolean | undefined>(undefined);
  const system = typeof matchMedia === 'function' ? matchMedia(MOTION_QUERY).matches : false;
  const active = manual ?? system;
  const toggleSwitch = (
    <button type="button" aria-pressed={active} onClick={() => setManual(!active)}>
      Reduce motion
    </button>
  );
  return { reducedMotion: manual === undefined ? undefined : manual ? 'on' : 'off', toggleSwitch };
}

export type LegendMode = 'auto' | 'always' | 'never';

/** Legend of the View's Node kinds; `null` when not needed (`auto` mode without Node kinds that differ only by color). */
export function Legend({ source, view, theme, mode }: { source: CanonicalForm; view: ResolvedView; theme: Theme; mode: LegendMode }): ReactElement | null {
  if (mode === 'never') return null;
  const used = new Set(view.nodes.map((n) => n.type));
  const kinds = source.specification.nodeTypes
    .filter((t) => used.has(t.name))
    .map((t) => ({ name: t.name, color: typeof t['color'] === 'string' ? t['color'] : undefined, icon: t.icon }));
  const legendEl = themeLegend(theme, view.type, kinds);
  if (kinds.length === 0 || (mode === 'auto' && !legendEl.necesaria)) return null;
  return (
    <ul className="rd-chrome rd-leyenda" data-leyenda aria-label="Legend">
      {legendEl.entradas.map((e) => (
        <li key={e.tipo}>
          <i aria-hidden style={{ background: e.color ?? 'transparent' }} />
          <span>{`${e.tipo} (${e.forma}${e.color === undefined ? '' : `, ${e.color}`})`}</span>
        </li>
      ))}
    </ul>
  );
}
