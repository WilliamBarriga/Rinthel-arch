import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    include: ['test/**/*.test.{ts,tsx}'],
    environment: 'node',
    // Varias pruebas arrancan el CLI, el layout o la gramatica en frio: con la maquina cargada pasan de los 5 s por defecto.
    testTimeout: 30_000,
  },
});
