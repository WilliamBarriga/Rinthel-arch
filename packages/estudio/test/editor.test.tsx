// @vitest-environment jsdom
import { completionStatus, startCompletion } from '@codemirror/autocomplete';
import { forEachDiagnostic } from '@codemirror/lint';
import { EditorView } from '@codemirror/view';
import { act, cleanup, fireEvent, screen, waitFor, within } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { lienzoListo, montarEstudio, pulsarNodo } from './ayudas-de-ui';
import type { OpcionesDeMontaje } from './ayudas-de-ui';

afterEach(() => {
  vi.useRealTimers();
  cleanup();
});

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
`;

/** Anota el cuerpo y la ruta de cada POST que la pagina manda a `dev`. */
function anotarPosts(): { posts: { ruta: string; cuerpo: unknown }[]; envolverFetch: NonNullable<OpcionesDeMontaje['envolverFetch']> } {
  const posts: { ruta: string; cuerpo: unknown }[] = [];
  return {
    posts,
    envolverFetch: (f) => (async (entrada: string | URL | Request, init?: RequestInit) => {
      if (init?.method === 'POST') posts.push({ ruta: String(entrada), cuerpo: JSON.parse(String(init.body)) });
      return f(entrada, init);
    }) as typeof fetch,
  };
}

/** Abre la pestana Codigo y espera el editor de `archivo` con su texto cargado. */
async function abrirCodigo(archivo = 'main.dg'): Promise<{ caja: HTMLElement; vista: EditorView }> {
  await pulsarCodigo();
  return editorDe(archivo);
}

/** El marco se monta de nuevo al llegar la primera Fuente: se espera al lienzo antes de elegir la pestana. */
async function pulsarCodigo(): Promise<void> {
  await waitFor(() => expect(document.querySelector('.rd-vista[data-vista]')).not.toBeNull());
  fireEvent.click(await screen.findByRole('tab', { name: 'Codigo' }));
}

async function editorDe(archivo: string): Promise<{ caja: HTMLElement; vista: EditorView }> {
  const caja = await screen.findByRole('textbox', { name: new RegExp(`^Codigo de ${archivo.replace('.', '\\.')}`) });
  const vista = EditorView.findFromDOM(caja);
  if (vista === null) throw new Error('sin EditorView');
  await waitFor(() => expect(vista.state.doc.length).toBeGreaterThan(0));
  return { caja, vista };
}

const escribir = (vista: EditorView, despuesDe: string, texto: string): void => {
  const desde = vista.state.doc.toString().indexOf(despuesDe) + despuesDe.length;
  vista.dispatch({ changes: { from: desde, insert: texto }, userEvent: 'input.type' });
};

const lineaDelCursor = (vista: EditorView): number => vista.state.doc.lineAt(vista.state.selection.main.head).number;
const estadoDelGuardado = () => screen.getByRole('status', { name: 'Guardado del editor' });

describe('editor del DSL: guardado', () => {
  it('guarda ~400 ms despues de dejar de teclear, solo con los cambios minimos, y el lienzo se actualiza', async () => {
    const { posts, envolverFetch } = anotarPosts();
    const { dev, contenedor } = await montarEstudio({ 'main.dg': DSL }, { envolverFetch });
    await lienzoListo(contenedor, 'mapa');
    const { vista } = await abrirCodigo();

    vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] });
    escribir(vista, 'servicio api "API', ' nueva');
    vi.advanceTimersByTime(399);
    await act(async () => undefined);
    expect(posts).toEqual([]);
    expect(estadoDelGuardado().textContent).toMatch(/Sin guardar/);
    vi.advanceTimersByTime(1);
    vi.useRealTimers();

    await waitFor(() => expect(dev.workspace.texto('main.dg')).toContain('servicio api "API nueva"'));
    expect(posts).toEqual([
      {
        ruta: '/api/edit',
        cuerpo: { ediciones: [{ file: 'main.dg', range: { start: { line: 6, column: 20 }, end: { line: 6, column: 20 } }, replacement: ' nueva' }], version: expect.any(Number), aunqueNoCompile: true },
      },
    ]);
    await waitFor(() => expect(estadoDelGuardado().textContent).toMatch(/^Guardado/));
    expect(await within(screen.getByRole('main', { name: 'Lienzo' })).findByText('API nueva')).toBeTruthy();
  });

  it('Mod+S guarda ya sin el dialogo del navegador; perder el foco tambien guarda', async () => {
    const { dev } = await montarEstudio({ 'main.dg': DSL });
    const { caja, vista } = await abrirCodigo();
    vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] });

    escribir(vista, 'include **', '\n  // uno');
    expect(fireEvent.keyDown(caja, { key: 's', ctrlKey: true })).toBe(false);
    vi.useRealTimers();
    await waitFor(() => expect(dev.workspace.texto('main.dg')).toContain('// uno'));

    vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] });
    escribir(vista, '// uno', '\n  // dos');
    fireEvent.blur(caja);
    vi.useRealTimers();
    await waitFor(() => expect(dev.workspace.texto('main.dg')).toContain('// dos'));
  });

  it('un texto que no compila se guarda igual: el lienzo conserva la ultima Fuente buena y los Gestos quedan deshabilitados con el motivo', async () => {
    const { dev, contenedor } = await montarEstudio({ 'main.dg': DSL });
    await lienzoListo(contenedor, 'mapa');
    const { caja, vista } = await abrirCodigo();

    escribir(vista, '  api -> db "lee"', '\n  fantasma -> api');
    fireEvent.keyDown(caja, { key: 's', ctrlKey: true });

    await waitFor(() => expect(dev.workspace.texto('main.dg')).toContain('fantasma -> api'));
    const motivo = await screen.findByRole('status', { name: 'Gestos' });
    expect(motivo.textContent).toMatch(/Gestos deshabilitados/);
    expect(motivo.textContent).toMatch(/main\.dg:9/);
    expect(contenedor.querySelector('.rd-vista[data-vista="mapa"]')).not.toBeNull();
  });

  it('antes de deshacer en dev se vacia el guardado pendiente', async () => {
    const { posts, envolverFetch } = anotarPosts();
    const { dev } = await montarEstudio({ 'main.dg': DSL }, { envolverFetch });
    const { vista } = await abrirCodigo();
    vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] });

    escribir(vista, 'include **', '\n  // pendiente');
    fireEvent.keyDown(document.body, { key: 'z', ctrlKey: true });
    vi.useRealTimers();

    await waitFor(() => expect(posts.map((p) => p.ruta)).toEqual(['/api/edit', '/api/deshacer']));
    await waitFor(() => expect(dev.workspace.texto('main.dg')).toBe(DSL));
  });
});

describe('editor del DSL: teclas', () => {
  it('Mod+Z dentro del editor usa su propio historial y no toca el Historial de dev', async () => {
    const { posts, envolverFetch } = anotarPosts();
    await montarEstudio({ 'main.dg': DSL }, { envolverFetch });
    const { caja, vista } = await abrirCodigo();
    vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] });

    escribir(vista, 'include **', '\n  // borrame');
    fireEvent.keyDown(caja, { key: 'z', ctrlKey: true });

    expect(vista.state.doc.toString()).toBe(DSL);
    expect(posts.filter((p) => p.ruta === '/api/deshacer')).toEqual([]);
  });

  it('Esc cierra primero el completado y despues vuelve a Vistas', async () => {
    await montarEstudio({ 'main.dg': DSL });
    const { caja, vista } = await abrirCodigo();
    vista.focus();
    vista.dispatch({ selection: { anchor: vista.state.doc.toString().indexOf('include') + 3 } });
    startCompletion(vista);
    await waitFor(() => expect(completionStatus(vista.state)).toBe('active'));

    fireEvent.keyDown(caja, { key: 'Escape' });
    expect(completionStatus(vista.state)).toBeNull();
    expect(screen.getByRole('tab', { name: 'Codigo' }).getAttribute('aria-selected')).toBe('true');

    fireEvent.keyDown(caja, { key: 'Escape' });
    await waitFor(() => expect(screen.getByRole('tab', { name: 'Vistas' }).getAttribute('aria-selected')).toBe('true'));
  });

  it('F12 salta a la definicion de un id, tambien en otro archivo', async () => {
    const [modelo, vistas] = DSL.split('\nview mapa');
    await montarEstudio({ 'main.dg': modelo as string, 'vistas.dg': `view mapa${(vistas as string).replace('include **', 'include db')}` });
    await pulsarCodigo();
    fireEvent.change(await screen.findByRole('combobox', { name: 'Archivo' }), { target: { value: 'vistas.dg' } });
    const { caja, vista } = await editorDe('vistas.dg');

    vista.dispatch({ selection: { anchor: vista.state.doc.toString().indexOf('include db') + 'include d'.length } });
    fireEvent.keyDown(caja, { key: 'F12' });

    const destino = await editorDe('main.dg');
    await waitFor(() => expect(lineaDelCursor(destino.vista)).toBe(7));
  });

  it('E abre Codigo en el bloque del Nodo seleccionado', async () => {
    const { contenedor } = await montarEstudio({ 'main.dg': DSL });
    await lienzoListo(contenedor, 'mapa');
    pulsarNodo(contenedor, 'db');

    fireEvent.keyDown(document.body, { key: 'e' });

    const { vista } = await editorDe('main.dg');
    await waitFor(() => expect(lineaDelCursor(vista)).toBe(7));
  });
});

describe('editor del DSL: issues y solo lectura', () => {
  it('los issues del archivo aparecen en linea desde el estado', async () => {
    // Sin Fuente buena nunca hay lienzo (ni remontaje del marco): la pestana se pulsa directamente.
    await montarEstudio({ 'main.dg': DSL.replace('api -> db "lee"', 'api -> fantasma') });
    fireEvent.click(await screen.findByRole('tab', { name: 'Codigo' }));
    const { vista } = await editorDe('main.dg');

    await waitFor(() => {
      const encontrados: { severity: string; linea: number }[] = [];
      forEachDiagnostic(vista.state, (d) => encontrados.push({ severity: d.severity, linea: vista.state.doc.lineAt(d.from).number }));
      expect(encontrados).toContainEqual({ severity: 'error', linea: 8 });
    });
  });

  it('un archivo de --theme-path se abre en solo lectura', async () => {
    await montarEstudio({ 'main.dg': DSL }, { temas: { 'tema.dg': 'theme claro extends neutral {}\n' } });
    await pulsarCodigo();
    fireEvent.change(await screen.findByRole('combobox', { name: 'Archivo' }), { target: { value: 'tema.dg' } });

    const { caja, vista } = await editorDe('tema.dg');
    expect(caja.getAttribute('aria-label')).toBe('Codigo de tema.dg (solo lectura)');
    expect(vista.state.readOnly).toBe(true);
  });
});
