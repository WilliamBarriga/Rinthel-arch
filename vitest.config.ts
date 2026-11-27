import { defineConfig } from 'vitest/config';

// Each package's tests live in `packages/<package>/test` and run with
// `pnpm -r test`; only the root tests (`tests/`) run here.
export default defineConfig({
  test: {
    include: ['tests/**/*.test.ts'],
    environment: 'node',
  },
});
