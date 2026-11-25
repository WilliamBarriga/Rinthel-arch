// @vitest-environment jsdom
/**
 * "Start here" tour: a fixed script of coachmarks whose stops use the open Workspace's data. The first visit shows
 * only a "1-minute tour" pill, remembered in browser-local state; "View tour" (Finder and `?` help) starts it any time.
 */
import { act, cleanup, fireEvent, screen, waitFor, within } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { DSL_BASICO, lienzoListo, montarEstudio, montarExportado, posicionDe, pulsarNodo } from './ayudas-de-ui';

beforeEach(() => localStorage.clear());
afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

const DSL = `specification {
  node servicio
}

model {
  servicio api "API"
  servicio db "Database"
  api -> db "reads"
}

view mapa {
  type architecture
  include **
  link api -> detalle
  theme oscuro
}

view detalle {
  type flow
  include api
  steps {
    step "Request" { show api }
    step "Answer" { show api }
  }
}

view otro {
  type architecture
  include db
}

theme oscuro extends neutral {
  palette { noche "#102030" }
  tokens { background "#102030" }
}
`;

const tour = (): Promise<HTMLElement> => screen.findByRole('dialog', { name: 'Tour' });
const titulo = (dialogo: HTMLElement): string => within(dialogo).getByRole('heading').textContent ?? '';

/** Walks the whole tour with Next and returns each stop as `title: text`. */
async function recorrer(): Promise<string[]> {
  const dialogo = await tour();
  const paradas: string[] = [];
  for (;;) {
    paradas.push(`${titulo(dialogo)}: ${dialogo.querySelector('p')?.textContent ?? ''}`);
    const fin = within(dialogo).queryByRole('button', { name: 'Done' });
    if (fin !== null) {
      fireEvent.click(fin);
      break;
    }
    fireEvent.click(within(dialogo).getByRole('button', { name: 'Next' }));
  }
  await waitFor(() => expect(screen.queryByRole('dialog', { name: 'Tour' })).toBeNull());
  return paradas;
}

async function abrirDesdeLaPildora(): Promise<void> {
  fireEvent.click(await screen.findByRole('button', { name: '1-minute tour' }));
}

describe('tour pill', () => {
  it('the first visit shows only the pill; using it starts the tour and it never comes back', async () => {
    const { contenedor } = await montarEstudio({ 'main.dg': DSL }, { hash: '#view=mapa' });
    await lienzoListo(contenedor, 'mapa');
    expect(screen.queryByRole('dialog', { name: 'Tour' })).toBeNull();

    await abrirDesdeLaPildora();
    expect(titulo(await tour())).toBe('Your repo as a diagram');
    expect(screen.queryByRole('button', { name: '1-minute tour' })).toBeNull();
    cleanup();

    const segunda = await montarEstudio({ 'main.dg': DSL }, { hash: '#view=mapa' });
    await lienzoListo(segunda.contenedor, 'mapa');
    expect(screen.queryByRole('button', { name: '1-minute tour' })).toBeNull();
  });

  it('dismissing the pill hides it for good', async () => {
    const { contenedor } = await montarEstudio({ 'main.dg': DSL }, { hash: '#view=mapa' });
    await lienzoListo(contenedor, 'mapa');

    fireEvent.click(await screen.findByRole('button', { name: 'Dismiss the tour' }));
    expect(screen.queryByRole('button', { name: '1-minute tour' })).toBeNull();
    expect(screen.queryByRole('dialog', { name: 'Tour' })).toBeNull();
    cleanup();

    const segunda = await montarEstudio({ 'main.dg': DSL }, { hash: '#view=mapa' });
    await lienzoListo(segunda.contenedor, 'mapa');
    expect(screen.queryByRole('button', { name: '1-minute tour' })).toBeNull();
  });

  it('"View tour" in the Finder starts it any time, also after dismissing the pill', async () => {
    const { contenedor } = await montarEstudio({ 'main.dg': DSL }, { hash: '#view=mapa' });
    await lienzoListo(contenedor, 'mapa');
    fireEvent.click(await screen.findByRole('button', { name: 'Dismiss the tour' }));

    fireEvent.keyDown(window, { key: 'k', ctrlKey: true });
    const buscador = await screen.findByRole('dialog', { name: 'Finder' });
    fireEvent.click(within(buscador).getByRole('option', { name: /View tour/ }));
    expect(titulo(await tour())).toBe('Your repo as a diagram');
  });

  it('the ? help offers the tour too', async () => {
    const { contenedor } = await montarEstudio({ 'main.dg': DSL }, { hash: '#view=mapa' });
    await lienzoListo(contenedor, 'mapa');

    fireEvent.keyDown(document.body, { key: '?' });
    const ayuda = await screen.findByRole('dialog', { name: 'Keyboard shortcuts' });
    fireEvent.click(within(ayuda).getByRole('button', { name: 'View tour' }));
    expect(titulo(await tour())).toBe('Your repo as a diagram');
  });
});

describe('tour stops', () => {
  it('use the Workspace data: active View, Views per type, a real Drill-down, Steps, the Theme, Code and Agent', async () => {
    const { contenedor } = await montarEstudio({ 'main.dg': DSL }, { hash: '#view=mapa' });
    await lienzoListo(contenedor, 'mapa');
    await abrirDesdeLaPildora();

    const paradas = await recorrer();
    expect(paradas.map((p) => p.split(':')[0])).toEqual(['Your repo as a diagram', 'Views', 'Drill-down', 'Steps', 'Themes', 'Code', 'Your agent, live']);
    expect(paradas[0]).toContain('mapa (architecture)');
    expect(paradas[1]).toContain('2 architecture and 1 flow');
    expect(paradas[2]).toContain('API has its own View');
    expect(paradas[2]).toContain('detalle');
    expect(paradas[3]).toContain('detalle is told in 2 Steps, starting with "Request"');
    expect(paradas[4]).toContain('oscuro');
    expect(paradas[4]).toContain('Pin');
    expect(paradas[5]).toContain('block of mapa');
  });

  it('the stops move the UI: Drill-down selects the linked Node, Steps leaves Step 1 on, Code opens the editor', async () => {
    const { contenedor } = await montarEstudio({ 'main.dg': DSL }, { hash: '#view=mapa' });
    await lienzoListo(contenedor, 'mapa');
    await abrirDesdeLaPildora();
    const dialogo = await tour();
    // The tour card is a portal outside the island trees; `hidden: true` keeps these queries independent of aria-hidden.
    const siguiente = (): void => void fireEvent.click(within(dialogo).getByRole('button', { name: 'Next' }));

    siguiente();
    siguiente();
    await waitFor(() => expect(window.location.hash).toBe('#s=api'));
    expect(screen.getByRole('tab', { name: 'Details', hidden: true }).getAttribute('aria-selected')).toBe('true');
    siguiente();
    await waitFor(() => expect(window.location.hash).toBe('#view=detalle&t=1'));
    siguiente();
    expect(screen.getByRole('tab', { name: 'Themes', hidden: true }).getAttribute('aria-selected')).toBe('true');
    siguiente();
    await waitFor(() => expect(screen.getByRole('tab', { name: 'Code', hidden: true }).getAttribute('aria-selected')).toBe('true'));

    fireEvent.click(within(dialogo).getByRole('button', { name: 'Back' }));
    expect(titulo(dialogo)).toBe('Themes');
    fireEvent.click(within(dialogo).getByRole('button', { name: 'Skip' }));
    await waitFor(() => expect(screen.queryByRole('dialog', { name: 'Tour' })).toBeNull());
  });

  it('skip the Drill-down stop without links and fall back to generic text', async () => {
    const { contenedor } = await montarEstudio({ 'main.dg': DSL_BASICO }, { hash: '#view=mapa' });
    await lienzoListo(contenedor, 'mapa');
    await abrirDesdeLaPildora();

    const paradas = await recorrer();
    expect(paradas.map((p) => p.split(':')[0])).toEqual(['Your repo as a diagram', 'Views', 'Steps', 'Themes', 'Code', 'Your agent, live']);
    expect(paradas[2]).toContain('Some Views are told in Steps');
  });
});

describe('tour in the export', () => {
  it('shows the pill and replaces Code and Agent with "In your repo"', async () => {
    const { contenedor } = await montarExportado({ 'main.dg': DSL }, { hash: '#view=mapa' });
    await lienzoListo(contenedor, 'mapa');
    await abrirDesdeLaPildora();

    const paradas = await recorrer();
    expect(paradas.map((p) => p.split(':')[0])).toEqual(['Your repo as a diagram', 'Views', 'Drill-down', 'Steps', 'Themes', 'In your repo']);
    expect(paradas[4]).not.toContain('Pin');
    expect(paradas[5]).toContain('npx rinthel-arch scan');
    expect(paradas[5]).toContain('npx rinthel-arch dev --workspace .');
  });
});

describe('tour highlight', () => {
  it('follows the size of its area and the window as they change, without waiting', async () => {
    const avisos: (() => void)[] = [];
    vi.stubGlobal(
      'ResizeObserver',
      class {
        constructor(aviso: () => void) {
          avisos.push(aviso);
        }
        observe(): void {}
        unobserve(): void {}
        disconnect(): void {}
      },
    );
    const { contenedor } = await montarEstudio({ 'main.dg': DSL }, { hash: '#view=mapa' });
    await lienzoListo(contenedor, 'mapa');
    const lienzo = contenedor.querySelector<HTMLElement>('.ui-lienzo')!;
    let caja = { left: 100, top: 50, width: 400, height: 300 };
    lienzo.getBoundingClientRect = () => DOMRect.fromRect({ x: caja.left, y: caja.top, width: caja.width, height: caja.height });

    await abrirDesdeLaPildora();
    await tour();
    const hueco = (): string => {
      const s = document.querySelector<HTMLElement>('.ui-tour-hueco')?.style;
      return s === undefined ? '' : `${s.left} ${s.top} ${s.width} ${s.height}`;
    };
    await waitFor(() => expect(hueco()).toBe('92px 42px 416px 316px'));

    caja = { left: 10, top: 20, width: 200, height: 100 };
    act(() => avisos.forEach((aviso) => aviso()));
    expect(hueco()).toBe('2px 12px 216px 116px');

    caja = { left: 0, top: 0, width: 640, height: 480 };
    act(() => {
      vi.stubGlobal('innerWidth', window.innerWidth + 200);
      window.dispatchEvent(new Event('resize'));
    });
    expect(hueco()).toBe('-8px -8px 656px 496px');
  });
});

/** A real press: pointer down and up, then the click (what Base UI listens to for outside presses). */
function pulsar(elemento: Element): void {
  fireEvent.pointerDown(elemento);
  fireEvent.pointerUp(elemento);
  fireEvent.click(elemento);
}

describe('tour interaction', () => {
  for (const [modo, montar] of [
    ['dev', montarEstudio],
    ['export', montarExportado],
  ] as const) {
    it(`in ${modo}, the highlighted UI takes clicks and the tour stays on its stop; the backdrop does nothing`, async () => {
      const { contenedor } = await montar({ 'main.dg': DSL }, { hash: '#view=mapa' });
      await lienzoListo(contenedor, 'mapa');
      await abrirDesdeLaPildora();
      const dialogo = await tour();
      const siguiente = (): void => void fireEvent.click(within(dialogo).getByRole('button', { name: 'Next' }));
      const sigueEn = (parada: string): void => {
        expect(screen.getByRole('dialog', { name: 'Tour' })).toBe(dialogo);
        expect(titulo(dialogo)).toBe(parada);
      };

      // Stop 1: the canvas takes a press on a Node, which selects it.
      fireEvent.pointerDown(contenedor.querySelector('[data-id="db"]')!);
      pulsarNodo(contenedor, 'db');
      await waitFor(() => expect(window.location.hash).toContain('s=db'));
      sigueEn('Your repo as a diagram');

      // Stop 2: picking a View in the left island.
      siguiente();
      pulsar(within(screen.getByRole('listbox', { name: 'Views', hidden: true })).getByRole('option', { name: /otro/, hidden: true }));
      await waitFor(() => expect(window.location.hash).toContain('view=otro'));
      sigueEn('Views');

      // Stop 3: pressing the linked Node drills into its View.
      siguiente();
      await lienzoListo(contenedor, 'mapa');
      await waitFor(() => expect(posicionDe(contenedor, 'api')).toBeDefined());
      fireEvent.pointerDown(contenedor.querySelector('[data-id="api"]')!);
      pulsarNodo(contenedor, 'api');
      await lienzoListo(contenedor, 'detalle');
      sigueEn('Drill-down');

      // Stop 4: the Step controls go forward.
      siguiente();
      await waitFor(() => expect(window.location.hash).toBe('#view=detalle&t=1'));
      pulsar(screen.getByRole('button', { name: 'Next step', hidden: true }));
      await waitFor(() => expect(window.location.hash).toBe('#view=detalle&t=2'));
      sigueEn('Steps');

      // Stop 5: a Theme from the gallery is previewed.
      siguiente();
      pulsar(within(screen.getByRole('listbox', { name: 'Themes', hidden: true })).getByRole('option', { name: /oscuro/, hidden: true }));
      expect(await screen.findByRole('region', { name: 'Theme oscuro', hidden: true })).toBeTruthy();
      sigueEn('Themes');

      // Whatever the tour lays over the page around its card (the dimmed rest) takes presses that do nothing.
      const capas = [...document.querySelectorAll('.ui-portales *')].filter((e) => !e.contains(dialogo) && !dialogo.contains(e));
      expect(capas.length).toBeGreaterThan(0);
      for (const capa of capas) pulsar(capa);
      sigueEn('Themes');

      // The next stop still works after the UI moved; Escape closes the tour.
      siguiente();
      expect(titulo(dialogo)).toBe(modo === 'dev' ? 'Code' : 'In your repo');
      fireEvent.keyDown(dialogo, { key: 'Escape' });
      await waitFor(() => expect(screen.queryByRole('dialog', { name: 'Tour' })).toBeNull());
    });
  }
});
