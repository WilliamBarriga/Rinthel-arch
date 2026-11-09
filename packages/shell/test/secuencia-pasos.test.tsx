import { cleanup, render, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';

import { layoutView } from 'layout';
import { abrirSesion } from 'sesion';
import { VistaInteractiva } from 'shell';
import type { AdaptadorDeLayout } from 'shell';
import { TEMA_NEUTRO } from 'tema';

afterEach(cleanup);

const cuerpo = (vista: string) => `specification { node servicio }
model {
  servicio cliente "Cliente"
  servicio api "API"
  servicio db "DB"
  servicio nuevo "Nuevo"
  interaction i {
    pedir: cliente -> api "pedir"
    note right of api "ojo"
    alt "ok" {
      guardar: api -> db "guardar"
      reply db -> api "listo"
    } else "fallo" {
      api -> db "error"
    }
    crear: create api -> nuevo "crear"
    reply api -> cliente "fin"
  }
}
${vista}
`;
const layout: AdaptadorDeLayout = (vista, tema, medidas) => layoutView(vista, tema, { ...(medidas !== undefined && { medidas }) });

const montar = (vista: string, paso: number) => {
  const fuente = abrirSesion({ 'main.dg': cuerpo(vista) }).fuente!;
  return render(<VistaInteractiva source={fuente} view="v" theme={TEMA_NEUTRO} layout={layout} step={paso} width={1200} height={900} />);
};
const opacidad = (el: Element | null): number => {
  if (el === null) throw new Error('elemento ausente');
  const v = el.getAttribute('opacity') ?? (el as HTMLElement).style?.opacity ?? '';
  return v === '' ? 1 : Number(v);
};
const esperar = (c: HTMLElement) => waitFor(() => expect(c.querySelector('[data-fragment]')).not.toBeNull(), { timeout: 15000 });
const vista = 'view v { type sequence\n interaction i\n steps { step "uno" { upto pedir }\n step "dos" { upto guardar }\n step "tres" { upto crear } } }';

describe('VistaInteractiva: Pasos de secuencia', () => {
  it('Paso 2 (upto guardar): activacion recortada, guarda del segundo operando oculta y Lifeline nacida oculta', async () => {
    const { container: c } = montar(vista, 2);
    await esperar(c);
    // La Geometria es la completa: el Mensaje 'fin' existe pero no se ve.
    expect(opacidad(c.querySelector('[data-message="i:2.0.0"]'))).toBe(1);
    expect(opacidad(c.querySelector('[data-message="i:4"]'))).toBe(0);
    // El marco y la guarda del primer operando aparecen; la del segundo, no.
    expect(opacidad(c.querySelector('[data-fragment-guard="2:0"]'))).toBe(1);
    expect(opacidad(c.querySelector('[data-fragment-guard="2:1"]'))).toBe(0);
    expect(opacidad(c.querySelector('[data-fragment-operator="2"]'))).toBe(1);
    // La Lifeline con 'create' posterior no se ve; las demas, si.
    expect(opacidad(c.querySelector('[data-lifeline="nuevo"]'))).toBe(0);
    expect(opacidad(c.querySelector('[data-lifeline="db"]'))).toBe(1);
    // La activacion de api (de 'pedir' a 'fin') se recorta en la flecha de 'guardar'.
    const activacion = c.querySelector<HTMLElement>('[data-activation="api"]')!;
    const completa = montar(vista, 3);
    await esperar(completa.container);
    const final = completa.container.querySelector<HTMLElement>('[data-activation="api"]')!;
    expect(Number.parseFloat(activacion.style.height)).toBeLessThan(Number.parseFloat(final.style.height));
    // La Nota del primer Mensaje ya aparece.
    expect(opacidad(c.querySelector('[data-note="i:1"]'))).toBe(1);
  });

  it('Paso 3 (upto crear): la Lifeline nacida aparece y la geometria no cambia', async () => {
    const { container: c } = montar(vista, 3);
    await esperar(c);
    expect(opacidad(c.querySelector('[data-lifeline="nuevo"]'))).toBe(1);
    expect(opacidad(c.querySelector('[data-fragment-guard="2:1"]'))).toBe(1);
    expect(opacidad(c.querySelector('[data-message="i:4"]'))).toBe(0);
  });

  it('sin Paso controlado, la Vista entra en su primer Paso (ADR 0009), no vacia', async () => {
    const fuente = abrirSesion({ 'main.dg': cuerpo(vista) }).fuente!;
    const { container: c } = render(<VistaInteractiva source={fuente} view="v" theme={TEMA_NEUTRO} layout={layout} width={1200} height={900} />);
    await esperar(c);
    expect(opacidad(c.querySelector('[data-message="i:0"]'))).toBe(1);
    expect(opacidad(c.querySelector('[data-message="i:2.0.0"]'))).toBe(0);
    expect(c.querySelector('[data-pasos]')?.textContent).toContain('Paso 1 de 3');
  });
});
