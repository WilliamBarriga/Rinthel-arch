import { defineConfig } from 'tsup';

import shared from '../../tsup.config.shared';

// Solo la entrada de Node y el protocolo; los estaticos del navegador los produce `scripts/construir.ts` despues.
export default defineConfig({ ...(shared as object), entry: ['src/index.ts', 'src/protocolo.ts'] });
