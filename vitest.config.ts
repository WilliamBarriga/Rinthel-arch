import { defineConfig } from 'vitest/config';

// Los tests de cada paquete viven en `packages/<paquete>/test` y se ejecutan con
// `pnpm -r test`; aqui solo corre el chequeo de dependencias del workspace.
export default defineConfig({
  test: {
    include: ['tests/**/*.test.ts'],
    environment: 'node',
  },
});
