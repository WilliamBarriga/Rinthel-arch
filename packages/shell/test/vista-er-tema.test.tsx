import { cleanup, render, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';

import { layoutView } from 'layout';
import { abrirSesion } from 'sesion';
import { VistaInteractiva } from 'shell';

afterEach(cleanup);

const ER = `specification { node tabla }
model {
  tabla orders "Pedidos" {
    id: uuid pk
    customer_id: uuid pk fk
    email: text? uk
  }
  tabla customers "Clientes" {
    id: uuid pk
    name: text
  }
  orders#customer_id "1..*" -> "1" customers#id "pertenece" identifying
}
view tablas { type er  include **  theme t }
`;
const PALETA = `palette { papel "#fefce8"  tinta "#1f2937"  azul "#2563eb"  verde "#16a34a"  rojo "#dc2626"  gris "#e5e7eb" }`;
const tema = (nodo: string, resto = ''): string =>
  `theme t {\n  ${PALETA}\n  node {\n    layer forma rect { radius 6 }\n    layer relleno solid { color papel }\n    layer borde border { color tinta width 1 }\n    slots { title attrs }\n${nodo}\n  }\n${resto}\n}\n`;

const montar = async (dsl: string) => {
  const sesion = abrirSesion({ 'main.dg': ER + dsl });
  const fuente = sesion.fuente!;
  const resultado = render(
    <VistaInteractiva source={fuente} view="tablas" theme={fuente.themes.find((t) => t.name === 't')!} layout={(vista, tema, medidas) => layoutView(vista, tema, { medidas })} width={900} height={600} />,
  );
  await waitFor(() => expect(resultado.container.querySelector('[data-id="orders"]')).not.toBeNull());
  return { ...resultado, sesion };
};

describe('Tema ER en jsdom: zone', () => {
  it('una Capa zone header pinta solo la franja de la cabecera, hasta donde empiezan las filas', async () => {
    const { container } = await montar(tema('    layer cab solid { color azul  zone header }'));

    const zona = container.querySelector('[data-id="orders"] [data-zona="header"]') as HTMLElement;
    const filas = container.querySelector('[data-id="orders"] [data-slot="attrs"]') as HTMLElement;
    expect(zona).not.toBeNull();
    expect(zona.style.top).toBe('0px');
    expect(zona.style.height).toBe(filas.style.top);
    expect(zona.getAttribute('style')).toMatch(/#2563eb|rgb\(37, 99, 235\)/);
    const caja = container.querySelector('[data-id="orders"] .rd-nodo') as HTMLElement;
    expect(container.querySelector('[data-id="orders"] [data-zona="body"]')).toBeNull();
    expect(caja).not.toBeNull();
  });

  it('zone body cubre desde las filas hasta el pie de la tabla', async () => {
    const { container } = await montar(tema('    layer cuerpo solid { color gris  zone body }'));

    const zona = container.querySelector('[data-id="orders"] [data-zona="body"]') as HTMLElement;
    const filas = container.querySelector('[data-id="orders"] [data-slot="attrs"]') as HTMLElement;
    expect(zona.style.top).toBe(filas.style.top);
  });

  it('una Capa sin zone sigue pintando la caja entera, sin elemento de zona', async () => {
    const { container } = await montar(tema(''));

    expect(container.querySelector('[data-zona]')).toBeNull();
  });
});

const FILA = (cuerpo: string): string => tema('', `  row {\n${cuerpo}\n  }`);
const estiloDe = (el: Element): string => el.getAttribute('style') ?? '';
const color = (hex: string, rgb: string): RegExp => new RegExp(`${hex}|${rgb.replace(/[()]/g, '\\$&')}`);

describe('Tema ER en jsdom: bloque row', () => {
  it('cada fila pinta su pila: la base, la de las impares y la de su marca de clave', async () => {
    const { container } = await montar(
      FILA(`    layer fondo solid { color papel }
    alternate { layer fondo { color gris } }
    key pk { layer fondo { color verde } }`),
    );

    const fila = (a: string) => container.querySelector(`[data-attribute="orders#${a}"]`)!;
    expect(estiloDe(fila('id'))).toMatch(color('#16a34a', 'rgb(22, 163, 74)'));
    expect(estiloDe(fila('customer_id'))).toMatch(color('#16a34a', 'rgb(22, 163, 74)'));
    expect(estiloDe(fila('email'))).toMatch(color('#fefce8', 'rgb(254, 252, 232)'));
    expect(estiloDe(container.querySelector('[data-attribute="customers#name"]')!)).toMatch(color('#e5e7eb', 'rgb(229, 231, 235)'));
  });

  it('el separador stripe side bottom de la fila es un elemento dentro de ella', async () => {
    const { container } = await montar(FILA('    layer sep stripe { color tinta  side bottom  width 1 }'));

    expect(container.querySelector('[data-attribute="orders#id"] .rd-franja')).not.toBeNull();
  });

  it('el estilo de name, type y key se aplica a cada texto y a cada chip', async () => {
    const { container } = await montar(FILA('    name { weight 700 }\n    type { color azul }\n    key { fill azul  color papel  radius 4 }'));

    const fila = container.querySelector('[data-attribute="orders#customer_id"]')!;
    expect(fila.textContent).toContain('customer_id: uuid');
    expect(estiloDe(fila.querySelector('[data-fila-texto="name"]')!)).toContain('font-weight: 700');
    expect(estiloDe(fila.querySelector('[data-fila-texto="type"]')!)).toMatch(color('#2563eb', 'rgb(37, 99, 235)'));
    const chip = fila.querySelector('[data-key="pk"]')!;
    expect(estiloDe(chip)).toMatch(color('#2563eb', 'rgb(37, 99, 235)'));
    expect(estiloDe(chip)).toContain('border-radius: 4px');
  });

  it('el alto de fila del Tema es el de cada fila dibujada', async () => {
    const { container } = await montar(FILA('    height 40'));

    expect((container.querySelector('[data-attribute="orders#id"]') as HTMLElement).style.height).toBe('40px');
  });
});

describe('Tema ER en jsdom: marcadores', () => {
  it('el Tema cambia color y tamano del marcador, pero no la forma que fija la cardinalidad', async () => {
    const { container } = await montar(tema('', '  edge { diagram er { end arrow { size 9  color rojo } } }'));

    const marcas = [...container.querySelectorAll('[data-marker]')];
    expect(marcas.map((g) => [g.getAttribute('data-marker'), g.getAttribute('data-shape')])).toEqual([['origen', 'many'], ['fin', 'one']]);
    for (const g of marcas) expect(g.querySelector('path')?.getAttribute('stroke')).toMatch(color('#dc2626', 'rgb(220, 38, 38)'));
  });
});
