import { cleanup, render, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';

import { layoutView } from 'layout';
import { abrirSesion } from 'sesion';
import { VistaInteractiva } from 'shell';
import type { AdaptadorDeLayout } from 'shell';
import { pulsarNodo } from './ayudas';
import { TEMA_NEUTRO } from 'tema';

afterEach(cleanup);

const texto = `specification { node servicio }
model {
  servicio cliente "Cliente"
  servicio api "API"
  servicio db "DB"
  interaction checkout {
    cliente -> api "pedir"
    api -> db "consultar"
    async api -> db "evento"
    reply db -> api "filas"
    reply api -> cliente "listo"
  }
}
view v { type sequence
 interaction checkout }
`;

const fuente = abrirSesion({ 'main.dg': texto }).fuente!;
const layout: AdaptadorDeLayout = (vista, tema) => layoutView(vista, tema);

describe('VistaInteractiva con una Vista de secuencia', () => {
  it('dibuja las Lifelines, los Mensajes y las activaciones, y distingue reply de sync por el trazo', async () => {
    const { container } = render(<VistaInteractiva source={fuente} view="v" theme={TEMA_NEUTRO} layout={layout} width={800} height={600} />);
    await waitFor(() => expect(container.querySelector('[data-message]')).not.toBeNull());

    // Cabeceras de Lifeline: un Nodo por columna.
    expect([...container.querySelectorAll('.rd-nodos [data-id]')].map((e) => e.getAttribute('data-id'))).toEqual(['cliente', 'api', 'db']);
    expect([...container.querySelectorAll('[data-lifeline]')].map((e) => e.getAttribute('data-lifeline'))).toEqual(['cliente', 'api', 'db']);
    // Mensajes por su identidad (Interaccion:indice), con su tipo.
    const mensajes = [...container.querySelectorAll('[data-message]')];
    expect(mensajes.map((m) => [m.getAttribute('data-message'), m.getAttribute('data-kind')])).toEqual([
      ['checkout:0', 'sync'],
      ['checkout:1', 'sync'],
      ['checkout:2', 'async'],
      ['checkout:3', 'reply'],
      ['checkout:4', 'reply'],
    ]);
    // Activaciones: api (pedir..listo), db (consultar..filas).
    expect([...container.querySelectorAll('[data-activation]')].map((e) => e.getAttribute('data-activation'))).toEqual(['api', 'db']);
    // reply se distingue de sync por el trazo (discontinuo contra continuo en el Tema neutro).
    const trazo = (id: string) => container.querySelector(`[data-message="${id}"] path`)!.getAttribute('stroke-dasharray');
    expect(trazo('checkout:0')).toBeNull();
    expect(trazo('checkout:3')).not.toBeNull();
    // Etiquetas de los Mensajes.
    expect([...container.querySelectorAll('[data-edge-label]')].map((e) => e.textContent)).toContain('consultar');
  });

  it('hace clic en una Lifeline y la selecciona', async () => {
    const seleccion: string[][] = [];
    const { container } = render(<VistaInteractiva source={fuente} view="v" theme={TEMA_NEUTRO} layout={layout} width={800} height={600} onSelectionChange={(ids) => seleccion.push(ids)} />);
    await waitFor(() => expect(container.querySelector('[data-message]')).not.toBeNull());
    pulsarNodo(container, 'api');
    expect(seleccion.at(-1)).toEqual(['api']);
  });
});
