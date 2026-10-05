import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

const paquete = join(import.meta.dirname, '..');

describe('atribucion de LikeC4 (ADR 0001)', () => {
  it('conserva la licencia MIT y el copyright de LikeC4 en el paquete', () => {
    const licencia = readFileSync(join(paquete, 'LICENSE-LIKEC4'), 'utf8');

    expect(licencia).toContain('MIT License');
    expect(licencia).toContain('Copyright (c) 2023-2026 Denis Davydkov');
  });

  it('la gramatica copiada conserva el aviso de copyright de origen', () => {
    const gramatica = readFileSync(join(paquete, 'src/gramatica/diagramas.langium'), 'utf8');

    expect(gramatica).toContain('SPDX-License-Identifier: MIT');
    expect(gramatica).toContain('Copyright (c) 2023-2026 Denis Davydkov');
  });
});
