import { defineConfig, mergeConfig } from 'vitest/config';

import base from '../../vitest.config.shared';

// Igual que `shell`: con mas de 2 workers las pruebas de jsdom fallan de forma intermitente por timing.
export default mergeConfig(base, defineConfig({ test: { maxWorkers: 2 } }));
