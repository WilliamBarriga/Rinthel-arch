import { defineConfig } from 'tsup';

import shared from '../../tsup.config.shared';

// La entrada de Node, el protocolo, la suite de contrato (solo pruebas, `vitest` externo) y `construir` (el bundle de la
// app; `esbuild` queda externo porque lleva un binario nativo); los estaticos del navegador los produce
// `scripts/construir.ts` despues.
export default defineConfig({
  ...(shared as object),
  entry: ['src/index.ts', 'src/protocolo.ts', 'src/contrato.ts', 'src/construir.ts'],
  external: ['esbuild'],
});
