import { defineConfig, mergeConfig } from 'vitest/config';

import base from '../../vitest.config.shared';

// With vitest 4 the default is almost one worker per core; under that load the jsdom tests (drag, collapse)
// fail intermittently because of timing. Limiting them to 2 stabilizes them (0 failures in 12 runs; the suite takes ~12 s instead of ~7 s).
export default mergeConfig(base, defineConfig({ test: { environment: 'jsdom', maxWorkers: 2 } }));
