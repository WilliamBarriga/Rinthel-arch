import { cleanup, render, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';

import { layoutView } from 'layout';
import { abrirSesion } from 'sesion';
import { VistaInteractiva } from 'shell';

afterEach(cleanup);

const MODELO = `specification { node servicio }
model {
  servicio cliente "Cliente"
  servicio api "API"
  servicio cola "Cola"
  interaction i {
    cliente -> api "pedir"
    alt "ok" {
      async api -> cola "evento"
      note right of cola "listo"
    } else "falla" {
      reply api -> cliente "error"
    }
    destroy api -> cola
  }
}
view v { type sequence  interaction i  theme t }
`;
const PALETA = `palette { papel "#fefce8"  tinta "#1f2937"  azul "#2563eb"  rojo "#dc2626"  verde "#16a34a"  ambar "#d97706" }`;
const BASE = `  node { layer forma rect  layer relleno solid { color papel }  layer borde border { color tinta }  slots { title } }
  edge { layer linea line { color tinta  width 1 }  end arrow { size 8 } }`;

const montar = async (bloques: string) => {
  const sesion = abrirSesion({ 'main.dg': `${MODELO}theme t {\n  ${PALETA}\n${BASE}\n${bloques}\n}\n` });
  expect((await sesion.diagnosticar()).filter((i) => i.severity === 'error')).toEqual([]);
  const fuente = sesion.fuente!;
  const resultado = render(
    <VistaInteractiva source={fuente} view="v" theme={fuente.themes.find((t) => t.name === 't')!} layout={(vista, tema, medidas) => layoutView(vista, tema, { medidas })} width={1000} height={700} />,
  );
  await waitFor(() => expect(resultado.container.querySelector('[data-message]')).not.toBeNull(), { timeout: 15000 });
  return resultado.container;
};
const trazoDe = (c: HTMLElement, mensaje: string): string => c.querySelector(`[data-message="i:${mensaje}"]`)!.innerHTML;

describe('Vista de secuencia: Temas con elementos explicitos', () => {
  it('message { kind async { ... } } cambia solo el trazo de los Mensajes async', async () => {
    const c = await montar('  message {\n    layer linea line { color tinta  width 1 }\n    end arrow { size 8 }\n    kind async { layer linea { color rojo  width 3 } }\n  }');

    expect(trazoDe(c, '1.0.0')).toMatch(/#dc2626|rgb\(220, 38, 38\)/);
    expect(trazoDe(c, '0')).not.toMatch(/#dc2626|rgb\(220, 38, 38\)/);
  }, 20000);

  it('lifeline { end ... } cambia el marcador de la Lifeline destruida y su trazo', async () => {
    const c = await montar('  lifeline {\n    layer linea line { color verde  width 2  style solid }\n    end arrow { size 14  color rojo }\n  }');

    const html = c.querySelector('[data-lifeline="cola"]')!.innerHTML;
    expect(html).toMatch(/#16a34a|rgb\(22, 163, 74\)/);
    expect(c.querySelector('[data-lifeline="api"]')!.innerHTML).toMatch(/#16a34a|rgb\(22, 163, 74\)/);
  }, 20000);

  it('activation, fragment y note toman su pila del Tema', async () => {
    const c = await montar(`  activation { layer forma rect  layer relleno solid { color azul }  width 14 }
  fragment {
    layer forma rect
    layer relleno solid { color verde/0.1 }
    layer borde border { color verde }
    operator { color ambar  weight 700 }
    guard { color rojo }
    divider { color rojo  width 2 }
    op alt { layer borde { color azul } }
  }
  note { layer relleno solid { color azul/0.3 }  layer borde border { color azul }  text { color rojo } }`);

    const activacion = c.querySelector('[data-activation]') as HTMLElement;
    expect(activacion.getAttribute('style')).toMatch(/#2563eb|rgb\(37, 99, 235\)/);
    expect(activacion.style.width).toBe('14px');
    const marco = c.querySelector('[data-fragment="1"]') as HTMLElement;
    expect(marco.getAttribute('style')).toMatch(/#2563eb|rgb\(37, 99, 235\)/);
    expect(c.querySelector('[data-fragment-operator="1"]')!.getAttribute('fill')).toBe('#d97706');
    expect(c.querySelector('[data-fragment-guard="1:0"]')!.getAttribute('fill')).toBe('#dc2626');
    expect(c.querySelector('[data-fragment-divider="1:1"]')!.getAttribute('style')).toMatch(/2px/);
    const papel = c.querySelector('[data-note] path[data-note-paper]')!;
    expect(papel.getAttribute('stroke')).toBe('#2563eb');
    expect(c.querySelector('[data-note] text')!.getAttribute('fill')).toBe('#dc2626');
  }, 20000);

  it('sin elementos declarados se conserva la derivacion de edge y node', async () => {
    const c = await montar('');

    expect(c.querySelector('[data-note-paper]')!.getAttribute('stroke')).toBe('#9ca3af');
    expect(c.querySelector('[data-message="i:0"]')).not.toBeNull();
  }, 20000);
});
