import { defineConfig, mergeConfig } from 'vitest/config';

import base from '../../vitest.config.shared';

// Like `shell`: with more than 2 workers the jsdom tests fail intermittently because of timing.
export default mergeConfig(base, defineConfig({ test: { maxWorkers: 2 } }));
