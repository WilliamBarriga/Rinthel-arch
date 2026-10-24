import { describe, expect, it } from 'vitest';

import { ESTADOS, parsearEstado } from 'tema';

describe('parsearEstado', () => {
  it('reconoce cada estado de la cascada', () => {
    for (const estado of ESTADOS) expect(parsearEstado(estado)).toEqual({ estado });
  });

  it('un estado desconocido da el codigo, el mensaje con los disponibles y los candidatos cercanos', () => {
    const r = parsearEstado('hovr');
    expect(r).toMatchObject({ error: { code: 'E_THEME_UNKNOWN_STATE', candidatos: ['hover'] } });
    expect('error' in r && r.error.message).toContain(`disponibles: ${ESTADOS.join(', ')}`);
  });
});
