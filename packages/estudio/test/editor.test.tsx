// @vitest-environment jsdom
import { completionStatus, startCompletion } from '@codemirror/autocomplete';
import { forEachDiagnostic } from '@codemirror/lint';
import { EditorView } from '@codemirror/view';
import { act, cleanup, fireEvent, screen, waitFor, within } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { DURACION_DEL_AVISO_MS } from '../navegador/editor/panel-de-codigo';
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

describe('editor del DSL frente a escrituras externas', () => {
  it('con el buffer limpio aplica el cambio del disco conservando cursor, seleccion y scroll, y marca las lineas cambiadas', async () => {
    const { posts, envolverFetch } = anotarPosts();
    const { dev } = await montarEstudio({ 'main.dg': DSL }, { envolverFetch });
    const { vista } = await abrirCodigo();
    const desde = vista.state.doc.toString().indexOf('include');
    vista.dispatch({ selection: { anchor: desde, head: desde + 'include'.length } });
    vista.scrollDOM.scrollTop = 40;
    const scroll = vista.scrollDOM.scrollTop;

    dev.editarFuera('main.dg', DSL.replace('specification {', '// del agente\nspecification {').replace('"API"', '"API publica"'));

    await waitFor(() => expect(vista.state.doc.toString()).toContain('"API publica"'));
    expect(vista.state.doc.toString()).toBe(dev.workspace.texto('main.dg'));
    const { from, to } = vista.state.selection.main;
    expect(vista.state.sliceDoc(from, to)).toBe('include');
    expect(vista.scrollDOM.scrollTop).toBe(scroll);
    const marcadas = [...document.querySelectorAll('.cm-line.ui-linea-del-disco')].map((l) => l.textContent);
    expect(marcadas).toEqual(['// del agente', '  servicio api "API publica"']);
    expect(posts).toEqual([]);
    expect(estadoDelGuardado().textContent).toMatch(/^Guardado/);
  });

  it('con el buffer sucio un 409 se mergea con el disco y el guardado se reintenta', async () => {
    const { posts, envolverFetch, soltar } = retenerListados();
    const { dev } = await montarEstudio({ 'main.dg': DSL }, { envolverFetch });
    const { vista } = await abrirCodigo();
    vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] });

    escribir(vista, 'include **', '\n  // mio');
    dev.editarFuera('main.dg', DSL.replace('"API"', '"API publica"'));
    await act(async () => dev.asentado());
    vi.advanceTimersByTime(400);
    vi.useRealTimers();

    const unido = DSL.replace('"API"', '"API publica"').replace('include **', 'include **\n  // mio');
    await waitFor(() => expect(dev.workspace.texto('main.dg')).toBe(unido));
    expect(posts.filter((p) => p.ruta === '/api/edit')).toHaveLength(2);
    await waitFor(() => expect(estadoDelGuardado().textContent).toMatch(/^Guardado/));
    expect(vista.state.doc.toString()).toBe(unido);
    soltar();
  });

  it('si solapa gana el disco y un aviso ofrece recuperar el fragmento perdido hasta que vence', async () => {
    const { envolverFetch } = retenerListados();
    const { dev } = await montarEstudio({ 'main.dg': DSL }, { envolverFetch });
    const { vista } = await abrirCodigo();

    escribir(vista, '"Base de datos', ' (mia)');
    dev.editarFuera('main.dg', DSL.replace('"Base de datos"', '"Postgres"'));
    await act(async () => dev.asentado());
    vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] });
    fireEvent.blur(vista.contentDOM);

    // El 409, la lectura del disco y el reintento son promesas sin temporizadores: basta con vaciar la cola.
    for (let i = 0; i < 50 && screen.queryByRole('alert', { name: 'Escritura externa' }) === null; i++) await act(() => vi.advanceTimersByTimeAsync(0));
    const aviso = screen.getByRole('alert', { name: 'Escritura externa' });
    expect(aviso.textContent).toMatch(/gano el disco en un lugar \(linea 7\)/);
    expect(vista.state.doc.toString()).toBe(DSL.replace('"Base de datos"', '"Postgres"'));
    expect(dev.workspace.texto('main.dg')).toBe(DSL.replace('"Base de datos"', '"Postgres"'));

    act(() => vi.advanceTimersByTime(DURACION_DEL_AVISO_MS - 1));
    expect(screen.queryByRole('alert', { name: 'Escritura externa' })).not.toBeNull();
    act(() => vi.advanceTimersByTime(1));
    expect(screen.queryByRole('alert', { name: 'Escritura externa' })).toBeNull();
  });

  it('recuperar reinserta lo perdido como una edicion propia que se guarda', async () => {
    const { envolverFetch } = retenerListados();
    const { dev } = await montarEstudio({ 'main.dg': DSL }, { envolverFetch });
    const { vista } = await abrirCodigo();

    escribir(vista, '"Base de datos', ' (mia)');
    dev.editarFuera('main.dg', DSL.replace('"Base de datos"', '"Postgres"'));
    await act(async () => dev.asentado());
    fireEvent.blur(vista.contentDOM);
    const aviso = await screen.findByRole('alert', { name: 'Escritura externa' });

    fireEvent.click(within(aviso).getByRole('button', { name: 'Recuperar lo mio' }));
    fireEvent.blur(vista.contentDOM);

    const recuperado = DSL.replace('  servicio db "Base de datos"', '  servicio db "Base de datos (mia)"\n  servicio db "Postgres"');
    expect(vista.state.doc.toString()).toBe(recuperado);
    await waitFor(() => expect(dev.workspace.texto('main.dg')).toBe(recuperado));
    expect(screen.queryByRole('alert', { name: 'Escritura externa' })).toBeNull();
  });

  it('el eco del watcher de un guardado propio se reconoce por hash y no relee ni toca el buffer', async () => {
    const lecturas: string[] = [];
    const { dev } = await montarEstudio(
      { 'main.dg': DSL },
      {
        envolverFetch: (f) => (async (entrada: string | URL | Request, init?: RequestInit) => {
          if (String(entrada).startsWith('/api/archivo/')) lecturas.push(String(entrada));
          return f(entrada, init);
        }) as typeof fetch,
      },
    );
    const { caja, vista } = await abrirCodigo();
    const lineasDelDisco: number[] = [];
    vista.dispatch({ selection: { anchor: 0 } });

    escribir(vista, 'include **', '\n  // mio');
    fireEvent.keyDown(caja, { key: 's', ctrlKey: true });
    await waitFor(() => expect(dev.workspace.texto('main.dg')).toContain('// mio'));
    await act(async () => dev.asentado());
    await waitFor(() => expect(estadoDelGuardado().textContent).toMatch(/^Guardado/));
    await act(async () => new Promise((r) => setTimeout(r, 50)));

    expect(lecturas).toEqual(['/api/archivo/main.dg']);
    for (const l of document.querySelectorAll('.cm-line.ui-linea-del-disco')) lineasDelDisco.push(Number(l.textContent));
    expect(lineasDelDisco).toEqual([]);
    expect(vista.state.doc.toString()).toBe(dev.workspace.texto('main.dg'));
  });
});

/** Anota los POST y retiene las respuestas de `/api/archivos` (el editor no se entera del cambio hasta el 409). */
function retenerListados(): ReturnType<typeof anotarPosts> & { soltar(): void } {
  const anotados = anotarPosts();
  const retenidas: (() => void)[] = [];
  let retener = false;
  return {
    posts: anotados.posts,
    soltar() {
      retener = false;
      for (const r of retenidas.splice(0)) r();
    },
    envolverFetch: (f) => {
      const conPosts = anotados.envolverFetch(f);
      return (async (entrada: string | URL | Request, init?: RequestInit) => {
        if (String(entrada) === '/api/archivos' && retener) await new Promise<void>((r) => retenidas.push(r));
        // El primer listado (al abrir) pasa; desde ahi se retienen.
        if (String(entrada) === '/api/archivos') retener = true;
        return conPosts(entrada, init);
      }) as typeof fetch;
    },
  };
}
