// @vitest-environment jsdom
import { EditorView } from '@codemirror/view';
import { cleanup, fireEvent, screen, waitFor, within } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';

import { lienzoListo, montarEstudio, pulsarNodo } from './ayudas-de-ui';

afterEach(cleanup);

const DSL = `specification {
  node servicio
}

model {
  servicio api "API" "Puerta de entrada"
  servicio db "Base de datos" "Guarda las cuentas"
  api -> db "lee"
}

view mapa {
  type architecture
  include **
}

view otra {
  type architecture
  include db
}
`;

/** Linea del cursor del editor de `archivo` (la pestana Codigo salta a `archivo:linea`). */
function lineaDelEditor(archivo: string): number | undefined {
  const caja = screen.queryByRole('textbox', { name: `Codigo de ${archivo}` });
  const vista = caja === null ? null : EditorView.findFromDOM(caja);
  return vista === null ? undefined : vista.state.doc.lineAt(vista.state.selection.main.head).number;
}

const teclear = (key: string, o: Record<string, boolean> = {}, destino: Element = document.body) => fireEvent.keyDown(destino, { key, ...o });

describe('atajos de las islas', () => {
  it('Mod+B oculta y recupera la isla izquierda; Mod+J la derecha', async () => {
    await montarEstudio({ 'main.dg': DSL });
    await screen.findByRole('listbox', { name: 'Vistas' });

    teclear('b', { ctrlKey: true });
    expect(screen.queryByRole('listbox', { name: 'Vistas' })).toBeNull();
    expect(screen.getByRole('button', { name: 'Mostrar panel izquierdo' })).toBeTruthy();
    teclear('b', { ctrlKey: true });
    expect(screen.getByRole('listbox', { name: 'Vistas' })).toBeTruthy();

    teclear('j', { ctrlKey: true });
    expect(screen.queryByRole('tablist', { name: 'Panel derecho' })).toBeNull();
    teclear('j', { ctrlKey: true });
    expect(screen.getByRole('tablist', { name: 'Panel derecho' })).toBeTruthy();
  });

  it('los botones de ocultar declaran su atajo', async () => {
    await montarEstudio({ 'main.dg': DSL });

    expect((await screen.findByRole('button', { name: 'Ocultar panel izquierdo' })).getAttribute('aria-keyshortcuts')).toBe('Control+B');
    expect(screen.getByRole('button', { name: 'Ocultar panel derecho' }).getAttribute('aria-keyshortcuts')).toBe('Control+J');
  });
});

describe('deshacer y rehacer por el registro', () => {
  it('Ctrl+Z fuera del texto pide deshacer a `dev` y Ctrl+Y rehacer (con el Historial vacio, avisan)', async () => {
    const { contenedor } = await montarEstudio({ 'main.dg': DSL });
    await lienzoListo(contenedor, 'mapa');

    teclear('z', { ctrlKey: true });
    expect((await screen.findByRole('alert')).textContent).toContain('Nada que deshacer');
    teclear('y', { ctrlKey: true });
    await waitFor(() => expect(screen.getByRole('alert').textContent).toContain('Nada que rehacer'));
  });

  it('en un campo de texto Ctrl+Z es del navegador: no llega a `dev`', async () => {
    await montarEstudio({ 'main.dg': DSL });
    await screen.findByRole('listbox', { name: 'Vistas' });
    const campo = document.createElement('input');
    document.body.append(campo);
    campo.focus();

    teclear('z', { ctrlKey: true }, campo);

    await new Promise((r) => setTimeout(r, 50));
    expect(screen.queryByRole('alert')).toBeNull();
    campo.remove();
  });
});

describe('E abre Codigo', () => {
  it('con un Nodo seleccionado, en su bloque; sin seleccion, en el de la Vista', async () => {
    const { contenedor } = await montarEstudio({ 'main.dg': DSL });
    await lienzoListo(contenedor, 'mapa');

    teclear('e');
    expect(screen.getByRole('tab', { name: 'Codigo' }).getAttribute('aria-selected')).toBe('true');
    await waitFor(() => expect(lineaDelEditor('main.dg')).toBe(11));

    pulsarNodo(contenedor, 'db');
    await waitFor(() => expect(window.location.hash).toContain('s=db'));
    teclear('e');
    await waitFor(() => expect(lineaDelEditor('main.dg')).toBe(7));
  });
});

const buscador = async () => {
  teclear('k', { ctrlKey: true });
  const dialogo = await screen.findByRole('dialog', { name: 'Buscador' });
  return { dialogo, campo: within(dialogo).getByRole('combobox', { name: 'Buscar' }) };
};
const escribir = (campo: HTMLElement, texto: string) => fireEvent.change(campo, { target: { value: texto } });

describe('Buscador', () => {
  it('Mod+K lo abre dentro del nodo de portales del chrome; Escape lo cierra', async () => {
    const { contenedor } = await montarEstudio({ 'main.dg': DSL });
    await screen.findByRole('listbox', { name: 'Vistas' });

    const { dialogo, campo } = await buscador();
    expect(contenedor.querySelector('.ui-chrome .ui-portales')!.contains(dialogo)).toBe(true);
    fireEvent.keyDown(campo, { key: 'Escape' });
    await waitFor(() => expect(screen.queryByRole('dialog', { name: 'Buscador' })).toBeNull());
  });

  it('encuentra Vistas y salta a la elegida', async () => {
    const { contenedor } = await montarEstudio({ 'main.dg': DSL });
    await lienzoListo(contenedor, 'mapa');
    const { dialogo, campo } = await buscador();

    escribir(campo, 'otr');
    fireEvent.click(await within(dialogo).findByRole('option', { name: /^otra/ }));

    await lienzoListo(contenedor, 'otra');
    expect(window.location.hash).toBe('#vista=otra');
    await waitFor(() => expect(screen.queryByRole('dialog', { name: 'Buscador' })).toBeNull());
  });

  it('encuentra Nodos con inspect buscar (con su archivo:linea) y abre su Detalle', async () => {
    const { contenedor } = await montarEstudio({ 'main.dg': DSL });
    await lienzoListo(contenedor, 'mapa');
    const { dialogo, campo } = await buscador();

    escribir(campo, 'base');
    const nodo = await within(dialogo).findByRole('option', { name: /Base de datos/ });
    expect(nodo.textContent).toContain('main.dg:7');
    fireEvent.click(nodo);

    await waitFor(() => expect(window.location.hash).toContain('s=db'));
    const detalle = screen.getByRole('region', { name: 'Detalle' });
    expect(await within(detalle).findByRole('heading', { name: 'Base de datos' })).toBeTruthy();
  });

  it('un Nodo que la Vista activa no muestra lleva a la primera Vista que si y queda seleccionado', async () => {
    const { contenedor } = await montarEstudio({ 'main.dg': DSL });
    await lienzoListo(contenedor, 'mapa');
    const primero = await buscador();
    escribir(primero.campo, 'otr');
    fireEvent.click(await within(primero.dialogo).findByRole('option', { name: /^otra/ }));
    await lienzoListo(contenedor, 'otra');
    await waitFor(() => expect(screen.queryByRole('dialog', { name: 'Buscador' })).toBeNull());
    const { dialogo, campo } = await buscador();

    escribir(campo, 'API');
    fireEvent.click(await within(dialogo).findByRole('option', { name: /^API/ }));

    await lienzoListo(contenedor, 'mapa');
    await waitFor(() => expect(window.location.hash).toContain('s=api'));
    const detalle = screen.getByRole('region', { name: 'Detalle' });
    expect(await within(detalle).findByRole('heading', { name: 'API' })).toBeTruthy();
  });

  it('salta a archivo:linea en Codigo', async () => {
    await montarEstudio({ 'main.dg': DSL });
    await screen.findByRole('listbox', { name: 'Vistas' });
    const { dialogo, campo } = await buscador();

    escribir(campo, 'main.dg:12');
    fireEvent.click(await within(dialogo).findByRole('option', { name: /main\.dg:12/ }));

    expect(screen.getByRole('tab', { name: 'Codigo' }).getAttribute('aria-selected')).toBe('true');
    await waitFor(() => expect(lineaDelEditor('main.dg')).toBe(12));
  });

  it('ejecuta comandos del registro y muestra su atajo', async () => {
    await montarEstudio({ 'main.dg': DSL });
    await screen.findByRole('listbox', { name: 'Vistas' });
    const { dialogo, campo } = await buscador();

    escribir(campo, 'panel izq');
    expect((await within(dialogo).findByRole('option', { name: /panel izquierdo/ })).textContent).toContain('Ctrl+B');
    escribir(campo, 'historial');
    fireEvent.click(await within(dialogo).findByRole('option', { name: /Abrir Historial/ }));

    expect(screen.getByRole('tab', { name: 'Historial' }).getAttribute('aria-selected')).toBe('true');
  });

  it('la pildora de la barra lo abre y anuncia Mod+K', async () => {
    await montarEstudio({ 'main.dg': DSL });
    const pildora = await screen.findByRole('button', { name: 'Buscar' });
    expect(pildora.getAttribute('aria-keyshortcuts')).toBe('Control+K');

    fireEvent.click(pildora);
    expect(await screen.findByRole('dialog', { name: 'Buscador' })).toBeTruthy();
  });
});

describe('ayuda de atajos', () => {
  it('`?` la abre agrupada por ambito con las teclas de la plataforma', async () => {
    await montarEstudio({ 'main.dg': DSL });
    await screen.findByRole('listbox', { name: 'Vistas' });

    teclear('?', { shiftKey: true });
    const ayuda = await screen.findByRole('dialog', { name: 'Atajos de teclado' });
    const global = within(ayuda).getByRole('region', { name: 'Global' });
    expect(within(global).getByText('Deshacer').parentElement!.textContent).toContain('Ctrl+Z');
    expect(within(global).getByText('Rehacer').parentElement!.textContent).toContain('Ctrl+Y');
    expect(within(ayuda).getByRole('region', { name: 'Lienzo' })).toBeTruthy();
  });

  it('en mac las teclas se escriben con Cmd y Ctrl+Y no aparece', async () => {
    await montarEstudio({ 'main.dg': DSL }, { plataforma: 'mac' });
    await screen.findByRole('listbox', { name: 'Vistas' });

    teclear('/', { metaKey: true });
    const ayuda = await screen.findByRole('dialog', { name: 'Atajos de teclado' });
    const rehacer = within(ayuda).getByText('Rehacer').parentElement!.textContent;
    expect(rehacer).toContain('Cmd+Shift+Z');
    expect(rehacer).not.toContain('Ctrl+Y');
  });
});
