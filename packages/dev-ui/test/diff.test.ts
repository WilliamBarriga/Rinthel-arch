import { describe, expect, it } from 'vitest';

import type { CanonicalForm } from 'canonical';
import { openSession, computeDiff } from 'session';

import type { DevDiff, DiffElement } from '../src/protocol';
import { projectDiff, mergeDiff, visitView, expireHighlight } from '../browser/diff/projection';

const DSL = `specification {
  node servicio
}

model {
  servicio api "API"
  servicio db "Base" {
    servicio tabla "Tabla"
  }
  api -> db.tabla "lee"
  interaction compra "Compra" {
    api -> db "pedir"
  }
}

view general {
  type architecture
  include **
  theme claro
  steps { step "solo api" { show api } }
}

view plegada {
  type architecture
  include **
  collapsed db
}

view secuencia {
  type sequence
  interaction compra
}

theme claro extends neutral {
  palette { acento "#0ea5e9" }
}
`;

const source: CanonicalForm = openSession({ 'main.dg': DSL }).source!;

const node = (id: string): DiffElement => ({ kind: 'node', id });

describe('projectDiff', () => {
  it('in the active View, what was added or changed and is visible is highlighted; the other Views that show it are marked in the index', () => {
    const p = projectDiff([node('api')], source, { view: 'plegada' });
    expect(p.canvas).toEqual(['api']);
    expect(p.index).toEqual(['general', 'secuencia']);
  });

  it('an element inside a collapsed Group rises to the Group, and so does its Edge', () => {
    const p = projectDiff([node('db.tabla'), { kind: 'edge', from: 'api', to: 'db.tabla', ordinal: 0 }, { kind: 'attribute', node: 'db.tabla', name: 'id' }], source, { view: 'plegada' });
    expect(p.canvas).toEqual(['db', 'api -> db']);
  });

  it('hidden in the current Step it is not highlighted and the active View is marked in the index', () => {
    const p = projectDiff([node('db.tabla'), node('api')], source, { view: 'general', step: 1 });
    expect(p.canvas).toEqual(['api']);
    expect(p.index).toContain('general');
  });

  it('a Message is highlighted in the sequence View that projects its Interaction', () => {
    const p = projectDiff([{ kind: 'message', interaction: 'compra', position: 0, path: '0' }], source, { view: 'secuencia' });
    expect(p.canvas).toEqual(['compra:0']);
    expect(projectDiff([{ kind: 'interaction', id: 'compra' }], source, { view: 'general' }).index).toEqual(['secuencia']);
  });

  it('a Theme change marks the gallery and, if it is the active View one, says so', () => {
    expect(projectDiff([{ kind: 'theme', name: 'claro' }], source, { view: 'general' })).toMatchObject({ themes: ['claro'], viewTheme: 'claro' });
    expect(projectDiff([{ kind: 'theme', name: 'claro' }], source, { view: 'plegada' })).toMatchObject({ themes: ['claro'], viewTheme: undefined });
  });

  it('the Theme notice covers the effective one: neutral in a View without theme', () => {
    expect(projectDiff([{ kind: 'theme', name: 'neutral' }], source, { view: 'plegada' })).toMatchObject({ viewTheme: 'neutral' });
    expect(projectDiff([{ kind: 'theme', name: 'neutral' }], source, { view: 'general' })).toMatchObject({ viewTheme: undefined });
  });

  it('the Theme notice covers the extends chain: changing the parent notifies in the View of the child', () => {
    const withParent = (accent: string) =>
      openSession({ 'main.dg': DSL.replace('theme claro extends neutral {', `theme base extends neutral {\n  palette { acento "${accent}" }\n}\n\ntheme claro extends base {`).replace('  palette { acento "#0ea5e9" }\n', '') }).source!;
    const before = withParent('#111111');
    const after = withParent('#222222');
    const { cambiados: changed } = computeDiff(before, after);
    expect(projectDiff(changed.map((c) => c.elemento), after, { view: 'general' })).toMatchObject({ viewTheme: 'claro' });
  });

  it('an Edge is projected by its ordinal inside the pair of Nodes', () => {
    const er = openSession({
      'er.dg': `specification { node tabla }
model {
  tabla pedidos "Pedidos" {
    cliente_id: uuid fk
    vendedor_id: uuid fk
  }
  tabla personas "Personas" { id: uuid pk }
  pedidos#cliente_id "0..*" -> "1" personas#id
  pedidos#vendedor_id "0..*" -> "1" personas#id
}
view datos {
  type er
  include **
}
`,
    }).source!;
    const edge = (ordinal: number): DiffElement => ({ kind: 'edge', from: 'pedidos', to: 'personas', ordinal });
    expect(projectDiff([edge(0)], er, { view: 'datos' }).canvas).toEqual(['pedidos#cliente_id -> personas#id']);
    expect(projectDiff([edge(1)], er, { view: 'datos' }).canvas).toEqual(['pedidos#vendedor_id -> personas#id']);
  });

  it('a changed View is marked in the index unless it is the active one', () => {
    expect(projectDiff([{ kind: 'view', id: 'plegada' }, { kind: 'view', id: 'general' }], source, { view: 'general' }).index).toEqual(['plegada']);
  });
});

/** Nothing highlighted. */
const EMPTY = { canvas: [], index: [], themes: [], removed: [] };

const diff = (version: number, extra: Partial<DevDiff> = {}): DevDiff => ({ version, origen: 'externo', agregados: [], quitados: [], cambiados: [], ...extra });

describe('highlight of external Diffs', () => {
  it('bursts merge and each touched element restarts its time; when it expires it stops being highlighted', () => {
    let r = mergeDiff(EMPTY, diff(1, { agregados: [node('api')] }), { source, view: 'general', now: 0, durationMs: 5000 });
    r = mergeDiff(r, diff(2, { cambiados: [{ elemento: node('db'), propiedades: [{ nombre: 'title', clase: 'texto' }] }] }), { source, view: 'general', now: 3000, durationMs: 5000 });
    expect(r.canvas.map((e) => e.element)).toEqual([node('api'), node('db')]);
    r = expireHighlight(r, 5000);
    expect(r.canvas.map((e) => e.element)).toEqual([node('db')]);
    r = mergeDiff(r, diff(3, { cambiados: [{ elemento: node('db'), propiedades: [{ nombre: 'title', clase: 'texto' }] }] }), { source, view: 'general', now: 7000, durationMs: 5000 });
    expect(expireHighlight(r, 9000).canvas).toEqual([{ element: node('db'), to: 12000 }]);
  });

  it('what was removed lasts until the next external Diff; the index is cleared when the View is visited', () => {
    let r = mergeDiff(EMPTY, diff(1, { quitados: [node('cola')], agregados: [node('api')] }), { source, view: 'secuencia', now: 0, durationMs: 5000 });
    expect(r.removed).toEqual([node('cola')]);
    expect(r.index).toEqual(['general', 'plegada']);
    r = visitView(r, 'general');
    expect(r.index).toEqual(['plegada']);
    r = mergeDiff(r, diff(2, { agregados: [node('db')] }), { source, view: 'secuencia', now: 10, durationMs: 5000 });
    expect(r.removed).toEqual([]);
  });
});
