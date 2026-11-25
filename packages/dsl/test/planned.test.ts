import { describe, expect, it } from 'vitest';

import { fuenteCanonicaSchema, resolveView } from 'canonico';
import type { VistaDeGrafo, VistaDeSecuencia } from 'canonico';
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
  const { canonico, issues } = compile({ 'main.dg': WORKSPACE });
  expect(issues).toEqual([]);
  if (canonico === undefined) throw new Error('no Canonical form');
  return canonico;
}

describe('planned mark', () => {
  it('parses on Node, Edge, Attribute and Interaction and survives the Canonical form', () => {
    const fuente = compiled();
    const checkout = fuente.model.nodes[0]!.children[1]!;
    expect(checkout).toMatchObject({ id: 'shop.checkout', title: 'Checkout', description: 'Proposed', planned: true });
    expect(checkout.children[0]!.planned).toBeUndefined();
    expect(fuente.model.nodes[1]).toMatchObject({ id: 'billing', planned: true });
    expect(fuente.model.nodes[2]!.planned).toBeUndefined();
    expect(fuente.model.nodes[3]!.attributes).toEqual([
      { name: 'id', type: 'uuid', notes: '', keys: ['pk'] },
      { name: 'coupon', type: 'text', notes: 'From the PRD', keys: ['fk'], optional: true, planned: true },
    ]);
    expect(fuente.model.edges.map((arista) => arista.planned)).toEqual([undefined, true, undefined, undefined, undefined]);
    expect(fuente.model.interactions.map((interaccion) => [interaccion.id, interaccion.title, interaccion.planned])).toEqual([
      ['pay', 'Pay', true],
      ['notify', 'notify', undefined],
    ]);
    expect(fuenteCanonicaSchema.parse(JSON.parse(JSON.stringify(fuente)))).toEqual(fuente);
  });

  it('a planned Group marks its descendants and an Edge touching something planned is planned (architecture)', () => {
    const vista = resolveView(compiled(), 'all') as VistaDeGrafo;
    const planeados = Object.fromEntries(vista.nodes.map((nodo) => [nodo.id, nodo.planned === true]));
    expect(planeados).toEqual({ shop: false, 'shop.api': false, 'shop.checkout': true, 'shop.checkout.cart': true, billing: true, mail: false, orders: false });
    expect(vista.edges.map((arista) => [arista.from.node, arista.to.node, arista.planned === true])).toEqual([
      ['shop.api', 'shop.checkout.cart', true],
      ['shop.api', 'mail', false],
      ['shop.api', 'billing', true],
      ['orders', 'orders', true],
    ]);
  });

  it('a merged Edge stays planned only if every Edge it merges is', () => {
    const vista = resolveView(compiled(), 'all', { collapsed: ['shop'] }) as VistaDeGrafo;
    const deShop = vista.edges.filter((arista) => arista.from.node === 'shop');
    expect(deShop.map((arista) => [arista.to.node, arista.count, arista.planned === true])).toEqual([
      ['mail', 2, false],
      ['billing', 1, true],
    ]);
  });

  it('keeps the planned Attribute in an er View', () => {
    const vista = resolveView(compiled(), 'data') as VistaDeGrafo;
    expect(vista.nodes[0]!.attributes.map((atributo) => [atributo.name, atributo.planned === true])).toEqual([
      ['id', false],
      ['coupon', true],
    ]);
  });

  it('a Message is planned when its Interaction or one of its Lifelines is (sequence)', () => {
    const pagar = resolveView(compiled(), 'paying') as VistaDeSecuencia;
    expect(pagar.interaction.messages.map((mensaje) => mensaje.planned === true)).toEqual([true]);
    const avisar = resolveView(compiled(), 'notifying') as VistaDeSecuencia;
    expect(avisar.interaction.messages.map((mensaje) => [mensaje.to, mensaje.planned === true])).toEqual([
      ['mail', false],
      ['billing', true],
    ]);
    expect(avisar.nodes.map((nodo) => [nodo.id, nodo.planned === true])).toEqual([
      ['shop.api', false],
      ['mail', false],
      ['billing', true],
    ]);
  });

  it('situates the planned word of Edges, Attributes and Interactions with its leading space', () => {
    const { ubicar } = compile({ 'main.dg': WORKSPACE });
    if (ubicar === undefined) throw new Error('no ubicar');
    const texto = WORKSPACE.split('\n');
    const palabra = (ruta: (string | number)[]): string => {
      const sitio = ubicar(ruta);
      if (sitio === undefined || sitio === null) throw new Error(`no site for ${ruta.join('.')}`);
      return texto[sitio.range.start.line - 1]!.slice(sitio.range.start.column - 1, sitio.range.end.column - 1);
    };
    expect(palabra(['model', 'edges', 1, 'planned'])).toBe(' planned');
    expect(palabra(['model', 'interactions', 0, 'planned'])).toBe(' planned');
    expect(palabra(['model', 'nodes', 3, 'attributes', 1, 'planned'])).toBe(' planned');
  });
});
