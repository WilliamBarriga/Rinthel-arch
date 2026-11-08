import { describe, expect, it } from 'vitest';

import { destinoDeRef } from 'canonico';

const vista = (id: string, type: string, interaction?: string) => ({ id, type, ...(interaction !== undefined && { interaction }) }) as Parameters<typeof destinoDeRef>[0][number];

describe('destinoDeRef', () => {
  it('es la primera Vista de secuencia declarada que proyecta la Interaccion', () => {
    const vistas = [vista('arq', 'architecture'), vista('b', 'sequence', 'login'), vista('a', 'sequence', 'login'), vista('c', 'sequence', 'otra')];
    expect(destinoDeRef(vistas, 'login')).toBe('b');
  });

  it('es undefined si ninguna Vista de secuencia la proyecta', () => {
    expect(destinoDeRef([vista('arq', 'architecture'), vista('c', 'sequence', 'otra')], 'login')).toBeUndefined();
  });
});
