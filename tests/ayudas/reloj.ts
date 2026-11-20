/**
 * Reloj falso para el Workspace vivo y el Registro de actividad vivo de `sesion` (unica copia): las tareas
 * programadas solo corren al `avanzar`. Cumple `Reloj` de `sesion` por forma, sin importarlo.
 */
export interface RelojFalso {
  programar(fn: () => void, ms: number): () => void;
  /** Avanza el tiempo y corre las tareas vencidas, en orden de programacion. */
  avanzar(ms: number): void;
  /** Tareas programadas que aun no corrieron. */
  pendientes(): number;
}

export function relojFalso(): RelojFalso {
  let ahora = 0;
  let tareas: { en: number; fn: () => void }[] = [];
  return {
    programar(fn, ms) {
      const tarea = { en: ahora + ms, fn };
      tareas.push(tarea);
      return () => {
        tareas = tareas.filter((t) => t !== tarea);
      };
    },
    avanzar(ms) {
      ahora += ms;
      const vencidas = tareas.filter((t) => t.en <= ahora);
      tareas = tareas.filter((t) => t.en > ahora);
      for (const t of vencidas) t.fn();
    },
    pendientes: () => tareas.length,
  };
}
