import { cleanup, render, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';

import { layoutView } from 'layout';
import { abrirSesion } from 'sesion';
import { VistaInteractiva } from 'shell';
import type { AdaptadorDeLayout } from 'shell';
import { TEMA_NEUTRO, claveDeTexto } from 'tema';
import type { MedidasDeTexto, TextoAMedir } from 'tema';

afterEach(cleanup);

const texto = `specification { node servicio }
model {
  servicio cliente "Cliente"
  servicio api "API"
  interaction login { cliente -> api "auth" }
  interaction i {
    cliente -> api "pedir"
    note over cliente, api "sesion abierta con el servidor de identidad"
    ref login
  }
}
view v { type sequence
 interaction i }
`;
const fuente = abrirSesion({ 'main.dg': texto }).fuente!;

describe('VistaInteractiva: Notas y ref de secuencia', () => {
  it('la Nota se ve como papel (esquina doblada, sin cabecera) y no como participante; el ref pinta su titulo', async () => {
    const pedidos: TextoAMedir[] = [];
    const measure = async (textos: TextoAMedir[]): Promise<MedidasDeTexto> => {
      pedidos.push(...textos);
      return { nivel: 'medido', fuentes: {}, anchos: Object.fromEntries(textos.map((t) => [claveDeTexto(t.familia, t.tamano, t.texto, t.peso), t.texto.length * 8])) };
    };
    const layout: AdaptadorDeLayout = (vista, tema, medidas) => layoutView(vista, tema, { ...(medidas !== undefined && { medidas }) });
    const { container } = render(<VistaInteractiva source={fuente} view="v" theme={TEMA_NEUTRO} layout={layout} measure={measure} width={1200} height={800} />);
    await waitFor(() => expect(container.querySelector('[data-note]')).not.toBeNull(), { timeout: 8000 });

    // Las palabras de la Nota y el titulo del ref se pidieron al medidor.
    expect(pedidos.map((t) => t.texto)).toEqual(expect.arrayContaining(['identidad', 'login']));
    const nota = container.querySelector('[data-note="i:1"]')!;
    // Papel: poligono con esquina doblada (un `path` con diagonal) y el texto envuelto en varias lineas.
    expect(nota.querySelector('path[data-note-paper]')!.getAttribute('d')).toMatch(/L/);
    const lineas = [...nota.querySelectorAll('text')].map((t) => t.textContent);
    expect(lineas.length).toBeGreaterThan(1);
    expect(lineas.join(' ')).toBe('sesion abierta con el servidor de identidad');
    // No es participante: solo hay dos Lifelines y dos cabeceras, y la Nota no esta en ninguna.
    expect(container.querySelectorAll('[data-lifeline]')).toHaveLength(2);
    expect(container.querySelectorAll('[data-node-id]').length).toBeLessThanOrEqual(2);
    expect(nota.closest('[data-lifeline]')).toBeNull();
    expect(nota.querySelector('[data-slot]')).toBeNull();
    // El ref es un marco `ref` con el titulo de la Interaccion referida.
    expect(container.querySelector('[data-fragment="2"]')!.getAttribute('data-operator')).toBe('ref');
    expect(container.querySelector('[data-ref-title="2"]')!.textContent).toBe('login');
  });
});
