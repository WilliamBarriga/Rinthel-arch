import { describe, expect, it } from 'vitest';

import { cachedGeometrySchema } from 'canonical';
import { abrirSesion } from 'sesion';

const texto = `specification { node servicio }
model {
  servicio cliente
  servicio api
  servicio db
  interaction checkout "Compra" {
    cliente -> api "POST"
    opt "hay stock" {
      api -> db "consulta"
      reply db -> api "filas"
    }
    note over api "nota"
    reply api -> cliente "201"
  }
}
view seq { type sequence
 interaction checkout }
view arq { type architecture
 include * }
`;

describe('seam sesion: la Geometria cacheada cumple el esquema de canonical', () => {
  for (const vista of ['seq', 'arq']) {
    it(`la Geometria de la Vista ${vista} valida y no pierde campos al leerla del JSON`, async () => {
      const sesion = abrirSesion({ 'main.dg': texto });
      const cacheada = await sesion.geometria(vista);
      const escrita = JSON.parse(JSON.stringify(cacheada));
      const leida = cachedGeometrySchema.safeParse(escrita);

      expect(leida.success).toBe(true);
      expect(leida.data).toEqual(escrita);
    });
  }
});
