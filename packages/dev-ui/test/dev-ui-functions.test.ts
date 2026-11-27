import { describe, expect, it } from 'vitest';

import type { CanonicalForm } from 'canonical';
import { openSession } from 'session';

import { toDevUiHash, fromDevUiHash, devUiHash } from '../browser/canvas/dev-ui-hash';
import { viewIndex } from '../browser/views/view-index';
import { createSseReader } from '../src/sse';

const DSL = `specification {
  node servicio
}

model {
  servicio api "API"
  servicio db "Base de datos"
  api -> db
  interaction login "Login" {
    api -> db "consulta"
  }
}

view mapa {
  type architecture
  include **
  link api -> detalle
}

view detalle {
  type flow
  include api
}

view flujo {
  type sequence
  interaction login
}

view otra {
  type architecture
  include db
  link db -> mapa
}
`;

const source = (): CanonicalForm => {
  const session = openSession({ 'main.dg': DSL });
  if (session.source === undefined) throw new Error('the test Source does not compile');
  return session.source;
};

describe('View index', () => {
  it('groups by Diagram type in a fixed order and keeps the declaration order inside each group', () => {
    const index = viewIndex(source());

    expect(index.map((g) => [g.kind, g.views.map((v) => v.id)])).toEqual([
      ['architecture', ['mapa', 'otra']],
      ['flow', ['detalle']],
      ['sequence', ['flujo']],
    ]);
  });

  it('each View carries its outgoing and incoming Links', () => {
    const byId = Object.fromEntries(viewIndex(source()).flatMap((g) => g.views).map((v) => [v.id, v]));

    expect(byId['mapa']).toMatchObject({ links: ['detalle'], incoming: ['otra'] });
    expect(byId['detalle']).toMatchObject({ links: [], incoming: ['mapa'] });
    expect(byId['flujo']).toMatchObject({ links: [], incoming: [] });
  });
});

describe('UI hash (#view=<id>)', () => {
  it('translates the shell path (p) to view and back, without touching the rest', () => {
    expect(toDevUiHash('p=a&p=b&s=api')).toBe('view=a&view=b&s=api');
    expect(fromDevUiHash('#view=a&s=api')).toBe('p=a&s=api');
    expect(fromDevUiHash('')).toBe('');
  });

  it('wraps an adapter: reads and writes with view=', () => {
    let text = '#view=detalle';
    const written: string[] = [];
    const adapter = devUiHash({
      leer: () => text,
      escribir: (h) => {
        written.push(h);
        text = `#${h}`;
      },
      suscribir: () => () => undefined,
    });

    expect(adapter.leer()).toBe('p=detalle');
    adapter.escribir('p=flujo&t=1', { reemplazar: false });
    expect(written).toEqual(['view=flujo&t=1']);
  });
});

describe('SSE event reader', () => {
  it('splits named events, joins data lines and keeps the incomplete chunk', () => {
    const received: Array<[string, string]> = [];
    const read = createSseReader((name, data) => received.push([name, data]));

    read('event: estado\ndata: {"a":1}\n\n: comentario\n\nevent: actividad\r\ndata: uno\r\ndata: dos\r\n\r\nevent: histo');
    expect(received).toEqual([
      ['estado', '{"a":1}'],
      ['actividad', 'uno\ndos'],
    ]);
    read('rial\ndata: []\n\ndata: sin nombre\n\n');
    expect(received.slice(2)).toEqual([
      ['historial', '[]'],
      ['message', 'sin nombre'],
    ]);
  });
});
