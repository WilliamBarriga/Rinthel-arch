import { describe, expect, it } from 'vitest';

import { abrirSesion } from 'sesion';

const sesion = () =>
  abrirSesion({
    'main.dg': 'specification { node servicio  node db }\nmodel {\n  servicio api\n  db cola\n  api -> cola "publica"\n}\n',
    'vistas.dg': 'view v {\n  type architecture\n  include **\n}\n',
  });

describe('Sesion.consultar', () => {
  it('da el detalle de un Nodo con su archivo:linea, Aristas y Vistas', () => {
    const r = sesion().consultar({ comando: 'node', argumento: 'api' });
    if (r === undefined || !('salida' in r) || r.salida.command !== 'node') throw new Error('sin salida de nodo');
    expect(r.salida.node).toMatchObject({ id: 'api', type: 'servicio', file: 'main.dg', line: 3 });
    expect(r.salida.edges).toMatchObject([{ from: 'api', to: 'cola', direction: 'out', label: 'publica', file: 'main.dg', line: 5 }]);
    expect(r.salida.views).toMatchObject([{ id: 'v', file: 'vistas.dg', line: 1 }]);
  });

  it('busca por id o titulo y ubica cada resultado', () => {
    const r = sesion().consultar({ comando: 'search', argumento: 'co' });
    if (r === undefined || !('salida' in r) || r.salida.command !== 'search') throw new Error('sin salida de buscar');
    expect(r.salida.results).toMatchObject([{ kind: 'node', id: 'cola', file: 'main.dg', line: 4 }]);
  });

  it('propone candidatos cercanos si el Nodo no existe', () => {
    expect(sesion().consultar({ comando: 'node', argumento: 'apj' })).toEqual({ noEncontrado: "No such Node 'apj'. Did you mean: api", suggestions: ['api'] });
  });

  it('es undefined si el Workspace tiene errores', () => {
    expect(abrirSesion({ 'main.dg': 'model {' }).consultar({ comando: 'search', argumento: 'a' })).toBeUndefined();
  });
});

describe('Sesion.consultar tema', () => {
  const conTemas = () =>
    abrirSesion({
      'main.dg': 'specification { node servicio }\nmodel { servicio a }\nview v { type architecture  include ** }\n',
      'temas.dg': 'theme base extends neutral { palette { acento "#0ea5e9" } }\ntheme hijo extends base { }\n',
    });

  it('da la cadena extends, el sitio y las Capas del Tema, como inspect theme', () => {
    const r = conTemas().consultar({ comando: 'theme', argumento: 'hijo' });
    if (r === undefined || !('salida' in r) || r.salida.command !== 'theme') throw new Error('sin salida de tema');
    expect(r.salida.theme).toMatchObject({ name: 'hijo', file: 'temas.dg', line: 2, extends: ['base', 'neutral'] });
    expect(r.salida.theme.layers.length).toBeGreaterThan(0);
  });

  it('un Tema inexistente propone los cercanos', () => {
    expect(conTemas().consultar({ comando: 'theme', argumento: 'hija' })).toEqual({ noEncontrado: "No such Theme 'hija'. Did you mean: hijo", suggestions: ['hijo'] });
  });
});
