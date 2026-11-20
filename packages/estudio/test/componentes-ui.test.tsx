// @vitest-environment jsdom
/**
 * Componentes de Tema y estado SSE en la app montada sobre `devEnMemoria`: la consulta de codigo, la confirmacion de
 * confianza y el bundle pasan por el cliente; una respuesta o un evento `estado` malformados se reportan sin romper la UI.
 */
import { cleanup, screen, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';

import { BUNDLE_DE_PRUEBA, CON_CODIGO } from '../src/contrato';
import { lienzoListo, montarEstudio } from './ayudas-de-ui';

afterEach(cleanup);

const CODIGO = { componentes: ['Aurora'], bundle: BUNDLE_DE_PRUEBA };

/** Reemplaza la respuesta de `ruta` (GET) por `respuesta()`; anota cuantas veces se pidio. */
function reemplazar(ruta: string, respuesta: () => Response) {
  const pedidas = { n: 0 };
  return {
    pedidas,
    envolverFetch: (f: typeof fetch) =>
      (async (entrada: string | URL | Request, init?: RequestInit) => {
        if (String(entrada) !== ruta) return f(entrada, init);
        pedidas.n++;
        return respuesta();
      }) as typeof fetch,
  };
}

describe('Componentes de Tema en la app', () => {
  it('al confirmar, dev confia y el lienzo dibuja el Componente; ya no vuelve a preguntar', async () => {
    const preguntas: string[] = [];
    const { dev, contenedor } = await montarEstudio({ 'main.dg': CON_CODIGO }, { codigo: CODIGO, confirmar: (m) => (preguntas.push(m), true) });

    await waitFor(() => expect(contenedor.querySelector('[data-aurora="api"]')).not.toBeNull());
    expect(preguntas).toHaveLength(1);
    expect(preguntas[0]).toContain('Aurora');
    expect(await (await dev.fetch('/api/codigo')).json()).toMatchObject({ confiado: true });

    dev.editarFuera('main.dg', CON_CODIGO.replace('"API"', '"API nueva"'));
    await dev.asentado();
    await waitFor(() => expect(contenedor.querySelector('[data-aurora="api"]')?.closest('[data-id="api"]')?.textContent).toContain('API nueva'));
    expect(preguntas).toHaveLength(1);
  });

  it('al rechazar no se confia ni se pide el bundle, y no vuelve a preguntar tras otro estado', async () => {
    let preguntas = 0;
    const bundle = reemplazar('/componentes.js', () => new Response('', { status: 500 }));
    const { dev, contenedor } = await montarEstudio({ 'main.dg': CON_CODIGO }, { codigo: CODIGO, confirmar: () => (preguntas++, false), envolverFetch: bundle.envolverFetch });
    await lienzoListo(contenedor, 'general');
    await waitFor(() => expect(preguntas).toBe(1));

    dev.editarFuera('main.dg', CON_CODIGO.replace('"API"', '"API nueva"'));
    await dev.asentado();
    await waitFor(() => expect(contenedor.querySelector('[data-id="api"]')?.textContent).toContain('API nueva'));

    expect(preguntas).toBe(1);
    expect(bundle.pedidas.n).toBe(0);
    expect(contenedor.querySelector('[data-aurora]')).toBeNull();
    expect(await (await dev.fetch('/api/codigo')).json()).toMatchObject({ confiado: false });
  });

  it('una respuesta malformada de /api/codigo se avisa como fallo, sin preguntar', async () => {
    let preguntas = 0;
    const codigo = reemplazar('/api/codigo', () => Response.json({ temaConCodigo: 'si' }));
    const { contenedor } = await montarEstudio({ 'main.dg': CON_CODIGO }, { codigo: CODIGO, confirmar: () => (preguntas++, true), envolverFetch: codigo.envolverFetch });

    expect((await screen.findByRole('alert')).textContent).toContain('No se pudieron cargar los Componentes de Tema');
    await lienzoListo(contenedor, 'general');
    expect(preguntas).toBe(0);
    expect(contenedor.querySelector('[data-aurora]')).toBeNull();
  });

  it('un bundle que importa otro modulo que React se avisa como fallo', async () => {
    const { contenedor } = await montarEstudio({ 'main.dg': CON_CODIGO }, { codigo: { componentes: ['Aurora'], bundle: "require('fs'); return {};" }, confirmar: () => true });

    expect((await screen.findByRole('alert')).textContent).toContain("no puede importar 'fs'");
    await lienzoListo(contenedor, 'general');
    expect(contenedor.querySelector('[data-aurora]')).toBeNull();
  });
});

describe('evento estado malformado', () => {
  it('no reemplaza el estado vigente, se avisa, y el siguiente estado valido se aplica', async () => {
    const inyectar: { enviar?: (nombre: string, datos: string) => void } = {};
    const { dev, contenedor } = await montarEstudio(
      { 'main.dg': CON_CODIGO },
      {
        envolverEventos: (eventos) => (url, alEvento) => {
          inyectar.enviar = alEvento;
          return eventos(url, alEvento);
        },
      },
    );
    await lienzoListo(contenedor, 'general');

    // Con una `version` enorme: si se aceptara, los estados reales siguientes se descartarian por viejos.
    inyectar.enviar?.('estado', JSON.stringify({ version: 999_999, vistas: 'general' }));
    expect((await screen.findByRole('alert')).textContent).toContain('estado malformado');
    expect(contenedor.querySelector('[data-id="api"]')?.textContent).toContain('API');

    dev.editarFuera('main.dg', CON_CODIGO.replace('"API"', '"API nueva"'));
    await dev.asentado();
    await waitFor(() => expect(contenedor.querySelector('[data-id="api"]')?.textContent).toContain('API nueva'));
  });
});
