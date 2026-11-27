import { cleanup, render, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';

import { layoutView } from 'layout';
import { openSession } from 'session';
import { VistaInteractiva } from 'shell';
import type { AdaptadorDeLayout } from 'shell';
import { NEUTRAL_THEME, textKey } from 'theme';
import type { TextMeasures, TextToMeasure } from 'theme';

afterEach(cleanup);

const texto = `specification { node servicio }
model {
  servicio cliente "Cliente"
  servicio api "API"
  servicio db "DB"
  interaction i {
    cliente -> api "pedir"
    critical "reintentar hasta tres veces" {
      api -> db "consultar"
    }
    cliente -> api "fin"
  }
}
view v { type sequence
 interaction i }
`;
const fuente = openSession({ 'main.dg': texto }).source!;

describe('VistaInteractiva: Fragmentos de secuencia', () => {
  it('mide la pestana y la guarda (no salen recortadas) y pinta la guarda encima de la activacion', async () => {
    const pedidos: TextToMeasure[] = [];
    // Cada caracter mide 20 px: bastante mas que la estimacion, asi un recorte se notaria.
    const measure = async (textos: TextToMeasure[]): Promise<TextMeasures> => {
      pedidos.push(...textos);
      return { nivel: 'medido', fuentes: {}, anchos: Object.fromEntries(textos.map((t) => [textKey(t.familia, t.tamano, t.texto, t.peso), t.texto.length * 20])) };
    };
    const layout: AdaptadorDeLayout = (vista, tema, medidas) => layoutView(vista, tema, { ...(medidas !== undefined && { measures: medidas }) });
    const { container } = render(<VistaInteractiva source={fuente} view="v" theme={NEUTRAL_THEME} layout={layout} measure={measure} width={1200} height={800} />);
    await waitFor(() => expect(container.querySelector('[data-fragment]')).not.toBeNull(), { timeout: 8000 });

    expect(pedidos.map((t) => t.texto)).toEqual(expect.arrayContaining(['critical', '[reintentar hasta tres veces]']));
    const pestana = container.querySelector<HTMLElement>('[data-fragment-tab="1"]')!;
    expect(Number.parseFloat(pestana.style.width)).toBeGreaterThanOrEqual('critical'.length * 20);
    const marco = container.querySelector<HTMLElement>('[data-fragment="1"]')!;
    expect(Number.parseFloat(marco.style.width)).toBeGreaterThanOrEqual('[reintentar hasta tres veces]'.length * 20);
    expect(marco.getAttribute('data-operator')).toBe('critical');

    const guarda = container.querySelector('[data-fragment-guard="1:0"]')!;
    expect(guarda.textContent).toBe('[reintentar hasta tres veces]');
    const activacion = container.querySelector('[data-activation="db"]')!;
    expect(activacion.compareDocumentPosition(guarda) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    const trazoDeArista = container.querySelector('[data-message="i:0"] path')!.getAttribute('stroke');
    expect(guarda.getAttribute('fill')).toBe(trazoDeArista);
  });
});
