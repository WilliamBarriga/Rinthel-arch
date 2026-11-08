import { cleanup, render, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';

import { layoutView } from 'layout';
import { abrirSesion } from 'sesion';
import { VistaInteractiva } from 'shell';
import type { AdaptadorDeLayout } from 'shell';
import { TEMA_NEUTRO } from 'tema';

afterEach(cleanup);

const layout: AdaptadorDeLayout = (vista, tema, medidas) => layoutView(vista, tema, { ...(medidas !== undefined && { medidas }) });
const texto = `specification { node servicio }
model {
  servicio a "A"
  servicio b "B"
  interaction i {
    a -> b "uno"
    a -> b "dos"
    a -> b "tres"
    a -> b "cuatro"
    a -> b "cinco"
    a -> b "seis"
  }
}
view v { type sequence
 interaction i }
`;

describe('Secuencia: recorte al viewport', () => {
  it('una Lifeline cuya cabecera quedo fuera de la camara sigue dibujando su linea y su activacion', { timeout: 20000 }, async () => {
    const fuente = abrirSesion({ 'main.dg': texto }).fuente!;
    // Camara por debajo de las cabeceras: la linea y las activaciones se ven, las cabeceras no.
    const { container } = render(<VistaInteractiva source={fuente} view="v" theme={TEMA_NEUTRO} layout={layout} width={600} height={100} camera={{ x: 0, y: 200, width: 600, height: 100 }} />);
    await waitFor(() => expect(container.querySelector('[data-activation]')).not.toBeNull(), { timeout: 15000 });
    expect(container.querySelector('[data-lifeline="a"]')).not.toBeNull();
  });

  it('una Lifeline fuera de la camara no se dibuja y su activacion tampoco rompe el dibujo', { timeout: 20000 }, async () => {
    const fuente = abrirSesion({ 'main.dg': texto }).fuente!;
    const { container } = render(<VistaInteractiva source={fuente} view="v" theme={TEMA_NEUTRO} layout={layout} width={100} height={100} camera={{ x: 0, y: 200, width: 100, height: 100 }} />);
    await waitFor(() => expect(container.querySelector('[data-lifeline="a"]')).not.toBeNull(), { timeout: 15000 });
    expect(container.querySelector('[data-lifeline="b"]')).toBeNull();
  });
});
