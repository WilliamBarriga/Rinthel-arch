/** El Registro de actividad vivo a traves del Workspace vivo (`conexion` y `escuchar`), con `puertoEnMemoria` y reloj falso. */
import { afterEach, describe, expect, it } from 'vitest';

import type { DevActivity } from 'canonical';
import { abrirWorkspaceVivo, puertoEnMemoria } from 'sesion';
import type { PuertoDelWorkspaceVivo, WorkspaceVivo } from 'sesion';

import { eventoDeActividad as evento, lineasDeActividad as lineas } from '../../../tests/ayudas/actividad';
import { relojFalso } from '../../../tests/ayudas/reloj';

const MAIN = 'specification { node servicio }\nmodel { servicio a "A" }\n';

const abiertos: WorkspaceVivo[] = [];
afterEach(() => {
  for (const ws of abiertos.splice(0)) ws.cerrar();
});

async function abrir(puerto: PuertoDelWorkspaceVivo) {
  const reloj = relojFalso();
  const ws = await abrirWorkspaceVivo({ puerto, reloj, debounceMs: 100, raiz: '/ws', ahora: () => 0 });
  abiertos.push(ws);
  const empujados: DevActivity[] = [];
  ws.escuchar((e) => {
    if (e.name === 'actividad') empujados.push(e.data);
  });
  return { ws, reloj, empujados };
}

/** La actividad que recibiria un cliente al conectar. */
const actividadAlConectar = (ws: WorkspaceVivo): DevActivity | undefined => ws.conexion().find((e) => e.name === 'actividad')?.data as DevActivity | undefined;
const previos = (ws: WorkspaceVivo): number[] => actividadAlConectar(ws)?.eventos.map((e) => e.pid) ?? [];

describe('Registro de actividad vivo', () => {
  it('al abrir reproduce los ultimos 50 eventos del registro como actividad con previos', async () => {
    const { ws } = await abrir(puertoEnMemoria({ propios: { 'main.dg': MAIN }, actividad: lineas(...Array.from({ length: 60 }, (_, i) => evento(i))) }));

    expect(actividadAlConectar(ws)?.previos).toBe(true);
    expect(previos(ws)).toEqual(Array.from({ length: 50 }, (_, i) => i + 10));
  });

  it('con un registro que aun no existe conecta sin eventos', async () => {
    const { ws } = await abrir(puertoEnMemoria({ propios: { 'main.dg': MAIN } }));

    expect(actividadAlConectar(ws)).toEqual({ previos: true, eventos: [] });
  });

  it('empuja los eventos anexados como una sola tanda tras el debounce, sin las lineas rotas', async () => {
    const puerto = puertoEnMemoria({ propios: { 'main.dg': MAIN } });
    const { ws, reloj, empujados } = await abrir(puerto);

    puerto.anexarActividad(lineas(evento(1, { command: 'edit', target: { view: 'v' } })));
    puerto.anexarActividad('{esto no es json\n');
    reloj.avanzar(50);
    puerto.anexarActividad(lineas(evento(2)));
    reloj.avanzar(99);
    expect(empujados).toEqual([]);
    reloj.avanzar(1);

    expect(empujados).toEqual([{ previos: false, eventos: [evento(1, { command: 'edit', target: { view: 'v' } }), evento(2)] }]);
    expect(previos(ws)).toEqual([1, 2]);
  });

  it('un registro acortado, rotado o borrado se vuelve a leer desde el principio', async () => {
    const puerto = puertoEnMemoria({ propios: { 'main.dg': MAIN }, actividad: lineas(evento(1), evento(2), evento(3)) });
    const { reloj, empujados } = await abrir(puerto);

    puerto.reescribirActividad(lineas(evento(4)));
    reloj.avanzar(100);
    puerto.reescribirActividad(undefined);
    reloj.avanzar(100);
    puerto.anexarActividad(lineas(evento(5)));
    reloj.avanzar(100);

    expect(empujados.flatMap(({ eventos }) => eventos.map((e) => e.pid))).toEqual([4, 5]);
  });

  it('un fallo al leer se ignora: el siguiente aviso reintenta', async () => {
    const puerto = puertoEnMemoria({ propios: { 'main.dg': MAIN } });
    let roto = false;
    const { reloj, empujados } = await abrir({
      ...puerto,
      actividad: {
        leer: () => {
          if (roto) throw new Error('EBUSY');
          return puerto.actividad?.leer();
        },
        observar: (alCambiar) => puerto.actividad!.observar(alCambiar),
      },
    });

    roto = true;
    puerto.anexarActividad(lineas(evento(1)));
    reloj.avanzar(100);
    expect(empujados).toEqual([]);
    roto = false;
    puerto.anexarActividad(lineas(evento(2)));
    reloj.avanzar(100);

    expect(empujados).toEqual([{ previos: false, eventos: [evento(1), evento(2)] }]);
  });

  it('cerrar deja de observar el registro y cancela el debounce pendiente', async () => {
    const puerto = puertoEnMemoria({ propios: { 'main.dg': MAIN } });
    const { ws, reloj, empujados } = await abrir(puerto);

    puerto.anexarActividad(lineas(evento(1)));
    ws.cerrar();
    expect(reloj.pendientes()).toBe(0);
    puerto.anexarActividad(lineas(evento(2)));
    reloj.avanzar(100);

    expect(reloj.pendientes()).toBe(0);
    expect(empujados).toEqual([]);
  });
});
