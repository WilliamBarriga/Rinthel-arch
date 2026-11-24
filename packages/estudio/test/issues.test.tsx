// @vitest-environment jsdom
import { EditorView } from '@codemirror/view';
import { cleanup, fireEvent, screen, waitFor, within } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';

import { anotarPeticiones, DSL_BASICO, lienzoListo, montarEstudio } from './ayudas-de-ui';
import type { OpcionesDeMontaje } from './ayudas-de-ui';

afterEach(cleanup);

const DSL = DSL_BASICO;

/** Dos Aristas colgantes, cada una con un `fix` de un unico candidato (lineas 8 y 9 de main.dg). */
const COLGANTES = DSL.replace('  api -> db "lee"\n', '  api -> dbb "lee"\n  db -> apii "escribe"\n');

/** Los cuerpos de cada POST a `/api/edit`; `antes` corre antes de reenviarlo al fake (para provocar carreras). */
const anotarEdiciones = (antes?: (n: number) => void) => anotarPeticiones({ ruta: '/api/edit', ...(antes !== undefined && { antes }) });

/** Monta con un Workspace bueno (para tener lienzo), lo rompe por fuera y abre la pestana Issues. */
async function montarConIssues(texto: string, opciones: OpcionesDeMontaje = {}) {
  const montado = await montarEstudio({ 'main.dg': DSL }, opciones);
  await lienzoListo(montado.contenedor, 'mapa');
  montado.dev.editarFuera('main.dg', texto);
  await montado.dev.asentado();
  fireEvent.click(screen.getByRole('tab', { name: 'Issues' }));
  const lista = await screen.findByRole('list', { name: 'Issues' });
  return { ...montado, lista };
}

describe('panel Issues', () => {
  it('el boton de un issue manda su fix por POST /api/edit con la version en que se vio', async () => {
    const { cuerpos, envolverFetch } = anotarEdiciones();
    const { dev, lista } = await montarConIssues(COLGANTES, { envolverFetch });
    await waitFor(() => expect(within(lista).getAllByRole('listitem')).toHaveLength(2));
    const version = (await (await dev.fetch('/api/estado')).json()) as { version: number };

    fireEvent.click(within(lista).getByRole('button', { name: 'Apply fix for main.dg:8' }));

    await waitFor(() => expect(dev.workspace.texto('main.dg')).toContain('  api -> db "lee"\n'));
    expect(cuerpos).toEqual([{ ediciones: [{ file: 'main.dg', range: { start: { line: 8, column: 10 }, end: { line: 8, column: 13 } }, replacement: 'db' }], version: version.version }]);
    await waitFor(() => expect(within(screen.getByRole('list', { name: 'Issues' })).getAllByRole('listitem')).toHaveLength(1));
  });

  it('un issue salta a su archivo:linea en el editor', async () => {
    const { lista } = await montarConIssues(COLGANTES);

    fireEvent.click(await within(lista).findByRole('button', { name: 'main.dg:9' }));

    expect(screen.getByRole('tab', { name: 'Code' }).getAttribute('aria-selected')).toBe('true');
    const caja = await screen.findByRole('textbox', { name: /^Code of main\.dg/ });
    const vista = EditorView.findFromDOM(caja)!;
    await waitFor(() => expect(vista.state.doc.lineAt(vista.state.selection.main.head).number).toBe(9));
  });

  it('el filtro deja solo los issues que coinciden y "Aplicar N fix" cuenta los visibles', async () => {
    const { cuerpos, envolverFetch } = anotarEdiciones();
    const { dev, lista } = await montarConIssues(COLGANTES, { envolverFetch });
    expect(await screen.findByRole('button', { name: 'Apply 2 fix' })).toBeTruthy();

    fireEvent.change(screen.getByRole('searchbox', { name: 'Filter issues' }), { target: { value: 'apii' } });

    expect(within(lista).getAllByRole('listitem').map((li) => within(li).getAllByRole('button')[0]!.textContent)).toEqual(['main.dg:9']);
    fireEvent.click(screen.getByRole('button', { name: 'Apply 1 fix' }));
    await waitFor(() => expect(dev.workspace.texto('main.dg')).toContain('  db -> api "escribe"\n'));
    expect(dev.workspace.texto('main.dg')).toContain('  api -> dbb "lee"\n');
    expect(cuerpos).toEqual([expect.objectContaining({ descripcion: 'Apply 1 fix' })]);
  });

  it('el filtro por severidad oculta los errores y deja "Aplicar 0 fix" deshabilitado', async () => {
    const { lista } = await montarConIssues(COLGANTES);

    fireEvent.change(screen.getByRole('combobox', { name: 'Severity' }), { target: { value: 'warning' } });

    await waitFor(() => expect(within(lista).queryAllByRole('listitem')).toHaveLength(0));
    expect((screen.getByRole('button', { name: 'Apply 0 fix' }) as HTMLButtonElement).disabled).toBe(true);
  });

  it('"Aplicar N fix" manda todos los fix visibles en una peticion con descripcion: una sola entrada del Historial', async () => {
    const { cuerpos, envolverFetch } = anotarEdiciones();
    const { dev } = await montarConIssues(COLGANTES, { envolverFetch });

    fireEvent.click(await screen.findByRole('button', { name: 'Apply 2 fix' }));

    await waitFor(() => expect(dev.workspace.texto('main.dg')).toBe(DSL.replace('  api -> db "lee"\n', '  api -> db "lee"\n  db -> api "escribe"\n')));
    expect(cuerpos).toEqual([{ ediciones: [expect.objectContaining({ replacement: 'db' }), expect.objectContaining({ replacement: 'api' })], version: expect.any(Number), descripcion: 'Apply 2 fix' }]);
    expect(await screen.findByText('No issues.')).toBeTruthy();
    // Un solo deshacer vuelve atras los dos fix.
    await dev.fetch('/api/deshacer', { method: 'POST', body: '{}' });
    expect(dev.workspace.texto('main.dg')).toBe(COLGANTES);
  });

  it.each([
    ['ediciones-solapadas', "Ediciones solapadas en 'main.dg'"],
    ['invalida', 'La edicion introduce un error: x'],
  ])('ante %s no se escribe nada y un aviso da motivo y archivo', async (motivo, mensaje) => {
    const rechazo = new Response(JSON.stringify({ ok: false, motivo, mensaje, file: 'main.dg' }), { status: 422 });
    const { dev } = await montarConIssues(COLGANTES, {
      envolverFetch: (f) => ((entrada: string | URL | Request, init?: RequestInit) => (String(entrada) === '/api/edit' ? Promise.resolve(rechazo) : f(entrada, init))) as typeof fetch,
    });

    fireEvent.click(await screen.findByRole('button', { name: 'Apply 2 fix' }));

    expect((await screen.findByRole('alert')).textContent).toBe(`No fix was applied (${motivo} in main.dg): ${mensaje}`);
    expect(dev.workspace.texto('main.dg')).toBe(COLGANTES);
  });

  it('ante un 409 el panel se recalcula sobre el estado nuevo y reintenta', async () => {
    const fuera: { dev?: Awaited<ReturnType<typeof montarEstudio>>['dev'] } = {};
    // Justo antes de la primera peticion, otro proceso agrega una linea arriba: los rangos vistos quedan viejos.
    const { cuerpos, envolverFetch } = anotarEdiciones((n) => {
      if (n === 1) fuera.dev?.editarFuera('main.dg', `// agente\n${COLGANTES}`);
    });
    const montado = await montarConIssues(COLGANTES, { envolverFetch });
    fuera.dev = montado.dev;

    fireEvent.click(await within(montado.lista).findByRole('button', { name: 'Apply fix for main.dg:8' }));

    await waitFor(() => expect(montado.dev.workspace.texto('main.dg')).toContain('  api -> db "lee"\n'));
    expect(montado.dev.workspace.texto('main.dg')).toMatch(/^\/\/ agente\n/);
    expect(cuerpos).toEqual([
      expect.objectContaining({ ediciones: [expect.objectContaining({ range: expect.objectContaining({ start: { line: 8, column: 10 } }) })] }),
      expect.objectContaining({ ediciones: [expect.objectContaining({ range: expect.objectContaining({ start: { line: 9, column: 10 } }) })] }),
    ]);
  });
});
