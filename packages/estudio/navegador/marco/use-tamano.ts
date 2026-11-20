/** Tamano de la ventana (`resize`): lo usan las islas para sus limites y el lienzo para su area. */
import { useEffect, useState } from 'react';

export function useTamano(): { width: number; height: number } {
  const [tamano, setTamano] = useState({ width: window.innerWidth, height: window.innerHeight });
  useEffect(() => {
    const alCambiar = (): void => setTamano({ width: window.innerWidth, height: window.innerHeight });
    window.addEventListener('resize', alCambiar);
    return () => window.removeEventListener('resize', alCambiar);
  }, []);
  return tamano;
}
