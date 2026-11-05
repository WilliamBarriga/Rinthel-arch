import { defineConfig, mergeConfig } from 'vitest/config';

import base from '../../vitest.config.shared';

// Con vitest 4 el defecto es casi un worker por nucleo; bajo esa carga las pruebas de jsdom (arrastre, colapso)
// fallan de forma intermitente por timing. Limitarlos a 2 las estabiliza (0 fallos en 12 corridas; el suite tarda ~12 s en vez de ~7 s).
export default mergeConfig(base, defineConfig({ test: { environment: 'jsdom', maxWorkers: 2 } }));
