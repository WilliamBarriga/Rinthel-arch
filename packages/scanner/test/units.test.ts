import { describe, expect, it } from 'vitest';

import { SPLIT_MIN_FILES, scan } from 'scanner';

import { json, makeRepo } from './repos';

/** A single-manifest app with more than `SPLIT_MIN_FILES` files, spread over nested folders. */
function largeApp(): Record<string, string> {
  const files: Record<string, string> = {
    'package.json': json({ name: 'shop', private: true }),
    'src/main.ts': "import { cart } from './cart/cart';\nimport { pay } from './checkout/pay/stripe';\nexport const run = () => [cart, pay];\n",
    'src/cart/cart.ts': "import { price } from '../catalog/price';\nexport const cart = price;\n",
    // Split so `pnpm check:deps`, which reads import-like strings, does not take it for an import leaving the package.
    'src/checkout/pay/stripe.ts': "import { price } from " + "'../../catalog/price';\nexport const pay = price;\n",
    'src/catalog/price.ts': 'export const price = 1;\n',
  };
  for (let i = 0; i < SPLIT_MIN_FILES; i++) files[`src/catalog/items/item${String(i).padStart(2, '0')}.ts`] = `export const item = ${i};\n`;
  return files;
}

describe('scan: single-manifest app', () => {
  it('splits a large manifest into folder sub-units up to depth 2 and aggregates dependencies at that level', async () => {
    const draft = await scan(makeRepo(largeApp()));

    expect(draft.units.map(({ id, kind, parent, files, confidence }) => [id, kind, parent, files, confidence])).toEqual([
      ['.', 'app', null, 1, 'extracted'],
      ['src', 'folder', '.', 1, 'inferred'],
      ['src/cart', 'folder', 'src', 1, 'inferred'],
      ['src/catalog', 'folder', 'src', 1 + SPLIT_MIN_FILES, 'inferred'],
      ['src/checkout', 'folder', 'src', 1, 'inferred'],
    ]);
    expect(draft.units[1]).toMatchObject({ name: 'src', source: { file: 'src', line: 0 } });
    expect(draft.dependencies.map(({ id, weight }) => [id, weight])).toEqual([
      ['src->src/cart', 1],
      ['src->src/checkout', 1],
      ['src/cart->src/catalog', 1],
      ['src/checkout->src/catalog', 1],
    ]);
  });

  it('--depth sets how deep the split goes; 0 never splits', async () => {
    const root = makeRepo(largeApp());

    expect((await scan(root, { depth: 1 })).units.map(({ id }) => id)).toEqual(['.', 'src']);
    expect((await scan(root, { depth: 3 })).units.map(({ id }) => id)).toEqual([
      '.',
      'src',
      'src/cart',
      'src/catalog',
      'src/catalog/items',
      'src/checkout',
      'src/checkout/pay',
    ]);
    expect((await scan(root, { depth: 0 })).units.map(({ id }) => id)).toEqual(['.']);
  });

  it('leaves a small manifest whole', async () => {
    const draft = await scan(makeRepo({ 'package.json': json({ name: 'tiny' }), 'src/a/x.ts': "import './y';\n", 'src/a/y.ts': '' }));

    expect(draft.units.map(({ id }) => id)).toEqual(['.']);
    expect(draft.dependencies).toEqual([]);
  });

  it('without a root manifest the root is an inferred folder unit named after the folder', async () => {
    const root = makeRepo({ 'tools/a.ts': '' });
    const draft = await scan(root);

    expect(draft.units).toEqual([
      {
        id: '.',
        name: root.slice(root.lastIndexOf('/') + 1),
        kind: 'folder',
        parent: null,
        languages: ['typescript'],
        files: 1,
        source: { file: '.', line: 0 },
        confidence: 'inferred',
      },
    ]);
  });
});
