import { mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

import { salidaDeInspectSchema } from 'canonico';
import { run } from 'cli';

const WORKSPACE = `specification {
  node service
  node table
}

model {
  service shop "Shop" {
    service api "API" {
      source { path "src/api" }
    }
    service checkout "Checkout" planned {
      source { spec "prd#checkout" }
      service cart "Cart"
    }
  }
  table orders "Orders" {
    id: uuid pk
    coupon: text fk planned "From the PRD"
  }
  shop.api -> shop.checkout "pays" planned
  shop.api -> shop.checkout.cart
  interaction pay "Pay" planned {
    shop.api -> shop.checkout
  }
}

view all {
  type architecture
  include **
}
`;

function workspace(): string {
  const raiz = mkdtempSync(join(tmpdir(), 'inspect-planned-'));
  writeFileSync(join(raiz, 'main.dg'), WORKSPACE);
  return raiz;
}

describe('inspect planned', () => {
  it('--json lists the effective planned elements with their spec refs and where they are written', async () => {
    const r = await run(['inspect', 'planned', '--workspace', workspace(), '--json']);

    expect(r.exitCode, r.stderr).toBe(0);
    const salida = salidaDeInspectSchema.parse(JSON.parse(r.stdout));
    expect(salida).toEqual({
      contractVersion: 2,
      command: 'planned',
      planned: {
        nodes: [
          { id: 'shop.checkout', type: 'service', title: 'Checkout', file: 'main.dg', line: 11, spec: ['prd#checkout'], inherited: false },
          { id: 'shop.checkout.cart', type: 'service', title: 'Cart', file: 'main.dg', line: 13, spec: [], inherited: true },
        ],
        attributes: [{ node: 'orders', name: 'coupon', type: 'text', file: 'main.dg', line: 18 }],
        edges: [
          { from: 'shop.api', to: 'shop.checkout', label: 'pays', file: 'main.dg', line: 20, inherited: false },
          { from: 'shop.api', to: 'shop.checkout.cart', file: 'main.dg', line: 21, inherited: true },
        ],
        interactions: [{ id: 'pay', title: 'Pay', file: 'main.dg', line: 22 }],
      },
    });
  });

  it('prints one line per planned element in text mode', async () => {
    const r = await run(['inspect', 'planned', '--workspace', workspace()]);

    expect(r.exitCode, r.stderr).toBe(0);
    expect(r.stdout).toContain('node shop.checkout service "Checkout" main.dg:11 spec prd#checkout');
    expect(r.stdout).toContain('node shop.checkout.cart service "Cart" main.dg:13 (inherited)');
    expect(r.stdout).toContain('attribute orders#coupon main.dg:18');
    expect(r.stdout).toContain('edge shop.api -> shop.checkout "pays" main.dg:20');
    expect(r.stdout).toContain('interaction pay "Pay" main.dg:22');
    expect(r.stdout).toContain('6 planned');
  });

  it('takes no argument', async () => {
    const r = await run(['inspect', 'planned', 'x', '--workspace', workspace()]);
    expect(r.exitCode).toBe(2);
  });
});
