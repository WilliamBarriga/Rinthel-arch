/**
 * Unico listener de teclado del estudio: traduce cada `keydown` de la ventana a un comando del registro con
 * `resolverTecla` y el ambito del elemento que tiene el foco. Escucha en captura para que los globales con
 * modificador ganen tambien dentro del editor (Mod+/ antes que CodeMirror); lo que no resuelve sigue su curso
 * (CodeMirror, el navegador, `VistaInteractiva`).
 */
import { useEffect, useLayoutEffect, useRef } from 'react';

import type { ContextoDelEstudio } from '../marco/contexto';
import type { Comando } from './registro';
import { resolverTecla } from './teclas';
import type { Ambito } from './teclas';

/** Ambito del foco segun el elemento: el editor CodeMirror, un campo de texto, el lienzo o el resto. */
export function ambitoDelFoco(elemento: EventTarget | null): Ambito {
  if (!(elemento instanceof Element)) return 'global';
  if (elemento.closest('.cm-editor') !== null) return 'editor';
  if (elemento instanceof HTMLElement && (elemento.isContentEditable || ['INPUT', 'TEXTAREA', 'SELECT'].includes(elemento.tagName))) return 'texto';
  if (elemento.closest('.ui-lienzo') !== null) return 'lienzo';
  return 'global';
}

export function useAtajos(comandos: readonly Comando[], contexto: ContextoDelEstudio): void {
  // El listener lee el contexto del ultimo render confirmado.
  const vivo = useRef(contexto);
  useLayoutEffect(() => {
    vivo.current = contexto;
  });
  useEffect(() => {
    const alTeclear = (e: KeyboardEvent): void => {
      const comando = resolverTecla(comandos, e, ambitoDelFoco(e.target), vivo.current.plataforma);
      if (comando === undefined) return;
      e.preventDefault();
      void comando.ejecutar(vivo.current);
    };
    window.addEventListener('keydown', alTeclear, { capture: true });
    return () => window.removeEventListener('keydown', alTeclear, { capture: true });
  }, [comandos]);
}
