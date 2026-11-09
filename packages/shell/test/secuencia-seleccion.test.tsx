import { act, cleanup, fireEvent, render, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';

import { resolveView } from 'canonico';
import { layoutView } from 'layout';
import type { GeometriaSecuencia } from 'layout';
import { abrirSesion } from 'sesion';
import { VistaInteractiva, deserializarEstado } from 'shell';
import type { AdaptadorDeLayout } from 'shell';
import { TEMA_NEUTRO } from 'tema';
import { pulsarEn } from './ayudas';

afterEach(cleanup);

const modelo = `specification { node servicio }
model {
  servicio cliente "Cliente"
  servicio api "API"
  servicio db "DB"
  interaction checkout {
    pedir: cliente -> api "pedir"
    alt "ok" {
      guardar: api -> db "guardar"
      reply db -> api "listo"
    } else "fallo" {
      api -> db "error"
    }
    note right of db "ojo"
    reply api -> cliente "fin"
  }
}
`;
const sinPasos = `${modelo}view v { type sequence\n interaction checkout }\n`;
const conPasos = `${modelo}view v { type sequence\n interaction checkout\n steps { step "uno" { upto pedir }\n step "dos" { upto guardar } } }\n`;
const layout: AdaptadorDeLayout = (vista, tema, medidas) => layoutView(vista, tema, { ...(medidas !== undefined && { medidas }) });

const fuenteDe = (texto: string) => abrirSesion({ 'main.dg': texto }).fuente!;
const geometriaDe = async (texto: string): Promise<GeometriaSecuencia> => (await layoutView(resolveView(fuenteDe(texto), 'v')!, TEMA_NEUTRO)) as GeometriaSecuencia;
const centro = (c: { x: number; y: number; width: number; height: number }) => ({ x: c.x + c.width / 2, y: c.y + c.height / 2 });

/** Punto de la pestana que no cae sobre la linea de ninguna Lifeline (el orden de acierto prefiere la Lifeline). */
const libreEnPestana = (g: GeometriaSecuencia, tab: { x: number; y: number; width: number; height: number }) => {
  for (let x = tab.x + 1; x < tab.x + tab.width; x++) {
    if (Object.values(g.lifelines).every((l) => Math.abs(l.x - x) > 12)) return { x, y: tab.y + tab.height / 2 };
  }
  throw new Error('la pestana cubre una Lifeline entera');
};

async function montar(texto: string, extra: Record<string, unknown> = {}) {
  const ids: string[][] = [];
  const r = render(<VistaInteractiva source={fuenteDe(texto)} view="v" theme={TEMA_NEUTRO} layout={layout} width={1200} height={900} onSelectionChange={(s) => ids.push(s)} {...extra} />);
  await waitFor(() => expect(r.container.querySelector('[data-fragment]')).not.toBeNull(), { timeout: 15000 });
  return { ...r, ids, zona: r.container.querySelector<HTMLElement>('.rd-vista')! };
}
const ultimo = (ids: string[][]) => ids.at(-1);

describe('Secuencia: acierto', () => {
  it('Mensaje por su flecha y por su etiqueta; id = Interaccion:ruta', async () => {
    const g = await geometriaDe(sinPasos);
    const { container, ids } = await montar(sinPasos);
    const flecha = g.messages['0']!.points;
    pulsarEn(container, (flecha[0]!.x + flecha[1]!.x) / 2, flecha[0]!.y);
    expect(ultimo(ids)).toEqual(['checkout:0']);
    const etiqueta = centro(g.messages['1.0.0']!.label!);
    pulsarEn(container, etiqueta.x, etiqueta.y);
    expect(ultimo(ids)).toEqual(['checkout:1.0.0']);
    expect(container.querySelector('[data-message="checkout:1.0.0"] [data-state="seleccionado"]')).not.toBeNull();
  });

  it('Nota; la activacion cae en su Lifeline; el interior de un Fragmento deja pasar el click', async () => {
    const g = await geometriaDe(sinPasos);
    const { container, ids } = await montar(sinPasos);
    const nota = g.notes[0]!;
    pulsarEn(container, ...Object.values(centro(nota)) as [number, number]);
    expect(ultimo(ids)).toEqual(['checkout:2']);
    expect(container.querySelector('[data-note="checkout:2"]')!.getAttribute('data-estados')).toBe('seleccionado');

    const activacion = g.activations.find((a) => a.lifeline === 'api')!;
    pulsarEn(container, activacion.x + activacion.width / 2, activacion.y1 + 2);
    expect(ultimo(ids)).toEqual(['api']);

    // Interior del Fragmento: fuera de Lifelines, Mensajes y Notas, no selecciona nada.
    const marco = g.fragments[0]!;
    const antes = ids.length;
    pulsarEn(container, marco.x + 6, marco.y + marco.height / 2);
    pulsarEn(container, marco.x + marco.width / 2, marco.y + marco.tab.height + 4);
    expect(ids.length).toBe(antes);
    // Pero lo de debajo si: la linea de una Lifeline dentro del marco.
    const linea = g.lifelines['db']!;
    pulsarEn(container, linea.x, marco.y + marco.height / 2);
    expect(ultimo(ids)).toEqual(['db']);
  });

  it('Fragmento por su pestana y por su borde', async () => {
    const g = await geometriaDe(sinPasos);
    const { container, ids } = await montar(sinPasos);
    const marco = g.fragments[0]!;
    const t = libreEnPestana(g, marco.tab);
    pulsarEn(container, t.x, t.y);
    expect(ultimo(ids)).toEqual(['checkout:1']);
    ids.length = 0;
    pulsarEn(container, marco.x + marco.width / 2, marco.y + marco.height);
    expect(ultimo(ids)).toEqual(['checkout:1']);
  });

  it('un hash con checkout:1.0.1 restaura la seleccion del Mensaje', async () => {
    const fuente = fuenteDe(sinPasos);
    expect(deserializarEstado('#p=v&s=checkout:1.0.1', fuente).selected).toBe('checkout:1.0.1');
    expect(deserializarEstado('#p=v&s=otra:1.0.1', fuente).selected).toBeNull();
    const { container } = await montar(sinPasos, { selected: 'checkout:1.0.1' });
    expect(container.querySelector('[data-message="checkout:1.0.1"] [data-state="seleccionado"]')).not.toBeNull();
  });

  it('lo que el Paso no revelo no se selecciona', async () => {
    const g = await geometriaDe(conPasos);
    const { container, ids } = await montar(conPasos, { step: 1 });
    const oculto = g.messages['3']!.points;
    pulsarEn(container, (oculto[0]!.x + oculto[1]!.x) / 2, oculto[0]!.y);
    const nota = centro(g.notes[0]!);
    pulsarEn(container, nota.x, nota.y);
    const marco = libreEnPestana(g, g.fragments[0]!.tab);
    pulsarEn(container, marco.x, marco.y);
    expect(ids).toEqual([]);
    const visible = g.messages['0']!.points;
    pulsarEn(container, (visible[0]!.x + visible[1]!.x) / 2, visible[0]!.y);
    expect(ultimo(ids)).toEqual(['checkout:0']);
  });

  it('dos Lifelines seleccionadas no emiten en-ruta ni atenuado', async () => {
    const { container } = await montar(sinPasos, { selection: ['cliente', 'db'] });
    expect(container.querySelectorAll('[data-state="seleccionado"]').length).toBeGreaterThan(0);
    expect(container.querySelector('[data-state="en-ruta"]')).toBeNull();
    expect(container.querySelector('[data-atenuado]')).toBeNull();
  });
});

describe('Secuencia: teclado', () => {
  // La cabecera espejo del pie repite el Nodo de cada Lifeline: se cuenta cada una una sola vez.
  const conFoco = (c: HTMLElement) => [...new Set([...c.querySelectorAll('[data-state="foco"]')].map((e) => e.closest('[data-id]')?.getAttribute('data-id') ?? e.closest('[data-message]')?.getAttribute('data-message')))];
  const tecla = (zona: HTMLElement, key: string, init: KeyboardEventInit = {}) => act(() => void fireEvent.keyDown(zona, { key, ...init }));

  it('Tab recorre las Lifelines en orden de columna y las flechas laterales saltan a la vecina', async () => {
    const { container, zona } = await montar(sinPasos);
    fireEvent.focus(zona);
    expect(conFoco(container)).toEqual(['cliente']);
    tecla(zona, 'Tab');
    expect(conFoco(container)).toEqual(['api']);
    tecla(zona, 'ArrowRight');
    expect(conFoco(container)).toEqual(['db']);
    tecla(zona, 'ArrowRight');
    expect(conFoco(container)).toEqual(['db']);
    tecla(zona, 'ArrowLeft');
    expect(conFoco(container)).toEqual(['api']);
    tecla(zona, 'Tab', { shiftKey: true });
    expect(conFoco(container)).toEqual(['cliente']);
  });

  it('abajo y arriba recorren los Mensajes en orden temporal; los ocultos por el Paso se saltan', async () => {
    const { container, zona } = await montar(sinPasos);
    fireEvent.focus(zona);
    tecla(zona, 'ArrowDown');
    expect(conFoco(container)).toEqual(['checkout:0']);
    tecla(zona, 'ArrowDown');
    tecla(zona, 'ArrowDown');
    expect(conFoco(container)).toEqual(['checkout:1.0.1']);
    tecla(zona, 'ArrowUp');
    expect(conFoco(container)).toEqual(['checkout:1.0.0']);
    cleanup();

    const paso = await montar(conPasos, { step: 2 });
    fireEvent.focus(paso.zona);
    tecla(paso.zona, 'ArrowDown');
    tecla(paso.zona, 'ArrowDown');
    tecla(paso.zona, 'ArrowDown');
    expect(conFoco(paso.container)).toEqual(['checkout:1.0.0']);
  });
});
