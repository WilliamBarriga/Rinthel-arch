import { defineConfig } from 'tsup';

import shared from '../../tsup.config.shared';

export default defineConfig({ ...(shared as object), entry: ['src/index.ts', 'src/bin.ts'] });
