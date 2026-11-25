// @vitest-environment jsdom
import { act, cleanup, fireEvent, screen, waitFor, within } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';

import type { EventoDeActividad } from 'canonico';

import { eventoDeActividad, lineasDeActividad } from '../src/contrato';
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

const ARGS = ['--workspace', '.', '--intent', '{"tipo":"move-pin"}'];
const evento = (pid: number, extra: Partial<EventoDeActividad> = {}): EventoDeActividad => eventoDeActividad(pid, { args: ARGS, ...extra });
const lineas = lineasDeActividad;

const feed = () => screen.getByRole('list', { name: 'Agent activity' });
const ultimaLinea = () => screen.getByRole('button', { name: /^Agent last line/ });
const interruptor = () => screen.getByRole('switch', { name: 'Follow the agent' });

describe('feed del agente', () => {
  it('al abrir muestra los Eventos previos, el mas nuevo arriba, con hora, quien, comando, objetivo y marca; args al expandir', async () => {
    await montarEstudio(
      { 'main.dg': DSL },
      { actividad: lineas(evento(11, { command: 'validate', exitCode: 1, summary: { errors: 2, warnings: 0 } }), evento(12, { agent: 'claude', target: { view: 'otra' } })) },
    );
    fireEvent.click(await screen.findByRole('tab', { name: 'Agent' }));

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
    expect(within(viejo).getByText('2 errors')).toBeTruthy();

    expect(within(nuevo).queryByText(/--intent/)).toBeNull();
    fireEvent.click(within(nuevo).getByRole('button', { name: 'Show args' }));
    expect(within(nuevo).getByText(`diagrams edit --workspace . --intent {"tipo":"move-pin"}`)).toBeTruthy();
  });

  it('el objetivo es clicable y lleva a la Vista que nombra', async () => {
    const { contenedor } = await montarEstudio({ 'main.dg': DSL }, { actividad: lineas(evento(1, { target: { view: 'otra' } })) });
    await lienzoListo(contenedor, 'mapa');
    fireEvent.click(screen.getByRole('tab', { name: 'Agent' }));

    fireEvent.click(await within(feed()).findByRole('button', { name: 'otra' }));

    await lienzoListo(contenedor, 'otra');
    expect(window.location.hash).toBe('#view=otra');
  });
});

describe('ultima linea del agente', () => {
  it('la pildora muestra la ultima linea y cuenta lo nuevo sin seguir al agente; clic abre la pestana Agente y lo da por visto', async () => {
    const { dev } = await montarEstudio({ 'main.dg': DSL }, { actividad: lineas(evento(1)) });
    await waitFor(() => expect(ultimaLinea().getAttribute('aria-label')).toBe('Agent last line: pid 1 edit'));

    act(() => {
      dev.anexarActividad(lineas(evento(2, { agent: 'claude', target: { view: 'otra' } }), evento(3, { agent: 'claude', target: { node: 'db' } })));
    });

    await waitFor(() => expect(ultimaLinea().getAttribute('aria-label')).toBe('Agent last line: claude edit db, 2 unseen'));
    expect(ultimaLinea().textContent).toContain('2');
    expect(window.location.hash).not.toContain('view=otra');

    fireEvent.click(ultimaLinea());
    expect(screen.getByRole('tab', { name: 'Agent' }).getAttribute('aria-selected')).toBe('true');
    expect(ultimaLinea().getAttribute('aria-label')).toBe('Agent last line: claude edit db');
  });
});

describe('seguir al agente', () => {
  it('objetivo.vista navega; objetivo.nodo se queda si la Vista lo contiene o va a la primera que lo contiene; archivos no mueve; las islas no cambian', async () => {
    const { dev, contenedor } = await montarEstudio({ 'main.dg': DSL }, { actividad: lineas(evento(1, { target: { view: 'detalle' } })) });
    await lienzoListo(contenedor, 'mapa');
    fireEvent.click(interruptor());
    expect(interruptor().getAttribute('aria-checked')).toBe('true');
    // Los previos no mueven.
    expect(window.location.hash).not.toContain('view=detalle');
    const derecha = screen.getByRole('tablist', { name: 'Right panel' });
    const activaDerecha = () => within(derecha).getAllByRole('tab').find((t) => t.getAttribute('aria-selected') === 'true')?.textContent;
    expect(activaDerecha()).toBe('Details');

    act(() => dev.anexarActividad(lineas(evento(2, { target: { view: 'otra' } }))));
    await waitFor(() => expect(window.location.hash).toBe('#view=otra'));

    act(() => dev.anexarActividad(lineas(evento(3, { target: { node: 'db' } }))));
    await waitFor(() => expect(window.location.hash).toBe('#view=otra&s=db'));

    act(() => dev.anexarActividad(lineas(evento(4, { target: { node: 'api' } }))));
    // `mapa` es la Vista por defecto: el hash la omite.
    await waitFor(() => expect(window.location.hash).toBe('#s=api'));
    expect(screen.getByRole('option', { name: 'mapa' }).getAttribute('aria-selected')).toBe('true');

    act(() => dev.anexarActividad(lineas(evento(5, { target: { files: ['main.dg'] } }))));
    await waitFor(() => expect(ultimaLinea().getAttribute('aria-label')).toBe('Agent last line: pid 5 edit main.dg'));
    expect(window.location.hash).toBe('#s=api');

    expect(activaDerecha()).toBe('Details');
    expect(screen.getByRole('listbox', { name: 'Views' })).toBeTruthy();
  });

  it('un Nodo que el agente nombra antes de que llegue el estado que lo crea se sigue al llegar ese estado', async () => {
    const { dev, contenedor } = await montarEstudio({ 'main.dg': DSL });
    await lienzoListo(contenedor, 'mapa');
    fireEvent.click(interruptor());

    act(() => dev.anexarActividad(lineas(evento(2, { target: { node: 'cache' } }))));
    act(() => dev.editarFuera('main.dg', DSL.replace('include db', 'include db, cache').replace('servicio db "Base de datos"', 'servicio db "Base de datos"\n  servicio cache "Cache"').replace('include **', 'include api, db')));

    await waitFor(() => expect(window.location.hash).toBe('#view=otra&s=cache'));
  });

  it('el Buscador lo activa y lo desactiva con "Follow the agent: on" y "Follow the agent: off"', async () => {
    await montarEstudio({ 'main.dg': DSL });
    await screen.findByRole('listbox', { name: 'Views' });
    const ejecutar = async (nombre: string) => {
      fireEvent.keyDown(document.body, { key: 'k', ctrlKey: true });
      const dialogo = await screen.findByRole('dialog', { name: 'Finder' });
      fireEvent.change(within(dialogo).getByRole('combobox', { name: 'Search' }), { target: { value: 'follow' } });
      fireEvent.click(await within(dialogo).findByRole('option', { name: new RegExp(nombre) }));
    };

    await ejecutar('Follow the agent: on');
    await waitFor(() => expect(interruptor().getAttribute('aria-checked')).toBe('true'));
    await ejecutar('Follow the agent: off');
    await waitFor(() => expect(interruptor().getAttribute('aria-checked')).toBe('false'));
  });

  it('apagado no mueve el lienzo', async () => {
    const { dev, contenedor } = await montarEstudio({ 'main.dg': DSL });
    await lienzoListo(contenedor, 'mapa');

    act(() => dev.anexarActividad(lineas(evento(2, { target: { view: 'otra' } }))));

    await waitFor(() => expect(ultimaLinea().getAttribute('aria-label')).toContain('1 unseen'));
    expect(window.location.hash).not.toContain('otra');
  });
});
