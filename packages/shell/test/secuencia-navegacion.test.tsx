import { act, cleanup, fireEvent, render, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';

import { resolveView } from 'canonico';
import { layoutView } from 'layout';
import type { GeometriaSecuencia } from 'layout';
import { abrirSesion } from 'sesion';
import { VistaInteractiva } from 'shell';
import type { AdaptadorDeLayout } from 'shell';
import { TEMA_NEUTRO } from 'tema';
import { pulsarEn } from './ayudas';

afterEach(cleanup);

const layout: AdaptadorDeLayout = (vista, tema, medidas) => layoutView(vista, tema, { ...(medidas !== undefined && { medidas }) });
const fuenteDe = (texto: string) => abrirSesion({ 'main.dg': texto }).fuente!;
const geometriaDe = async (texto: string, vista: string): Promise<GeometriaSecuencia> => (await layoutView(resolveView(fuenteDe(texto), vista)!, TEMA_NEUTRO)) as GeometriaSecuencia;
const actual = (c: HTMLElement) => c.querySelector('[data-vista]')!.getAttribute('data-vista');
const migas = (c: HTMLElement) => [...c.querySelectorAll('[data-breadcrumbs] [data-crumb]')].map((e) => e.getAttribute('data-crumb'));

async function montar(texto: string, vista: string, esperar: string) {
  const r = render(<VistaInteractiva source={fuenteDe(texto)} defaultView={vista} theme={TEMA_NEUTRO} layout={layout} width={1200} height={900} />);
  await waitFor(() => expect(r.container.querySelector(esperar)).not.toBeNull(), { timeout: 15000 });
  return r;
}

const base = `specification { node servicio }
model {
  servicio a "A"
  servicio b "B"
  interaction login { a -> b "credenciales" }
  interaction compra {
    a -> b "pedir"
    ref login
  }
  interaction ciclo {
    a -> b "uno"
    ref ciclo
  }
}
`;

/** Pulsa la pestana del primer `ref` de la Vista (fuera de la linea de las Lifelines). */
async function pulsarRef(c: HTMLElement, texto: string, vista: string) {
  const g = await geometriaDe(texto, vista);
  const marco = g.fragments.find((m) => m.operator === 'ref')!;
  const y = marco.y + marco.tab.height / 2;
  let x = marco.x + 1;
  while (Object.values(g.lifelines).some((l) => Math.abs(l.x - x) <= 12)) x++;
  pulsarEn(c, x, y);
}

describe('Secuencia: navegacion por ref', () => {
  it('un ref con destino navega a la Vista que proyecta la Interaccion y suma miga', { timeout: 20000 }, async () => {
    const texto = `${base}view compra { type sequence\n interaction compra }\nview login { type sequence\n interaction login }\n`;
    const { container } = await montar(texto, 'compra', '[data-fragment]');
    await pulsarRef(container, texto, 'compra');
    await waitFor(() => expect(actual(container)).toBe('login'), { timeout: 15000 });
    expect(migas(container)).toEqual(['compra', 'login']);
  });

  it('un ref sin Vista destino no hace nada', { timeout: 20000 }, async () => {
    const texto = `${base}view compra { type sequence\n interaction compra }\n`;
    const { container } = await montar(texto, 'compra', '[data-fragment]');
    await pulsarRef(container, texto, 'compra');
    expect(actual(container)).toBe('compra');
    expect(migas(container)).toEqual(['compra']);
  });

  it('un ref a la Interaccion de la Vista actual (ciclo) no hace nada', { timeout: 20000 }, async () => {
    const texto = `${base}view ciclo { type sequence\n interaction ciclo }\n`;
    const { container } = await montar(texto, 'ciclo', '[data-fragment]');
    await pulsarRef(container, texto, 'ciclo');
    expect(actual(container)).toBe('ciclo');
    expect(migas(container)).toEqual(['ciclo']);
  });
});

const grupos = `specification { node servicio }
model {
  servicio cliente "Cliente"
  servicio sistema "Sistema" {
    servicio api "API"
    servicio db "DB"
  }
  servicio cola "Cola"
  interaction i {
    m1: cliente -> sistema.api "pedir con una etiqueta muy larga que fuerza el hueco entre columnas"
    m2: sistema -> cola "notificar"
    m3: sistema.db -> cola "evento"
  }
}
view otra { type architecture
 include ** }
view enlazada { type sequence
 interaction i
 depth 1
 link sistema -> otra }
view cerrada { type sequence
 interaction i
 depth 1
 steps { step "uno" { upto m1 }
 step "dos" { upto m2 }
 step "tres" { upto m3 } } }
`;
const centroDe = (c: { x: number; y: number; width: number; height: number }) => ({ x: c.x + c.width / 2, y: c.y + c.height / 2 });
const camaraX = (c: HTMLElement) => Number(c.querySelector('[data-diagram]')!.getAttribute('data-camara')!.split(' ')[0]);
const xDe = (el: HTMLElement) => {
  const t = /translate\(([-\d.]+)px/.exec(el.style.transform);
  return t === null ? Number.parseFloat(el.style.left) : Number(t[1]);
};

describe('Secuencia: link desde una Lifeline', () => {
  it('pulsar la cabecera de una Lifeline de Grupo con link navega y no se expande', { timeout: 20000 }, async () => {
    const { container } = await montar(grupos, 'enlazada', '[data-lifeline="sistema"]');
    expect(container.querySelector('[data-toggle="sistema"]')).toBeNull();
    const g = await geometriaDe(grupos, 'enlazada');
    const p = centroDe(g.nodes['sistema']!);
    pulsarEn(container, p.x, p.y);
    await waitFor(() => expect(actual(container)).toBe('otra'), { timeout: 15000 });
    expect(migas(container)).toEqual(['enlazada', 'otra']);
  });

  it('Enter con foco en una Lifeline con link navega', { timeout: 20000 }, async () => {
    const texto = grupos.replace('    m1:', '    m0: sistema -> cliente "hola"\n    m1:');
    const { container } = await montar(texto, 'enlazada', '[data-lifeline="sistema"]');
    const zona = container.querySelector<HTMLElement>('.rd-vista')!;
    fireEvent.focus(zona);
    // Tab recorre las Lifelines en orden de columna: la primera es la del Grupo.
    fireEvent.keyDown(zona, { key: 'Enter' });
    await waitFor(() => expect(actual(container)).toBe('otra'), { timeout: 15000 });
  });
});

describe('Secuencia: expandir una Lifeline de Grupo', () => {
  it('conserva el Paso y deja el borde izquierdo del Grupo en la misma posicion de pantalla', { timeout: 30000 }, async () => {
    const r = render(<VistaInteractiva source={fuenteDe(grupos)} defaultView="cerrada" theme={TEMA_NEUTRO} layout={layout} width={1200} height={900} morphMs={0} />);
    const { container } = r;
    await waitFor(() => expect(container.querySelector('[data-toggle="sistema"]')).not.toBeNull(), { timeout: 15000 });
    fireEvent.click(container.querySelector('[data-pasos] [aria-label="Paso siguiente"]')!);
    fireEvent.click(container.querySelector('[data-pasos] [aria-label="Paso siguiente"]')!);
    fireEvent.click(container.querySelector('[data-pasos] [aria-label="Paso siguiente"]')!);
    expect(container.querySelector('[data-pasos]')!.textContent).toContain('Paso 3 de 3');
    const antes = xDe(container.querySelector<HTMLElement>('[data-id="sistema"]')!) - camaraX(container);

    fireEvent.click(container.querySelector('[data-toggle="sistema"]')!);
    await waitFor(() => expect(container.querySelector('[data-group-box="sistema"]')).not.toBeNull(), { timeout: 15000 });
    expect(container.querySelector('[data-pasos]')!.textContent).toContain('Paso 3 de 3');
    const caja = container.querySelector<HTMLElement>('[data-group-box="sistema"]')!;
    const despues = xDe(caja) - camaraX(container);
    expect(despues).toBeCloseTo(antes, 3);
  });

  it('Enter con foco en la Lifeline del Grupo lo expande', { timeout: 30000 }, async () => {
    const texto = grupos.replace('    m1:', '    m0: sistema -> cliente "hola"\n    m1:');
    const { container } = await montar(`${texto}view sinpasos { type sequence\n interaction i\n depth 1 }\n`, 'sinpasos', '[data-toggle="sistema"]');
    const zona = container.querySelector<HTMLElement>('.rd-vista')!;
    fireEvent.focus(zona);
    fireEvent.keyDown(zona, { key: 'Enter' });
    await waitFor(() => expect(container.querySelector('[data-group-box="sistema"]')).not.toBeNull(), { timeout: 15000 });
  });

  it('el morph mueve las cabeceras entre la posicion vieja y la nueva', { timeout: 30000 }, async () => {
    const cuadros: Array<(ahoraMs: number) => void> = [];
    const clock = (cuadro: (ahoraMs: number) => void) => {
      cuadros.push(cuadro);
      return () => {};
    };
    const { container } = render(<VistaInteractiva source={fuenteDe(grupos)} defaultView="cerrada" theme={TEMA_NEUTRO} layout={layout} width={3000} height={900} morphMs={100} clock={clock} />);
    await waitFor(() => expect(container.querySelector('[data-toggle="sistema"]')).not.toBeNull(), { timeout: 15000 });
    const x = (id: string) => xDe(container.querySelector<HTMLElement>(`[data-id="${id}"]`)!);
    const antes = x('cola');
    fireEvent.click(container.querySelector('[data-toggle="sistema"]')!);
    await waitFor(() => expect(cuadros.length).toBeGreaterThan(0), { timeout: 15000 });
    const siguiente = async (ms: number) => act(async () => cuadros.shift()!(ms));
    await siguiente(1000);
    await siguiente(1050);
    const medio = x('cola');
    await siguiente(1200);
    await waitFor(() => expect(container.querySelector('[data-layout]')!.getAttribute('data-layout')).toBe('listo'));
    const despues = x('cola');
    expect(despues).not.toBe(antes);
    expect(Math.min(antes, despues)).toBeLessThan(medio);
    expect(medio).toBeLessThan(Math.max(antes, despues));
  });
});
