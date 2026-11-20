/** El Registro de actividad vivo por su propia interfaz, con un registro en memoria y reloj falso (sin Sesion). */
import { afterEach, describe, expect, it } from 'vitest';

import type { ActividadDeDev, EventoDeActividad } from 'canonico';

import { abrirRegistroDeActividadVivo } from '../src/registro-de-actividad-vivo';
import type { RegistroDeActividad, RegistroDeActividadVivo } from '../src/registro-de-actividad-vivo';
import type { Reloj } from '../src/reloj';

/** Reloj falso: las tareas programadas solo corren al `avanzar`. */
function relojFalso(): Reloj & { avanzar(ms: number): void } {
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
  };
}

/** `.diagrams/actividad.jsonl` en memoria: cada cambio avisa a sus observadores, como el sondeo del disco. */
function registroEnMemoria(inicial?: string): RegistroDeActividad & { anexar(texto: string): void; reescribir(texto: string | undefined): void; observadores(): number } {
  let texto = inicial;
  const observadores = new Set<() => void>();
  const cambiar = (nuevo: string | undefined): void => {
    texto = nuevo;
    for (const alCambiar of [...observadores]) alCambiar();
  };
  return {
    leer: () => texto,
    observar(alCambiar) {
      observadores.add(alCambiar);
      return () => observadores.delete(alCambiar);
    },
    anexar: (mas) => cambiar((texto ?? '') + mas),
    reescribir: cambiar,
    observadores: () => observadores.size,
  };
}

const evento = (n: number, extra: Partial<EventoDeActividad> = {}): EventoDeActividad => ({
  contractVersion: 1,
  ts: `2026-11-19T10:00:${String(n % 60).padStart(2, '0')}.000Z`,
  pid: n,
  comando: 'validate',
  args: [],
  exitCode: 0,
  duracionMs: 1,
  ...extra,
});
const lineas = (...eventos: EventoDeActividad[]): string => eventos.map((e) => `${JSON.stringify(e)}\n`).join('');

const abiertos: RegistroDeActividadVivo[] = [];
afterEach(() => {
  for (const registro of abiertos.splice(0)) registro.cerrar();
});

function abrir(registro: RegistroDeActividad | undefined) {
  const reloj = relojFalso();
  const vivo = abrirRegistroDeActividadVivo({ ...(registro !== undefined && { registro }), reloj, debounceMs: 100 });
  abiertos.push(vivo);
  const empujados: ActividadDeDev[] = [];
  vivo.escuchar(({ datos }) => empujados.push(datos));
  return { vivo, reloj, empujados };
}

/** Los Eventos que recibiria un cliente al conectar. */
const previos = (vivo: RegistroDeActividadVivo): number[] => vivo.conexion().datos.eventos.map((e) => e.pid);

describe('Registro de actividad vivo', () => {
  it('al abrir reproduce los ultimos 50 eventos del registro como actividad con previos', () => {
    const { vivo } = abrir(registroEnMemoria(lineas(...Array.from({ length: 60 }, (_, i) => evento(i)))));

    const conexion = vivo.conexion();

    expect(conexion.nombre).toBe('actividad');
    expect(conexion.datos.previos).toBe(true);
    expect(previos(vivo)).toEqual(Array.from({ length: 50 }, (_, i) => i + 10));
  });

  it('sin registro, o con uno que aun no existe, conecta sin eventos y no empuja nada', () => {
    expect(abrir(undefined).vivo.conexion()).toEqual({ nombre: 'actividad', datos: { previos: true, eventos: [] } });
    expect(abrir(registroEnMemoria()).vivo.conexion().datos.eventos).toEqual([]);
  });

  it('empuja los eventos anexados como una sola tanda tras el debounce, sin las lineas rotas', () => {
    const registro = registroEnMemoria();
    const { vivo, reloj, empujados } = abrir(registro);

    registro.anexar(lineas(evento(1, { comando: 'edit', objetivo: { vista: 'v' } })));
    registro.anexar('{esto no es json\n');
    reloj.avanzar(50);
    registro.anexar(lineas(evento(2)));
    reloj.avanzar(99);
    expect(empujados).toEqual([]);
    reloj.avanzar(1);

    expect(empujados).toEqual([{ previos: false, eventos: [evento(1, { comando: 'edit', objetivo: { vista: 'v' } }), evento(2)] }]);
    expect(previos(vivo)).toEqual([1, 2]);
  });

  it('un registro acortado, rotado o borrado se vuelve a leer desde el principio', () => {
    const registro = registroEnMemoria(lineas(evento(1), evento(2), evento(3)));
    const { reloj, empujados } = abrir(registro);

    registro.reescribir(lineas(evento(4)));
    reloj.avanzar(100);
    registro.reescribir(undefined);
    reloj.avanzar(100);
    registro.anexar(lineas(evento(5)));
    reloj.avanzar(100);

    expect(empujados.flatMap(({ eventos }) => eventos.map((e) => e.pid))).toEqual([4, 5]);
  });

  it('un fallo al leer se ignora: el siguiente aviso reintenta', () => {
    const base = registroEnMemoria();
    let roto = false;
    const registro: RegistroDeActividad = { leer: () => (roto ? (() => { throw new Error('EBUSY'); })() : base.leer()), observar: base.observar };
    const { reloj, empujados } = abrir(registro);

    roto = true;
    base.anexar(lineas(evento(1)));
    reloj.avanzar(100);
    expect(empujados).toEqual([]);
    roto = false;
    base.anexar(lineas(evento(2)));
    reloj.avanzar(100);

    expect(empujados).toEqual([{ previos: false, eventos: [evento(1), evento(2)] }]);
  });

  it('cerrar deja de observar y cancela el debounce pendiente', () => {
    const registro = registroEnMemoria();
    const { vivo, reloj, empujados } = abrir(registro);

    registro.anexar(lineas(evento(1)));
    vivo.cerrar();
    reloj.avanzar(100);

    expect(empujados).toEqual([]);
    expect(registro.observadores()).toBe(0);
  });
});
