import { describe, expect, it } from 'vitest';

import { openSession } from 'session';

const session = () =>
  openSession({
    'main.dg': 'specification { node servicio  node db }\nmodel {\n  servicio api\n  db cola\n  api -> cola "publica"\n}\n',
    'vistas.dg': 'view v {\n  type architecture\n  include **\n}\n',
  });

describe('Session.query', () => {
  it('gives the detail of a Node with its file:line, Edges and Views', () => {
    const r = session().query({ command: 'node', argument: 'api' });
    if (r === undefined || !('output' in r) || r.output.command !== 'node') throw new Error('no node output');
    expect(r.output.node).toMatchObject({ id: 'api', type: 'servicio', file: 'main.dg', line: 3 });
    expect(r.output.edges).toMatchObject([{ from: 'api', to: 'cola', direction: 'out', label: 'publica', file: 'main.dg', line: 5 }]);
    expect(r.output.views).toMatchObject([{ id: 'v', file: 'vistas.dg', line: 1 }]);
  });

  it('searches by id or title and locates each result', () => {
    const r = session().query({ command: 'search', argument: 'co' });
    if (r === undefined || !('output' in r) || r.output.command !== 'search') throw new Error('no search output');
    expect(r.output.results).toMatchObject([{ kind: 'node', id: 'cola', file: 'main.dg', line: 4 }]);
  });

  it('proposes nearby candidates if the Node does not exist', () => {
    expect(session().query({ command: 'node', argument: 'apj' })).toEqual({ notFound: "No such Node 'apj'. Did you mean: api", suggestions: ['api'] });
  });

  it('is undefined if the Workspace has errors', () => {
    expect(openSession({ 'main.dg': 'model {' }).query({ command: 'search', argument: 'a' })).toBeUndefined();
  });
});

describe('Session.query theme', () => {
  const withThemes = () =>
    openSession({
      'main.dg': 'specification { node servicio }\nmodel { servicio a }\nview v { type architecture  include ** }\n',
      'temas.dg': 'theme base extends neutral { palette { acento "#0ea5e9" } }\ntheme hijo extends base { }\n',
    });

  it('gives the extends chain, the site and the Layers of the Theme, like inspect theme', () => {
    const r = withThemes().query({ command: 'theme', argument: 'hijo' });
    if (r === undefined || !('output' in r) || r.output.command !== 'theme') throw new Error('no theme output');
    expect(r.output.theme).toMatchObject({ name: 'hijo', file: 'temas.dg', line: 2, extends: ['base', 'neutral'] });
    expect(r.output.theme.layers.length).toBeGreaterThan(0);
  });

  it('a missing Theme proposes the nearest ones', () => {
    expect(withThemes().query({ command: 'theme', argument: 'hija' })).toEqual({ notFound: "No such Theme 'hija'. Did you mean: hijo", suggestions: ['hijo'] });
  });
});
