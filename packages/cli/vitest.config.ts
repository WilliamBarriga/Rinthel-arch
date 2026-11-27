import { defineConfig, mergeConfig } from 'vitest/config';

import base from '../../vitest.config.shared';

// The Activity log is off in tests so they leave no `activity.jsonl` in the fixtures;
// the Activity log tests pass their own `env` dependency to `run`.
export default mergeConfig(base, defineConfig({ test: { env: { DIAGRAMS_ACTIVITY: '0' } } }));
