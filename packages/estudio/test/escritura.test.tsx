// @vitest-environment jsdom
/**
 * Politica de Escritura ante un rechazo por version (409), en la app montada: toda accion que escribe recarga el
 * estado y avisa. Los eventos `estado` e `historial` se retienen tras montar, asi el estado nuevo solo llega si la
 * pagina lo vuelve a pedir.
 */
import { cleanup, fireEvent, screen, waitFor, within } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';

import { DSL_BASICO, lienzoListo, montarEstudio } from './ayudas-de-ui';
import type { OpcionesDeMontaje } from './ayudas-de-ui';
import type { DevEnMemoria } from '../src/contrato';

afterEach(cleanup);

const DSL = `${DSL_BASICO}
theme oscuro extends neutral {
  tokens { background "#102030" }
}
`;

/** La escritura externa agrega un Nodo: si la Vista se recargo, aparece en el lienzo. */
const conCache = (texto: string): string => texto.replace('  servicio db "Base de datos"\n', '  servicio db "Base de datos"\n  servicio cache "Cache"\n');

/** Retiene `estado` e `historial` mientras `retenidos.activo`. */
function retenerEventos(): { retenidos: { activo: boolean }; envolverEventos: NonNullable<OpcionesDeMontaje['envolverEventos']> } {
  const retenidos = { activo: false };
  return {
    retenidos,
    envolverEventos: (eventos) => (url, alEvento) => eventos(url, (nombre, datos) => {
      if (!(retenidos.activo && (nombre === 'estado' || nombre === 'historial'))) alEvento(nombre, datos);
    }),
  };
}

/** Monta con la Vista `mapa` lista; `antes` prepara el Workspace con `dev` antes de retener los eventos. */
async function montarYEscribirFuera(antes: (dev: DevEnMemoria) => Promise<void> = () => Promise.resolve()) {
  const { retenidos, envolverEventos } = retenerEventos();
  const montado = await montarEstudio({ 'main.dg': DSL }, { hash: '#vista=mapa', envolverEventos });
  await lienzoListo(montado.contenedor, 'mapa');
  await antes(montado.dev);
  await waitFor(() => expect(montado.dev.workspace.texto('main.dg')).toBeDefined());
  retenidos.activo = true;
  montado.dev.editarFuera('main.dg', conCache(montado.dev.workspace.texto('main.dg')!));
  await montado.dev.asentado();
  return montado;
}

async function esperarRecargaYAviso(contenedor: HTMLElement): Promise<void> {
  expect((await screen.findByRole('alert')).textContent).toContain('se recargo la Vista');
  await waitFor(() => expect(contenedor.querySelector('[data-id="cache"]')).not.toBeNull());
}

function gesto(destino: Element | Window, tipo: string, clientX: number, clientY: number): void {
  const evento = new MouseEvent(tipo, { bubbles: true, cancelable: true, clientX, clientY, button: 0, buttons: tipo === 'mouseup' ? 0 : 1 });
  Object.defineProperty(evento, 'view', { value: window });
  fireEvent(destino, evento);
}

describe('Escritura ante un 409', () => {
  it('fijar un Tema recarga la Vista y avisa', async () => {
    const { contenedor } = await montarYEscribirFuera();
    fireEvent.click(await screen.findByRole('tab', { name: 'Temas' }));
    fireEvent.click(within(await screen.findByRole('listbox', { name: 'Temas' })).getByRole('option', { name: 'oscuro' }));

    fireEvent.click(await screen.findByRole('button', { name: 'Fijar oscuro en mapa' }));

    await esperarRecargaYAviso(contenedor);
  });

  it('mover un Nodo recarga la Vista y avisa', async () => {
    const { contenedor } = await montarYEscribirFuera();
    const nodo = contenedor.querySelector('[data-id="api"] [data-part="nodo"]')!;

    gesto(nodo, 'mousedown', 10, 10);
    gesto(window, 'mousemove', 60, 30);
    gesto(window, 'mouseup', 60, 30);

    await esperarRecargaYAviso(contenedor);
  });

  it('deshacer recarga la Vista y avisa', async () => {
    const { contenedor } = await montarYEscribirFuera(async (dev) => {
      await dev.fetch('/api/edit', { method: 'POST', body: JSON.stringify({ tipo: 'mover-pin', vista: 'mapa', nodo: 'api', x: 10, y: 0 }) });
    });

    fireEvent.keyDown(document.body, { key: 'z', ctrlKey: true });

    await esperarRecargaYAviso(contenedor);
  });

  it('saltar en el Historial recarga la Vista y avisa', async () => {
    const { contenedor } = await montarYEscribirFuera(async (dev) => {
      await dev.fetch('/api/edit', { method: 'POST', body: JSON.stringify({ tipo: 'mover-pin', vista: 'mapa', nodo: 'api', x: 10, y: 0 }) });
      fireEvent.click(await screen.findByRole('tab', { name: 'Historial' }));
      const lista = await screen.findByRole('list', { name: 'Historial de cambios' });
      await waitFor(() => expect(within(lista).getAllByRole('listitem')).toHaveLength(2));
    });

    fireEvent.click(within(screen.getByRole('list', { name: 'Historial de cambios' })).getByRole('button', { name: /Inicio/ }));

    await esperarRecargaYAviso(contenedor);
  });

  it('aplicar un fix reintenta sobre el estado recargado y escribe sin avisar', async () => {
    const { retenidos, envolverEventos } = retenerEventos();
    const { dev, contenedor } = await montarEstudio({ 'main.dg': DSL }, { hash: '#vista=mapa', envolverEventos });
    await lienzoListo(contenedor, 'mapa');
    dev.editarFuera('main.dg', DSL.replace('  api -> db "lee"\n', '  api -> dbb "lee"\n'));
    await dev.asentado();
    fireEvent.click(screen.getByRole('tab', { name: 'Issues' }));
    const boton = await screen.findByRole('button', { name: 'Aplicar fix de main.dg:8' });
    retenidos.activo = true;
    dev.editarFuera('main.dg', `// agente\n${dev.workspace.texto('main.dg')!}`);
    await dev.asentado();

    fireEvent.click(boton);

    await waitFor(() => expect(dev.workspace.texto('main.dg')).toBe(`// agente\n${DSL}`));
    expect(screen.queryByRole('alert')).toBeNull();
  });
});
