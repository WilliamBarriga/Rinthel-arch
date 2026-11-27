import { describe, expect, it } from 'vitest';

import { canonicalFormSchema, resolveView } from 'canonical';
import type { GraphView, SequenceView } from 'canonical';
import { compile } from 'dsl';

const WORKSPACE = `
  specification {
    node service
    node table
  }
  model {
    service shop "Shop" {
      service api "API"
      service checkout "Checkout" "Proposed" planned {
        service cart "Cart"
      }
    }
    service billing "Billing" planned
    service mail "Mail"
    table orders "Orders" {
      id: uuid pk
      coupon: text? fk planned "From the PRD"
    }
    shop.api -> shop.checkout.cart
    shop.api -> mail "notifies" planned
    shop.api -> mail
    shop.api -> billing
    orders#coupon -> orders
    interaction pay "Pay" "Proposed flow" planned {
      shop.api -> mail
    }
    interaction notify {
      shop.api -> mail
      shop.api -> billing
    }
  }
  view all { type architecture  include ** }
  view data { type er  include orders }
  view paying { type sequence  interaction pay }
  view notifying { type sequence  interaction notify }
`;

function compiled() {
  const { canonical, issues } = compile({ 'main.dg': WORKSPACE });
  expect(issues).toEqual([]);
  if (canonical === undefined) throw new Error('no Canonical form');
  return canonical;
}

describe('planned mark', () => {
  it('parses on Node, Edge, Attribute and Interaction and survives the Canonical form', () => {
    const source = compiled();
    const checkout = source.model.nodes[0]!.children[1]!;
    expect(checkout).toMatchObject({ id: 'shop.checkout', title: 'Checkout', description: 'Proposed', planned: true });
    expect(checkout.children[0]!.planned).toBeUndefined();
    expect(source.model.nodes[1]).toMatchObject({ id: 'billing', planned: true });
    expect(source.model.nodes[2]!.planned).toBeUndefined();
    expect(source.model.nodes[3]!.attributes).toEqual([
      { name: 'id', type: 'uuid', notes: '', keys: ['pk'] },
      { name: 'coupon', type: 'text', notes: 'From the PRD', keys: ['fk'], optional: true, planned: true },
    ]);
    expect(source.model.edges.map((edge) => edge.planned)).toEqual([undefined, true, undefined, undefined, undefined]);
    expect(source.model.interactions.map((interaction) => [interaction.id, interaction.title, interaction.planned])).toEqual([
      ['pay', 'Pay', true],
      ['notify', 'notify', undefined],
    ]);
    expect(canonicalFormSchema.parse(JSON.parse(JSON.stringify(source)))).toEqual(source);
  });

  it('a planned Group marks its descendants and an Edge touching something planned is planned (architecture)', () => {
    const view = resolveView(compiled(), 'all') as GraphView;
    const plannedById = Object.fromEntries(view.nodes.map((node) => [node.id, node.planned === true]));
    expect(plannedById).toEqual({ shop: false, 'shop.api': false, 'shop.checkout': true, 'shop.checkout.cart': true, billing: true, mail: false, orders: false });
    expect(view.edges.map((edge) => [edge.from.node, edge.to.node, edge.planned === true])).toEqual([
      ['shop.api', 'shop.checkout.cart', true],
      ['shop.api', 'mail', false],
      ['shop.api', 'billing', true],
      ['orders', 'orders', true],
    ]);
  });

  it('a merged Edge stays planned only if every Edge it merges is', () => {
    const view = resolveView(compiled(), 'all', { collapsed: ['shop'] }) as GraphView;
    const ofShop = view.edges.filter((edge) => edge.from.node === 'shop');
    expect(ofShop.map((edge) => [edge.to.node, edge.count, edge.planned === true])).toEqual([
      ['mail', 2, false],
      ['billing', 1, true],
    ]);
  });

  it('keeps the planned Attribute in an er View', () => {
    const view = resolveView(compiled(), 'data') as GraphView;
    expect(view.nodes[0]!.attributes.map((attribute) => [attribute.name, attribute.planned === true])).toEqual([
      ['id', false],
      ['coupon', true],
    ]);
  });

  it('a Message is planned when its Interaction or one of its Lifelines is (sequence)', () => {
    const pay = resolveView(compiled(), 'paying') as SequenceView;
    expect(pay.interaction.messages.map((message) => message.planned === true)).toEqual([true]);
    const warn = resolveView(compiled(), 'notifying') as SequenceView;
    expect(warn.interaction.messages.map((message) => [message.to, message.planned === true])).toEqual([
      ['mail', false],
      ['billing', true],
    ]);
    expect(warn.nodes.map((node) => [node.id, node.planned === true])).toEqual([
      ['shop.api', false],
      ['mail', false],
      ['billing', true],
    ]);
  });

  it('situates the planned word of Edges, Attributes and Interactions with its leading space', () => {
    const { locate } = compile({ 'main.dg': WORKSPACE });
    if (locate === undefined) throw new Error('no Locator');
    const text = WORKSPACE.split('\n');
    const word = (path: (string | number)[]): string => {
      const site = locate(path);
      if (site === undefined || site === null) throw new Error(`no site for ${path.join('.')}`);
      return text[site.range.start.line - 1]!.slice(site.range.start.column - 1, site.range.end.column - 1);
    };
    expect(word(['model', 'edges', 1, 'planned'])).toBe(' planned');
    expect(word(['model', 'interactions', 0, 'planned'])).toBe(' planned');
    expect(word(['model', 'nodes', 3, 'attributes', 1, 'planned'])).toBe(' planned');
  });
});
