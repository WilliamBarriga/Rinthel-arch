import { defineConfig, mergeConfig } from 'vitest/config';

import base from '../../vitest.config.shared';

// El Registro de actividad va apagado en las pruebas para no dejar `actividad.jsonl` en las fixtures;
// las pruebas del Registro pasan su propio `entorno` a `run`.
export default mergeConfig(base, defineConfig({ test: { env: { DIAGRAMS_ACTIVIDAD: '0' } } }));
