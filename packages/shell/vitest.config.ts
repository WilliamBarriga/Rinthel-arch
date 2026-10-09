import { defineConfig, mergeConfig } from 'vitest/config';

import base from '../../vitest.config.shared';

export default mergeConfig(base, defineConfig({ test: { environment: 'jsdom' } }));
