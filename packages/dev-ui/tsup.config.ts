import { defineConfig } from 'tsup';

import shared from '../../tsup.config.shared';

// The Node entry, the protocol, the contract suite (tests only, `vitest` external) and `build` (the app bundle;
// `esbuild` stays external because it ships a native binary); the browser static assets are produced afterwards by
// `scripts/build.ts`.
export default defineConfig({
  ...(shared as object),
  entry: ['src/index.ts', 'src/protocol.ts', 'src/contract.ts', 'src/build.ts'],
  external: ['esbuild'],
});
