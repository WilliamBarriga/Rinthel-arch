import { describe, expect, it } from 'vitest';

import { resolveView } from 'canonical';
import { openSession, createUndoHistory, undo, editInHistory, redo } from 'session';

import { applyInMemory } from './helpers';

const model = `specification { node servicio }
model {
  servicio cliente
  servicio sistema {
    servicio api
    servicio db
  }
  servicio cola
  servicio aux
  interaction i {
    cliente -> sistema.api "pedir"
    sistema.api -> sistema.db "consultar"
    sistema.db -> cola "evento"
    cola -> aux "log"
  }
}
`;
const withBody = (body: string) => `${model}view v {\n  type sequence\n  interaction i\n${body}}\n`;

const reorder = (text: string, order: string[]) =>
  applyInMemory({ 'main.dg': text }, { type: 'reorder-lifelines', view: 'v', order });
const visible = (text: string) => resolveView(openSession({ 'main.dg': text }).source!, 'v')!.nodes.map((n) => n.id);

describe('Intent reorder-lifelines', () => {
  it('without a previous order writes the full visible order', () => {
    const text = withBody('');
    const r = reorder(text, ['cola', 'cliente', 'sistema.api', 'sistema.db', 'aux']);
    if (!r.ok) throw new Error(r.message);
    expect(r.files['main.dg']).toBe(withBody('  order cola, cliente, sistema.api, sistema.db, aux\n'));
    expect(visible(r.files['main.dg']!)).toEqual(['cola', 'cliente', 'sistema.api', 'sistema.db', 'aux']);
  });

  it('with a partial order replaces it with the full one', () => {
    const text = withBody('  order cola, cliente\n');
    const r = reorder(text, ['aux', 'cola', 'cliente', 'sistema.api', 'sistema.db']);
    if (!r.ok) throw new Error(r.message);
    expect(r.files['main.dg']).toBe(withBody('  order aux, cola, cliente, sistema.api, sistema.db\n'));
  });

  it('writes even if the order matches the first appearance', () => {
    const text = withBody('');
    const r = reorder(text, ['cliente', 'sistema.api', 'sistema.db', 'cola', 'aux']);
    if (!r.ok) throw new Error(r.message);
    expect(r.files['main.dg']).toContain('order cliente, sistema.api, sistema.db, cola, aux');
  });

  it('entries hidden by collapsed keep their relative position', () => {
    const text = withBody('  collapsed sistema\n  order cliente, sistema.api, sistema.db, cola\n');
    // Visible: cliente, sistema, cola, aux. cola moves to the front.
    const r = reorder(text, ['cola', 'cliente', 'sistema', 'aux']);
    if (!r.ok) throw new Error(r.message);
    // The hidden children stay after their predecessor (cliente); the visible Group follows them on screen.
    expect(r.files['main.dg']).toContain('order cola, cliente, sistema.api, sistema.db, sistema, aux');
    expect(visible(r.files['main.dg']!)).toEqual(['cola', 'cliente', 'sistema', 'aux']);
  });

  it('entries hidden by exclude keep their relative position', () => {
    const text = withBody('  exclude aux\n  order cliente, aux, cola\n');
    const r = reorder(text, ['cola', 'cliente', 'sistema.api', 'sistema.db']);
    if (!r.ok) throw new Error(r.message);
    // aux was after cliente: it stays after cliente.
    expect(r.files['main.dg']).toContain('order cola, cliente, aux, sistema.api, sistema.db');
    expect(visible(r.files['main.dg']!)).toEqual(['cola', 'cliente', 'sistema.api', 'sistema.db']);
  });

  it('rejects a stale hash, a View not found and an unknown node', () => {
    const text = withBody('');
    expect(applyInMemory({ 'main.dg': text }, { type: 'reorder-lifelines', view: 'v', order: ['cliente'] }, { 'main.dg': 'viejo' })).toMatchObject({ ok: false, reason: 'stale-hash' });
    expect(applyInMemory({ 'main.dg': text }, { type: 'reorder-lifelines', view: 'nada', order: ['cliente'] })).toMatchObject({ ok: false, reason: 'unknown-view' });
    expect(reorder(text, ['ghost'])).toMatchObject({ ok: false, reason: 'invalid' });
  });

  it('undo restores the exact text and redo reapplies it', () => {
    const text = withBody('  order cola, cliente\n');
    const e = editInHistory(createUndoHistory({ 'main.dg': text }), { type: 'reorder-lifelines', view: 'v', order: ['aux', 'cola', 'cliente', 'sistema.api', 'sistema.db'] });
    if (!e.ok) throw new Error(e.message);
    const d = undo(e.history);
    expect(d?.files['main.dg']).toBe(text);
    expect(d && redo(d)?.files).toEqual(e.history.files);
  });
});
