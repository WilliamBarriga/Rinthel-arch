import { cleanup, render, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';

import { layoutView } from 'layout';
import { abrirSesion } from 'sesion';
import { VistaInteractiva } from 'shell';
import type { AdaptadorDeLayout } from 'shell';

afterEach(cleanup);

const PALETA = `palette { papel "#fefce8"  tinta "#1f2937"  azul "#2563eb"  verde "#16a34a"  rojo "#dc2626"  gris "#e5e7eb" }`;
const NODO = `  node {\n    layer forma rect { radius 6 }\n    layer relleno solid { color papel }\n    layer borde border { color tinta width 1 }\n    slots { title attrs }\n  }`;
const layout: AdaptadorDeLayout = (vista, tema, medidas) => layoutView(vista, tema, { ...(medidas !== undefined && { medidas }) });

const montar = async (texto: string, vista: string, esperar: string, selected: string) => {
  const fuente = abrirSesion({ 'main.dg': texto }).fuente!;
  const r = render(
    <VistaInteractiva source={fuente} view={vista} theme={fuente.themes.find((t) => t.name === 't')!} layout={layout} width={1200} height={900} selected={selected} />,
  );
  await waitFor(() => expect(r.container.querySelector(esperar)).not.toBeNull(), { timeout: 15000 });
  return r;
};

const SECUENCIA = (bloques: string): string => `specification { node servicio }
model {
  servicio cliente "Cliente"
  servicio api "API"
  interaction i {
    alt "ok" {
      pedir: cliente -> api "pedir"
    } else "fallo" {
      api -> cliente "error"
    }
    note right of api "ojo"
  }
}
view v { type sequence  interaction i  theme t }
theme t {
  ${PALETA}
${NODO}
${bloques}
}
`;

describe('Estados del Tema pintados en secuencia', () => {
  it('un Fragmento seleccionado pinta la pila de su state seleccionado', async () => {
    const { container } = await montar(SECUENCIA('  fragment { layer caja solid { color papel }  layer borde border { color tinta width 1 }  state seleccionado { layer caja { color verde } } }'), 'v', '[data-fragment]', 'i:0');

    const marco = container.querySelector('[data-fragment="0"]')!;
    expect(marco.getAttribute('data-estados')).toBe('seleccionado');
    expect(marco.getAttribute('style')).toMatch(/#16a34a|rgb\(22, 163, 74\)/);
  });

  it('un Fragmento sin ese estado se pinta como en reposo', async () => {
    const { container } = await montar(SECUENCIA('  fragment { layer caja solid { color papel }  layer borde border { color tinta width 1 }  state seleccionado { layer caja { color verde } } }'), 'v', '[data-fragment]', 'i:1');

    expect(container.querySelector('[data-fragment="0"]')!.getAttribute('style')).not.toMatch(/#16a34a|rgb\(22, 163, 74\)/);
  });

  it('una Nota seleccionada pinta el relleno de su state seleccionado', async () => {
    const { container } = await montar(SECUENCIA('  note { layer papel solid { color gris }  layer borde border { color tinta width 1 }  state seleccionado { layer papel { color rojo } } }'), 'v', '[data-note]', 'i:1');

    const papel = container.querySelector('[data-note="i:1"] [data-note-paper]')!;
    expect(papel.getAttribute('fill')).toBe('#dc2626');
  });
});

const ER = (fila: string): string => `specification { node tabla }
model {
  tabla orders "Pedidos" {
    id: uuid pk
    email: text? uk
  }
}
view tablas { type er  include **  theme t }
theme t {
  ${PALETA}
${NODO}
  row {
${fila}
  }
}
`;

describe('Estados del Tema pintados en ER', () => {
  it('una fila seleccionada pinta la pila de row state seleccionado; las demas siguen en reposo', async () => {
    const { container, sesion } = await montarEr(ER('    layer fondo solid { color papel }\n    state seleccionado { layer fondo { color verde } }\n    state hover { layer fondo { color azul } }'), 'orders#id');

    const fila = (a: string) => container.querySelector(`[data-attribute="orders#${a}"]`)!.getAttribute('style');
    expect(fila('id')).toMatch(/#16a34a|rgb\(22, 163, 74\)/);
    expect(fila('email')).toMatch(/#fefce8|rgb\(254, 252, 232\)/);
    expect((await sesion.diagnosticar()).filter((i) => i.severity === 'error')).toEqual([]);
  });

  it('el size de row name cambia el tamano pintado del nombre', async () => {
    const { container } = await montarEr(ER('    layer fondo solid { color papel }\n    name { size 1.5 }'), 'orders#id');

    const nombre = container.querySelector('[data-attribute="orders#id"] [data-fila-texto="name"]') as HTMLElement;
    expect(nombre.style.fontSize).toBe('21px');
  });
});

async function montarEr(texto: string, selected: string) {
  const sesion = abrirSesion({ 'main.dg': texto });
  const fuente = sesion.fuente!;
  const r = render(<VistaInteractiva source={fuente} view="tablas" theme={fuente.themes.find((t) => t.name === 't')!} layout={layout} width={900} height={600} selected={selected} />);
  await waitFor(() => expect(r.container.querySelector('[data-id="orders"]')).not.toBeNull(), { timeout: 15000 });
  return { ...r, sesion };
}
