import { defineConfig } from 'tsup';

import shared from '../../tsup.config.shared';

// La entrada de Node, el protocolo y la suite de contrato (solo pruebas, `vitest` externo); los estaticos del navegador
// los produce `scripts/construir.ts` despues.
export default defineConfig({ ...(shared as object), entry: ['src/index.ts', 'src/protocolo.ts', 'src/contrato.ts'] });
