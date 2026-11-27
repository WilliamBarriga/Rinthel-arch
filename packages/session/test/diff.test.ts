import { describe, expect, it } from 'vitest';

import { openSession, computeDiff } from 'session';
import type { CanonicalForm } from 'canonical';

const BASE = `specification {
  node servicio
}

model {
  servicio api "API" "Atiende"
  servicio db "Base" {
    id: uuid pk
    total: decimal "en centavos"
  }
  api -> db "lee"
  api -> db "escribe"
  interaction compra "Compra" {
    pedir: api -> db "pedir"
    reply db -> api "ok"
  }
}

view general {
  type architecture
  include **
}

theme claro extends neutral {
  palette { acento "#0ea5e9" }
}
`;

const sourceOf = (text: string): CanonicalForm => {
  const source = openSession({ 'main.dg': text }).source;
  if (source === undefined) throw new Error('the test DSL does not compile');
  return source;
};

const diff = (after: string, before = BASE) => computeDiff(sourceOf(before), sourceOf(after));

describe('computeDiff', () => {
  it('two equal Canonical forms have no Diff', () => {
    expect(diff(BASE)).toEqual({ agregados: [], quitados: [], cambiados: [] });
  });

  it('a new Node is added; a missing one, removed', () => {
    expect(diff(BASE.replace('servicio api "API" "Atiende"', 'servicio api "API" "Atiende"\n  servicio cola "Cola"'))).toEqual({
      agregados: [{ kind: 'node', id: 'cola' }],
      quitados: [],
      cambiados: [],
    });
  });

  it('a rename is a removal plus an addition, not a change', () => {
    const r = diff(BASE.replace('interaction compra', 'interaction compra2').replace('view general', 'view todo'));
    expect(r.quitados).toEqual(expect.arrayContaining([{ kind: 'interaction', id: 'compra' }, { kind: 'view', id: 'general' }]));
    expect(r.agregados).toEqual(expect.arrayContaining([{ kind: 'interaction', id: 'compra2' }, { kind: 'view', id: 'todo' }]));
  });

  it('the changed properties of a Node are labelled text (title, description) or structure (type)', () => {
    const r = diff(BASE.replace('servicio api "API" "Atiende"', 'servicio api "API v2" "Atiende todo"'));
    expect(r.cambiados).toEqual([
      {
        elemento: { kind: 'node', id: 'api' },
        propiedades: [
          { nombre: 'title', clase: 'texto' },
          { nombre: 'description', clase: 'texto' },
        ],
      },
    ]);
  });

  it('an Attribute is identified by Node and name: changing its type is structure and its notes, text', () => {
    const r = diff(BASE.replace('total: decimal "en centavos"', 'total: integer "en pesos"'));
    expect(r.cambiados).toEqual([
      {
        elemento: { kind: 'attribute', node: 'db', name: 'total' },
        propiedades: [
          { nombre: 'type', clase: 'estructura' },
          { nombre: 'notes', clase: 'texto' },
        ],
      },
    ]);
  });

  it('an Edge is identified by from, to and ordinal within the pair: changing the label of the second one is text', () => {
    const r = diff(BASE.replace('api -> db "escribe"', 'api -> db "guarda"'));
    expect(r.cambiados).toEqual([{ elemento: { kind: 'edge', from: 'api', to: 'db', ordinal: 1 }, propiedades: [{ nombre: 'label', clase: 'texto' }] }]);
  });

  it('a Message with id is identified by id; without id, by Interaction and position; its ends are structure', () => {
    const r = diff(BASE.replace('pedir: api -> db "pedir"', 'pedir: api -> api "pedir"').replace('reply db -> api "ok"', 'reply db -> api "listo"'));
    expect(r.cambiados).toEqual([
      { elemento: { kind: 'message', interaction: 'compra', id: 'pedir', position: 0, path: '0' }, propiedades: [{ nombre: 'to', clase: 'estructura' }] },
      { elemento: { kind: 'message', interaction: 'compra', position: 1, path: '1' }, propiedades: [{ nombre: 'label', clase: 'texto' }] },
    ]);
  });

  it('the Theme of a View and its Steps are structure; a Theme is identified by name', () => {
    const r = diff(BASE.replace('include **', 'include **\n  theme claro').replace('acento "#0ea5e9"', 'acento "#f43f5e"'));
    expect(r.cambiados).toEqual([
      { elemento: { kind: 'view', id: 'general' }, propiedades: [{ nombre: 'theme', clase: 'estructura' }] },
      { elemento: { kind: 'theme', name: 'claro' }, propiedades: [{ nombre: 'palette', clase: 'estructura' }] },
    ]);
  });
});
