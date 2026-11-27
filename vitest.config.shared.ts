import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    include: ['test/**/*.test.{ts,tsx}'],
    environment: 'node',
    // Several tests start the CLI, the layout or the grammar cold: on a busy machine they exceed the default 5 s.
    testTimeout: 30_000,
  },
});
