import { cleanup, render, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';

import { layoutView } from 'layout';
import { abrirSesion } from 'sesion';
import { VistaInteractiva } from 'shell';
import type { AdaptadorDeLayout } from 'shell';
import { TEMA_NEUTRO } from 'tema';

afterEach(cleanup);

const texto = `specification { node servicio }
model {
  servicio cliente "Cliente"
  servicio sistema "Sistema" {
    servicio api "API"
    servicio db "DB"
  }
  servicio cola "Cola"
  interaction i {
    cliente -> sistema.api "pedir"
    sistema -> sistema "auditar"
    sistema.api -> sistema.db "consultar"
    sistema.db -> cola "evento"
  }
}
view abierta { type sequence
 interaction i }
view cerrada { type sequence
 interaction i
 depth 1 }
`;
const fuente = abrirSesion({ 'main.dg': texto }).fuente!;
const layout: AdaptadorDeLayout = (vista, tema, medidas) => layoutView(vista, tema, { ...(medidas !== undefined && { medidas }) });
const rect = (el: HTMLElement) => {
  // Las cabeceras se posicionan con `transform: translate(x, y)`; el box, con left/top.
  const t = /translate\(([-\d.]+)px,\s*([-\d.]+)px\)/.exec(el.style.transform);
  const x = t === null ? Number.parseFloat(el.style.left) : Number.parseFloat(t[1]!);
  const y = t === null ? Number.parseFloat(el.style.top) : Number.parseFloat(t[2]!);
  return { x1: x, x2: x + Number.parseFloat(el.style.width), y1: y, y2: y + Number.parseFloat(el.style.height) };
};

describe('VistaInteractiva: box de Grupo en secuencia', () => {
  it('el box del Grupo abierto envuelve a sus hijas, y la Lifeline propia del Grupo va primera dentro', { timeout: 15000 }, async () => {
    const { container } = render(<VistaInteractiva source={fuente} view="abierta" theme={TEMA_NEUTRO} layout={layout} width={1200} height={800} />);
    await waitFor(() => expect(container.querySelector('[data-group-box="sistema"]')).not.toBeNull(), { timeout: 8000 });
    const caja = rect(container.querySelector<HTMLElement>('[data-group-box="sistema"]')!);
    const cabecera = (id: string) => rect(container.querySelector<HTMLElement>(`[data-id="${id}"]`)!);
    for (const id of ['sistema', 'sistema.api', 'sistema.db']) {
      const c = cabecera(id);
      expect(c.x1).toBeGreaterThan(caja.x1);
      expect(c.x2).toBeLessThan(caja.x2);
      expect(c.y1).toBeGreaterThan(caja.y1);
      expect(c.y2).toBeLessThan(caja.y2);
    }
    // Fuera del box: el cliente y la cola.
    expect(cabecera('cliente').x2).toBeLessThan(caja.x1);
    expect(cabecera('cola').x1).toBeGreaterThan(caja.x2);
    // La Lifeline del Grupo va la primera dentro del box.
    expect(cabecera('sistema').x1).toBeLessThan(cabecera('sistema.api').x1);
    expect(container.querySelector('[data-group-box="sistema"]')!.textContent).toContain('Sistema');
  });

  it('con el Grupo cerrado no hay box', { timeout: 15000 }, async () => {
    const { container } = render(<VistaInteractiva source={fuente} view="cerrada" theme={TEMA_NEUTRO} layout={layout} width={1200} height={800} />);
    await waitFor(() => expect(container.querySelector('[data-lifeline="sistema"]')).not.toBeNull(), { timeout: 8000 });
    expect(container.querySelector('[data-group-box]')).toBeNull();
  });
});
