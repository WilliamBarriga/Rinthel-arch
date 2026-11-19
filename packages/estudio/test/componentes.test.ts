/** Cargador de Componentes de Tema de la pagina, contra un `dev` falso (rutas `/api/codigo`, `/api/confiar`, `/componentes.js`). */
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';

import { cargarComponentes, crearCargadorDeCodigo } from '../navegador/componentes';

/** Bundle CommonJS como el que compila `cli`: devuelve los exports. */
const BUNDLE = `var j = require('react/jsx-runtime');
return { Aurora: function (p) { return j.jsx('i', { 'data-aurora': p.id }); }, ayuda: function () {}, VERSION: 1 };`;

function devFalso({ confiado = false }: { confiado?: boolean } = {}) {
  const estado = { confiado, confirmaciones: 0 };
  const fetch = (async (url: string, init?: RequestInit) => {
    if (url === '/api/codigo') return Response.json({ temaConCodigo: true, componentes: ['Aurora'], confiado: estado.confiado });
    if (url === '/api/confiar' && init?.method === 'POST') {
      estado.confiado = true;
      estado.confirmaciones++;
      return Response.json({ ok: true });
    }
    if (url === '/componentes.js') return estado.confiado ? new Response(BUNDLE) : new Response('', { status: 403 });
    return new Response('', { status: 404 });
  }) as typeof globalThis.fetch;
  return { fetch, estado };
}

describe('cargarComponentes', () => {
  it('registra solo los exports con nombre en mayuscula que son funciones, con el React de la pagina', () => {
    const registro = cargarComponentes(BUNDLE);

    expect(Object.keys(registro)).toEqual(['Aurora']);
    expect(renderToStaticMarkup(createElement(registro['Aurora']!, { id: 'api' } as never))).toBe('<i data-aurora="api"></i>');
  });

  it('un componente que importa otro modulo que React falla al cargar', () => {
    expect(() => cargarComponentes("require('fs'); return {};")).toThrow("no puede importar 'fs'");
  });
});

describe('crearCargadorDeCodigo', () => {
  it('pide confirmacion una vez y no insiste si se rechazo', async () => {
    const dev = devFalso();
    let preguntas = 0;
    const rechaza = crearCargadorDeCodigo({ fetch: dev.fetch, confirmar: () => (preguntas++, false) });

    expect(await rechaza()).toBeUndefined();
    expect(await rechaza()).toBeUndefined();
    expect(preguntas).toBe(1);
    expect(dev.estado.confiado).toBe(false);
  });

  it('al aceptar confirma en dev y registra los componentes; con confianza previa no pregunta', async () => {
    const dev = devFalso();
    const registro = await crearCargadorDeCodigo({ fetch: dev.fetch, confirmar: () => true })();

    expect(Object.keys(registro ?? {})).toEqual(['Aurora']);
    expect(dev.estado.confirmaciones).toBe(1);

    const confiado = devFalso({ confiado: true });
    const sinPreguntar = await crearCargadorDeCodigo({ fetch: confiado.fetch, confirmar: () => { throw new Error('no debia preguntar'); } })();
    expect(Object.keys(sinPreguntar ?? {})).toEqual(['Aurora']);
  });
});
