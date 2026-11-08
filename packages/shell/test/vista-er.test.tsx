import { cleanup, render, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';

import { idDeArista } from 'canonico';
import { layoutView } from 'layout';
import { abrirSesion } from 'sesion';
import { VistaInteractiva } from 'shell';
import { TEMA_NEUTRO } from 'tema';

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
  tabla items {
    order_id: uuid fk
  }
  orders#customer_id "1..*" -> "1" customers#id "pertenece" identifying
  items#order_id "0..1" -> "0..*" orders#id
}
view tablas { type er  include ** }
view arq { type architecture  include ** }
`;

const montar = async (vista: string) => {
  const fuente = abrirSesion({ 'main.dg': ER }).fuente!;
  const resultado = render(<VistaInteractiva source={fuente} view={vista} theme={TEMA_NEUTRO} layout={(vista, tema, medidas) => layoutView(vista, tema, { medidas })} width={900} height={600} />);
  await waitFor(() => expect(resultado.container.querySelector('[data-id="orders"]')).not.toBeNull());
  return { ...resultado, fuente };
};

const idDe = (fuente: { model: { edges: Parameters<typeof idDeArista>[0][] } }, i: number) => idDeArista(fuente.model.edges[i]!);

describe('Vista ER en jsdom', () => {
  it('cada tabla muestra su cabecera y una fila por Atributo con un chip por marca de clave', async () => {
    const { container } = await montar('tablas');

    const fila = container.querySelector('[data-attribute="orders#customer_id"]')!;
    expect(fila.textContent).toContain('customer_id: uuid');
    expect([...fila.querySelectorAll('[data-key]')].map((chip) => [chip.getAttribute('data-key'), chip.textContent])).toEqual([['pk', 'PK'], ['fk', 'FK']]);
    expect(container.querySelector('[data-attribute="orders#email"]')!.textContent).toContain('email: text?');
    expect(container.querySelector('[data-attribute="customers#name"]')!.querySelector('[data-key]')).toBeNull();
    expect(container.querySelectorAll('[data-id="orders"] [data-attribute]')).toHaveLength(3);
  });

  it('las FK llevan el marcador de su cardinalidad en cada extremo y ninguna flecha', async () => {
    const { container, fuente } = await montar('tablas');

    const formas = (id: string) => [...container.querySelectorAll(`[data-edge="${id}"] [data-marker]`)].map((g) => [g.getAttribute('data-marker'), g.getAttribute('data-shape')]);
    expect(formas(idDe(fuente, 0))).toEqual([['origen', 'many'], ['fin', 'one']]);
    expect(formas(idDe(fuente, 1))).toEqual([['origen', 'zero-one'], ['fin', 'zero-many']]);
  });

  it('la identificante va continua y la no identificante discontinua', async () => {
    const { container, fuente } = await montar('tablas');

    const trazo = (id: string) => container.querySelector(`[data-edge="${id}"] path[data-capa]`)!;
    expect(trazo(idDe(fuente, 0)).getAttribute('stroke-dasharray')).toBeNull();
    expect(trazo(idDe(fuente, 1)).getAttribute('stroke-dasharray')).not.toBeNull();
  });

  it('una Vista de arquitectura no dibuja chips ni cambia el estilo de las Aristas', async () => {
    const { container, fuente } = await montar('arq');

    expect(container.querySelector('[data-key]')).toBeNull();
    expect(container.querySelector('[data-attribute="orders#email"]')!.textContent).toBe('email: text');
    expect([...container.querySelectorAll(`[data-edge="${idDe(fuente, 1)}"] [data-marker]`)].map((g) => g.getAttribute('data-shape'))).not.toContain('zero-many');
  });
});
