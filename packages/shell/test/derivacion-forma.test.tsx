import { cleanup, render, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';

import { layoutView } from 'layout';
import { abrirSesion } from 'sesion';
import { VistaInteractiva } from 'shell';

afterEach(cleanup);

const PALETA = `palette { papel "#fefce8"  tinta "#1f2937"  azul "#2563eb"  rosa "#ec4899"  cian "#22d3ee" }`;
const tema = (forma: string, nodo = ''): string =>
  `theme t {\n  ${PALETA}\n  node {\n    layer forma ${forma}\n    layer relleno gradient { from rosa  to cian  angle 90 }\n    layer borde border { color tinta width 1 }\n    slots { title attrs }\n${nodo}\n  }\n  edge { layer trazo line { color tinta width 1 } }\n}\n`;

const ER = `specification { node tabla }
model {
  tabla orders "Pedidos" {
    id: uuid pk
    email: text? uk
  }
  tabla customers "Clientes" { id: uuid pk }
  orders#id "1..*" -> "1" customers#id "pertenece"
}
view tablas { type er  include **  theme t }
`;
const SEQ = `specification { node servicio }
model {
  servicio cliente "Cliente"
  servicio api "API"
  interaction i {
    cliente -> api "pedir"
    alt "ok" { api -> cliente "respuesta" } else "error" { api -> cliente "fallo" }
  }
}
view v { type sequence  interaction i  theme t }
`;

const montar = async (dsl: string, vista: string, esperar: string) => {
  const sesion = abrirSesion({ "main.dg": dsl });
  if (sesion.fuente === undefined) throw new Error(JSON.stringify(await sesion.diagnosticar()).slice(0, 1500));
  const fuente = sesion.fuente;
  const resultado = render(
    <VistaInteractiva source={fuente} view={vista} theme={fuente.themes.find((t) => t.name === 't')!} layout={(v, t, medidas) => layoutView(v, t, { medidas })} width={900} height={600} />,
  );
  await waitFor(() => expect(resultado.container.querySelector(esperar)).not.toBeNull(), { timeout: 8000 });
  return resultado;
};
const radio = (el: Element): string => getComputedStyle(el).borderRadius;

describe('Derivacion de forma pill/circle (ADR 0009)', () => {
  it('ER: la tabla de un Tema pill se dibuja como rect con radio acotado', async () => {
    const { container } = await montar(ER + tema('pill'), 'tablas', '[data-id="orders"]');
    const caja = container.querySelector('[data-id="orders"] .rd-nodo')!;
    expect(radio(caja)).not.toBe('9999px');
    expect(Number.parseFloat(radio(caja))).toBeLessThanOrEqual(12);
  });

  it('ER: circle tambien deja de ser circulo', async () => {
    const { container } = await montar(ER + tema('circle'), 'tablas', '[data-id="orders"]');
    expect(radio(container.querySelector('[data-id="orders"] .rd-nodo')!)).not.toBe('50%');
  });

  it('ER: el Tema puede devolver la pastilla con node { diagram er { ... } }', async () => {
    const { container } = await montar(ER + tema('rect { radius 6 }', '    diagram er { layer forma pill }'), 'tablas', '[data-id="orders"]');
    expect(radio(container.querySelector('[data-id="orders"] .rd-nodo')!)).toBe('9999px');
  });

  it('secuencia: el Fragmento derivado de un Tema pill es un rect con radio acotado', async () => {
    const { container } = await montar(SEQ + tema('pill'), 'v', '[data-fragment]');
    const marco = container.querySelector('[data-fragment]') as HTMLElement;
    expect(marco.style.borderRadius).not.toBe('9999px');
    expect(Number.parseFloat(marco.style.borderRadius)).toBeLessThanOrEqual(12);
  });

  it('secuencia: el relleno derivado del Fragmento no oculta el contenido (sin degradado opaco)', async () => {
    const { container } = await montar(SEQ + tema('rect { radius 6 }'), 'v', '[data-fragment]');
    const marco = container.querySelector('[data-fragment]') as HTMLElement;
    expect(marco.getAttribute('style')).not.toMatch(/gradient/);
    expect(marco.getAttribute('style')).toMatch(/color-mix|rgba|transparent/);
  });

  it('secuencia: la capa de Fragmentos va por debajo de Mensajes, activaciones y guardas', async () => {
    const { container } = await montar(SEQ + tema('rect { radius 6 }'), 'v', '[data-fragment]');
    const capa = (n: string): Element => container.querySelector(`[data-capa="${n}"]`)!;
    const antes = (a: Element, b: Element): boolean => Boolean(a.compareDocumentPosition(b) & Node.DOCUMENT_POSITION_FOLLOWING);
    for (const sobre of ['lifelines', 'activaciones', 'mensajes', 'guardas']) expect(antes(capa('fragmentos'), capa(sobre))).toBe(true);
  });
});
