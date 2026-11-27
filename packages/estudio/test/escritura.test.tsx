// @vitest-environment jsdom
/**
 * Politica de Escritura ante un rechazo por version (409), en la app montada: toda accion que escribe (fijar Tema,
 * mover, ordenar, deshacer, rehacer, saltar) recarga el estado y avisa; aplicar un fix reintenta una vez. Los eventos `estado` e `historial` se retienen tras montar, asi el estado nuevo solo llega si la
 * pagina lo vuelve a pedir.
 */
import { cleanup, fireEvent, screen, waitFor, within } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';

import { DSL_BASICO, lienzoListo, montarEstudio, posicionDe } from './ayudas-de-ui';
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
  const montado = await montarEstudio({ 'main.dg': DSL }, { hash: '#view=mapa', envolverEventos });
  await lienzoListo(montado.contenedor, 'mapa');
  await antes(montado.dev);
  await waitFor(() => expect(montado.dev.workspace.text('main.dg')).toBeDefined());
  retenidos.activo = true;
  montado.dev.editarFuera('main.dg', conCache(montado.dev.workspace.text('main.dg')!));
  await montado.dev.asentado();
  return montado;
}

async function esperarRecargaYAviso(contenedor: HTMLElement): Promise<void> {
  expect((await screen.findByRole('alert')).textContent).toContain('the View was reloaded');
  await waitFor(() => expect(contenedor.querySelector('[data-id="cache"]')).not.toBeNull());
}

const DSL_SECUENCIA = `specification {
  node servicio
}

model {
  servicio api "API"
  servicio db "Base de datos"
  interaction i {
    api -> db "lee"
  }
}

view sec {
  type sequence
  interaction i
}
`;

/** La escritura externa agrega la Lifeline `cache` a la Interaccion. */
const conCacheEnSecuencia = (texto: string): string => conCache(texto).replace('    api -> db "lee"\n', '    api -> db "lee"\n    db -> cache "guarda"\n');

/** Arrastra la cabecera de la Lifeline `id` hasta pasar el centro de `hasta`, en pantalla segun la camara dibujada. */
function arrastrarCabecera(contenedor: HTMLElement, id: string, hasta: string): void {
  const dibujo = contenedor.querySelector<HTMLElement>('[data-diagram]')!;
  const [vx, vy, vw] = dibujo.getAttribute('data-camara')!.split(' ').map(Number) as [number, number, number];
  const k = Number.parseFloat(dibujo.style.width) / vw;
  const centro = (de: string): [number, number] => {
    const caja = contenedor.querySelector<HTMLElement>(`[data-id="${de}"]`)!;
    const [x, y] = posicionDe(contenedor, de)!;
    return [(x + Number.parseFloat(caja.style.width) / 2 - vx) * k, (y + Number.parseFloat(caja.style.height) / 2 - vy) * k];
  };
  const [x, y] = centro(id);
  const destino = centro(hasta)[0] + 20;
  gesto(contenedor.querySelector(`[data-id="${id}"]`)!, 'mousedown', x, y);
  gesto(window, 'mousemove', (x + destino) / 2, y);
  gesto(window, 'mousemove', destino, y);
  gesto(window, 'mouseup', destino, y);
}

function gesto(destino: Element | Window, tipo: string, clientX: number, clientY: number): void {
  const evento = new MouseEvent(tipo, { bubbles: true, cancelable: true, clientX, clientY, button: 0, buttons: tipo === 'mouseup' ? 0 : 1 });
  Object.defineProperty(evento, 'view', { value: window });
  fireEvent(destino, evento);
}

describe('Escritura ante un 409', () => {
  it('fijar un Tema recarga la Vista y avisa', async () => {
    const { contenedor } = await montarYEscribirFuera();
    fireEvent.click(await screen.findByRole('tab', { name: 'Themes' }));
    fireEvent.click(within(await screen.findByRole('listbox', { name: 'Themes' })).getByRole('option', { name: 'oscuro' }));

    fireEvent.click(await screen.findByRole('button', { name: 'Pin oscuro to mapa' }));

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
      await dev.fetch('/api/edit', { method: 'POST', body: JSON.stringify({ type: 'move-pin', view: 'mapa', node: 'api', x: 10, y: 0 }) });
    });

    fireEvent.keyDown(document.body, { key: 'z', ctrlKey: true });

    await esperarRecargaYAviso(contenedor);
  });

  it('rehacer recarga la Vista y avisa', async () => {
    const { contenedor } = await montarYEscribirFuera(async (dev) => {
      await dev.fetch('/api/edit', { method: 'POST', body: JSON.stringify({ type: 'move-pin', view: 'mapa', node: 'api', x: 10, y: 0 }) });
      await dev.fetch('/api/deshacer', { method: 'POST', body: '{}' });
    });

    fireEvent.keyDown(document.body, { key: 'z', ctrlKey: true, shiftKey: true });

    await esperarRecargaYAviso(contenedor);
  });

  it('ordenar las Lifelines recarga la Vista y avisa', async () => {
    const { retenidos, envolverEventos } = retenerEventos();
    const { dev, contenedor } = await montarEstudio({ 'main.dg': DSL_SECUENCIA }, { hash: '#view=sec', envolverEventos });
    await waitFor(() => expect(contenedor.querySelector('.rd-vista[data-layout="listo"] [data-lifeline="db"]')).not.toBeNull(), { timeout: 15000 });
    retenidos.activo = true;
    dev.editarFuera('main.dg', conCacheEnSecuencia(dev.workspace.text('main.dg')!));
    await dev.asentado();

    arrastrarCabecera(contenedor, 'api', 'db');

    await esperarRecargaYAviso(contenedor);
  });

  it('saltar en el Historial recarga la Vista y avisa', async () => {
    const { contenedor } = await montarYEscribirFuera(async (dev) => {
      await dev.fetch('/api/edit', { method: 'POST', body: JSON.stringify({ type: 'move-pin', view: 'mapa', node: 'api', x: 10, y: 0 }) });
      fireEvent.click(await screen.findByRole('tab', { name: 'Undo history' }));
      const lista = await screen.findByRole('list', { name: 'Change history' });
      await waitFor(() => expect(within(lista).getAllByRole('listitem')).toHaveLength(2));
    });

    fireEvent.click(within(screen.getByRole('list', { name: 'Change history' })).getByRole('button', { name: /Start/ }));

    await esperarRecargaYAviso(contenedor);
  });

  // Excepcion a "recarga y avisa" (#203): aplicar un fix conserva su reintento. Recarga, rearma la edicion sobre el
  // estado nuevo y, si el reintento escribe, no hay aviso porque la accion se cumplio.
  it('aplicar un fix reintenta sobre el estado recargado y escribe sin avisar', async () => {
    const { retenidos, envolverEventos } = retenerEventos();
    const { dev, contenedor } = await montarEstudio({ 'main.dg': DSL }, { hash: '#view=mapa', envolverEventos });
    await lienzoListo(contenedor, 'mapa');
    dev.editarFuera('main.dg', DSL.replace('  api -> db "lee"\n', '  api -> dbb "lee"\n'));
    await dev.asentado();
    fireEvent.click(screen.getByRole('tab', { name: 'Issues' }));
    const boton = await screen.findByRole('button', { name: 'Apply fix for main.dg:8' });
    retenidos.activo = true;
    dev.editarFuera('main.dg', `// agente\n${dev.workspace.text('main.dg')!}`);
    await dev.asentado();

    fireEvent.click(boton);

    await waitFor(() => expect(dev.workspace.text('main.dg')).toBe(`// agente\n${DSL}`));
    expect(screen.queryByRole('alert')).toBeNull();
  });
});
