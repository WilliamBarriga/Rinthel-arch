// @vitest-environment jsdom
import { act, cleanup, fireEvent, screen, waitFor, within } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';

import type { EventoDeActividad } from 'canonico';

import { lienzoListo, montarEstudio } from './ayudas-de-ui';

afterEach(cleanup);

const DSL = `specification {
  node servicio
}

model {
  servicio api "API"
  servicio db "Base de datos"
  api -> db "lee"
}

view mapa {
  type architecture
  include **
}

view detalle {
  type flow
  include api
}

view otra {
  type architecture
  include db
}
`;

const evento = (pid: number, extra: Partial<EventoDeActividad> = {}): EventoDeActividad => ({
  contractVersion: 1,
  ts: '2026-11-19T10:00:00.000Z',
  pid,
  comando: 'edit',
  args: ['--workspace', '.', '--intent', '{"tipo":"mover-pin"}'],
  exitCode: 0,
  duracionMs: 4,
  ...extra,
});
const lineas = (...eventos: EventoDeActividad[]): string => eventos.map((e) => `${JSON.stringify(e)}\n`).join('');

const feed = () => screen.getByRole('list', { name: 'Actividad del agente' });
const ultimaLinea = () => screen.getByRole('button', { name: /^Ultima linea del agente/ });
const interruptor = () => screen.getByRole('switch', { name: 'Seguir al agente' });

describe('feed del agente', () => {
  it('al abrir muestra los Eventos previos, el mas nuevo arriba, con hora, quien, comando, objetivo y marca; args al expandir', async () => {
    await montarEstudio(
      { 'main.dg': DSL },
      { actividad: lineas(evento(11, { comando: 'validate', exitCode: 1, resumen: { errores: 2, avisos: 0 } }), evento(12, { agente: 'claude', objetivo: { vista: 'otra' } })) },
    );
    fireEvent.click(await screen.findByRole('tab', { name: 'Agente' }));

    const items = await waitFor(() => {
      const encontrados = within(feed()).getAllByRole('listitem');
      expect(encontrados).toHaveLength(2);
      return encontrados;
    });
    const [nuevo, viejo] = items as [HTMLElement, HTMLElement];
    expect(nuevo.querySelector('time')?.getAttribute('datetime')).toBe('2026-11-19T10:00:00.000Z');
    expect(within(nuevo).getByText(/^\d\d:\d\d:\d\d$/)).toBeTruthy();
    expect(within(nuevo).getByText('claude')).toBeTruthy();
    expect(within(nuevo).getByText('edit')).toBeTruthy();
    expect(within(nuevo).getByText('ok')).toBeTruthy();
    expect(within(viejo).getByText('pid 11')).toBeTruthy();
    expect(within(viejo).getByText('2 errores')).toBeTruthy();

    expect(within(nuevo).queryByText(/--intent/)).toBeNull();
    fireEvent.click(within(nuevo).getByRole('button', { name: 'Ver args' }));
    expect(within(nuevo).getByText(`diagrams edit --workspace . --intent {"tipo":"mover-pin"}`)).toBeTruthy();
  });

  it('el objetivo es clicable y lleva a la Vista que nombra', async () => {
    const { contenedor } = await montarEstudio({ 'main.dg': DSL }, { actividad: lineas(evento(1, { objetivo: { vista: 'otra' } })) });
    await lienzoListo(contenedor, 'mapa');
    fireEvent.click(screen.getByRole('tab', { name: 'Agente' }));

    fireEvent.click(await within(feed()).findByRole('button', { name: 'otra' }));

    await lienzoListo(contenedor, 'otra');
    expect(window.location.hash).toBe('#vista=otra');
  });
});

describe('ultima linea del agente', () => {
  it('la pildora muestra la ultima linea y cuenta lo nuevo sin seguir al agente; clic abre la pestana Agente y lo da por visto', async () => {
    const { dev } = await montarEstudio({ 'main.dg': DSL }, { actividad: lineas(evento(1)) });
    await waitFor(() => expect(ultimaLinea().getAttribute('aria-label')).toBe('Ultima linea del agente: pid 1 edit'));

    act(() => {
      dev.anexarActividad(lineas(evento(2, { agente: 'claude', objetivo: { vista: 'otra' } }), evento(3, { agente: 'claude', objetivo: { nodo: 'db' } })));
    });

    await waitFor(() => expect(ultimaLinea().getAttribute('aria-label')).toBe('Ultima linea del agente: claude edit db, 2 sin ver'));
    expect(ultimaLinea().textContent).toContain('2');
    expect(window.location.hash).not.toContain('vista=otra');

    fireEvent.click(ultimaLinea());
    expect(screen.getByRole('tab', { name: 'Agente' }).getAttribute('aria-selected')).toBe('true');
    expect(ultimaLinea().getAttribute('aria-label')).toBe('Ultima linea del agente: claude edit db');
  });
});

describe('seguir al agente', () => {
  it('objetivo.vista navega; objetivo.nodo se queda si la Vista lo contiene o va a la primera que lo contiene; archivos no mueve; las islas no cambian', async () => {
    const { dev, contenedor } = await montarEstudio({ 'main.dg': DSL }, { actividad: lineas(evento(1, { objetivo: { vista: 'detalle' } })) });
    await lienzoListo(contenedor, 'mapa');
    fireEvent.click(interruptor());
    expect(interruptor().getAttribute('aria-checked')).toBe('true');
    // Los previos no mueven.
    expect(window.location.hash).not.toContain('vista=detalle');
    const derecha = screen.getByRole('tablist', { name: 'Panel derecho' });
    const activaDerecha = () => within(derecha).getAllByRole('tab').find((t) => t.getAttribute('aria-selected') === 'true')?.textContent;
    expect(activaDerecha()).toBe('Detalle');

    act(() => dev.anexarActividad(lineas(evento(2, { objetivo: { vista: 'otra' } }))));
    await waitFor(() => expect(window.location.hash).toBe('#vista=otra'));

    act(() => dev.anexarActividad(lineas(evento(3, { objetivo: { nodo: 'db' } }))));
    await waitFor(() => expect(window.location.hash).toBe('#vista=otra&s=db'));

    act(() => dev.anexarActividad(lineas(evento(4, { objetivo: { nodo: 'api' } }))));
    // `mapa` es la Vista por defecto: el hash la omite.
    await waitFor(() => expect(window.location.hash).toBe('#s=api'));
    expect(screen.getByRole('option', { name: 'mapa' }).getAttribute('aria-selected')).toBe('true');

    act(() => dev.anexarActividad(lineas(evento(5, { objetivo: { archivos: ['main.dg'] } }))));
    await waitFor(() => expect(ultimaLinea().getAttribute('aria-label')).toBe('Ultima linea del agente: pid 5 edit main.dg'));
    expect(window.location.hash).toBe('#s=api');

    expect(activaDerecha()).toBe('Detalle');
    expect(screen.getByRole('listbox', { name: 'Vistas' })).toBeTruthy();
  });

  it('un Nodo que el agente nombra antes de que llegue el estado que lo crea se sigue al llegar ese estado', async () => {
    const { dev, contenedor } = await montarEstudio({ 'main.dg': DSL });
    await lienzoListo(contenedor, 'mapa');
    fireEvent.click(interruptor());

    act(() => dev.anexarActividad(lineas(evento(2, { objetivo: { nodo: 'cache' } }))));
    act(() => dev.editarFuera('main.dg', DSL.replace('include db', 'include db, cache').replace('servicio db "Base de datos"', 'servicio db "Base de datos"\n  servicio cache "Cache"').replace('include **', 'include api, db')));

    await waitFor(() => expect(window.location.hash).toBe('#vista=otra&s=cache'));
  });

  it('apagado no mueve el lienzo', async () => {
    const { dev, contenedor } = await montarEstudio({ 'main.dg': DSL });
    await lienzoListo(contenedor, 'mapa');

    act(() => dev.anexarActividad(lineas(evento(2, { objetivo: { vista: 'otra' } }))));

    await waitFor(() => expect(ultimaLinea().getAttribute('aria-label')).toContain('1 sin ver'));
    expect(window.location.hash).not.toContain('otra');
  });
});
